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
    'expo/fetch': { fetch: async (url, options) => { calls.push({ url, options }); return responses.shift() } },
    '../../auth/authService': { apiBaseUrl: 'https://api.example/api', authService: auth },
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
  assert.equal(ui.tokens[1].forceRefresh, true)
  assert.equal(ui.calls[1].options.headers['Content-Type'], 'application/json')
})

test('저장 완료 미디어는 별도 캐시 단계에서 내려받아 등록한다', async () => {
  const ui = fixture([response(200, null, new Uint8Array([137, 80, 78, 71]))])
  await ui.api.cache(id)
  assert.equal(ui.calls[0].url, `https://api.example/api/v1/media/${id}/file`)
  assert.deepEqual(ui.cached, [[id, new Uint8Array([137, 80, 78, 71])]])
})
