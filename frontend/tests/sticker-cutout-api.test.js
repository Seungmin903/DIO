import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/stickerCutoutApi.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const id = '123e4567-e89b-12d3-a456-426614174000'
const response = (status, body, bytes = new Uint8Array()) => ({
  status, ok: status >= 200 && status < 300, json: async () => body, arrayBuffer: async () => bytes.buffer,
})

function fixture(responses) {
  const calls = [], tokens = [], cached = []
  const auth = {
    getCurrentUserId: () => '1', getSessionKey: () => '1:1',
    getAccessToken: async options => { tokens.push(options); return 'token' },
    getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }),
  }
  const mod = { exports: {} }
  const previousDev = globalThis.__DEV__
  globalThis.__DEV__ = false
  new Function('require', 'module', 'exports', code)(name => ({
    'expo-file-system': { File: class {} },
    'expo/fetch': { fetch: async (url, options) => { calls.push({ url, options }); const next = responses.shift(); return typeof next === 'function' ? next(url, options) : next } },
    '../../auth/authService': { apiBaseUrl: 'https://api.example/api/v1', authService: auth },
    './canvasMediaFiles': { canvasMediaFiles: { save: async (...args) => cached.push(args) } },
  })[name], mod, mod.exports)
  globalThis.__DEV__ = previousDev
  return { api: mod.exports.stickerCutoutApi, calls, tokens, cached }
}

test('분할 요청은 401이면 토큰을 새로고침해 한 번만 재시도한다', async () => {
  const ui = fixture([response(401, { detail: 'expired' }), response(200, { preview: 'data:image/png;base64,test' })])
  const result = await ui.api.segment(id, [{ mode: 'include', size: .1, points: [{ x: .5, y: .5 }] }])
  assert.equal(result.preview, 'data:image/png;base64,test')
  assert.equal(ui.calls.length, 2)
  assert.equal(ui.calls[0].url, `https://api.example/api/v1/sticker-cutouts/${id}/segment`)
  assert.equal(ui.tokens[1].forceRefresh, true)
  assert.equal(ui.calls[1].options.headers['Content-Type'], 'application/json')
})

test('저장 완료 미디어는 별도 캐시 단계에서 내려받아 등록한다', async () => {
  const ui = fixture([response(200, null, new Uint8Array([137, 80, 78, 71]))])
  await ui.api.cache(id)
  assert.equal(ui.calls[0].url, `https://api.example/api/v1/media/${id}/file`)
  assert.deepEqual(ui.cached, [[id, new Uint8Array([137, 80, 78, 71])]])
})

test('본문 다운로드가 멈추면 제한 시간이 지난 뒤 요청을 끝낸다', async (t) => {
  const originalSetTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout
  let expire
  globalThis.setTimeout = callback => { expire = callback; return 1 }
  globalThis.clearTimeout = () => {}
  t.after(() => { globalThis.setTimeout = originalSetTimeout; globalThis.clearTimeout = originalClearTimeout })
  const ui = fixture([(_url, options) => ({ status: 200, ok: true, json: async () => ({}), arrayBuffer: () => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(new Error('body aborted')))
  }) })])
  const pending = ui.api.cache(id)
  await new Promise(resolve => setImmediate(resolve))
  expire()
  await assert.rejects(pending, error => error.status === 408 && /응답이 늦어요/.test(error.message))
})

test('사진 업로드는 같은 multipart 본문으로 401 재시도하고 웹 File도 그대로 보낸다', async (t) => {
  const previousFormData = globalThis.FormData
  class TestFormData { constructor() { this.parts = [] } append(...part) { this.parts.push(part) } }
  globalThis.FormData = TestFormData
  t.after(() => { globalThis.FormData = previousFormData })
  const ui = fixture([response(401, { detail: 'expired' }), response(201, { cutoutId: id, width: 100, height: 200 })])
  const opened = await ui.api.open({ uri: 'file:///photo.png', name: 'photo.png', mimeType: 'image/png' })
  assert.equal(opened.cutoutId, id)
  assert.equal(ui.calls.length, 2)
  assert.equal(ui.calls[0].url, 'https://api.example/api/v1/sticker-cutouts')
  assert.equal(ui.calls[0].options.body, ui.calls[1].options.body)
  const [name, nativePart] = ui.calls[0].options.body.parts[0]
  assert.equal(name, 'file')
  assert.equal(nativePart.uri, 'file:///photo.png')
  assert.equal(typeof nativePart.bytes, 'function')

  const web = fixture([response(201, { cutoutId: id, width: 100, height: 200 })])
  const file = { name: 'web.png' }
  await web.api.open({ uri: 'blob:photo', file, name: 'web.png' })
  assert.deepEqual(web.calls[0].options.body.parts[0], ['file', file, 'web.png'])
})

test('저장 응답을 검증하고 닫기·미사용 결과 삭제 요청은 204를 허용한다', async () => {
  const strokes = [{ mode: 'include', size: .1, points: [{ x: .5, y: .5 }] }]
  const saved = fixture([response(201, { mediaFileId: id }), response(204, null), response(204, null)])
  assert.equal((await saved.api.save(id, strokes)).mediaFileId, id)
  await saved.api.close(id)
  await saved.api.discard(id)
  assert.equal(saved.calls[0].url, `https://api.example/api/v1/sticker-cutouts/${id}/save`)
  assert.equal(saved.calls[1].options.method, 'DELETE')
  assert.equal(saved.calls[2].url, `https://api.example/api/v1/media/${id}`)
  const invalid = fixture([response(201, { mediaFileId: 'bad' })])
  await assert.rejects(invalid.api.save(id, strokes), /저장 응답/)
})
