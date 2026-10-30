import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as format from '../src/handwriting/fontFormat.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/handwriting/files.native.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function files() {
  const data = new Map(), state = { fail: false, shared: null }, mod = { exports: {} }
  const fs = {
    documentDirectory: 'file:///docs/', cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    makeDirectoryAsync: async () => {},
    getInfoAsync: async uri => ({ exists: data.has(uri), size: data.get(uri)?.length }),
    async writeAsStringAsync(uri, text, options) { data.set(uri, options.encoding === 'base64' ? format.fromBase64(text) : text); if (state.fail) throw new Error('disk full') },
    async moveAsync({ from, to }) { data.set(to, data.get(from)); data.delete(from) },
    async deleteAsync(uri) { data.delete(uri) },
    readAsStringAsync: async uri => data.get(uri),
    readDirectoryAsync: async () => [...data.keys()].filter(uri => uri.startsWith('file:///docs/dio-handwriting-workflow/')).map(uri => uri.split('/').at(-1)),
  }
  const deps = { 'expo-file-system/legacy': fs, 'expo-file-system': {}, 'expo-document-picker': {},
    'expo-sharing': { isAvailableAsync: async () => true, async shareAsync(uri, options) { state.shared = { text: data.get(uri), options } } },
    'react-native': { Platform: { OS: 'ios' } }, './fontFormat.js': format }
  new Function('require', 'module', 'exports', code)(id => deps[id], mod, mod.exports)
  return { ...mod.exports, data, state }
}
test('네이티브 폰트 저장은 부분 파일을 정리하고 기존 파일을 덮어쓰지 않는다', async () => {
  const f = files(), id = '11111111-2222-4333-8444-555555555555', bytes = new Uint8Array([1, 2, 3])
  f.state.fail = true
  await assert.rejects(f.saveFontBytes(id, bytes), /disk full/)
  assert.equal(f.data.size, 0)
  f.state.fail = false
  const uri = await f.saveFontBytes(id, bytes)
  await assert.rejects(f.saveFontBytes(id, new Uint8Array([4])), /충돌/)
  assert.deepEqual(f.data.get(uri), bytes)
  await assert.rejects(f.removeFontBytes('../existing'), /올바르지/)
  assert.deepEqual(f.data.get(uri), bytes)
})
test('iPad 로컬 이관은 공유 창에 JSON을 전달하고 임시 파일을 정리한다', async () => {
  const f = files(), text = JSON.stringify({ kind: 'dio-font', spacingVersion: 'ink-bounds-v1' })
  assert.equal(await f.writeLocalPackage('보정.json', text), true)
  assert.equal(f.state.shared.text, text)
  assert.equal(f.state.shared.options.UTI, 'public.json')
  assert.equal(f.data.size, 0)
})

test('네이티브 작업 파일은 큰 한글 입력을 검증 후 저장하고 실패·충돌·정리로 원본을 잃지 않는다', async () => {
  const f = files(), ref = '11111111-2222-4333-8444-555555555555', other = '11111111-2222-4333-8444-666666666666'
  const text = JSON.stringify({ draft: '한글'.repeat(400000) })
  f.state.fail = true
  await assert.rejects(f.workflowBlobs.write(ref, text), /disk full/)
  assert.equal(f.data.size, 0)
  f.state.fail = false; await f.workflowBlobs.write(ref, text)
  assert.equal(await f.workflowBlobs.read(ref), text)
  await assert.rejects(f.workflowBlobs.write(ref, 'overwrite'), /충돌/)
  await f.workflowBlobs.write(other, 'orphan')
  await f.workflowBlobs.prune(new Set([ref]))
  assert.equal(await f.workflowBlobs.read(ref), text); assert.equal(f.data.size, 1)
  assert.throws(() => f.workflowBlobs.read('../outside'), /ID/)
})
