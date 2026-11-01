import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/dev/devAccess.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })

function load({ dev = false, env = {}, store = {} } = {}) {
  const storage = { STORAGE_KEYS: { doc: 'doc', diaries: 'diaries' },
    loadJSON: async (key, fallback) => key in store ? store[key] : fallback,
    saveJSON: async (key, value) => { store[key] = value },
    removeJSON: async (key) => { delete store[key] } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', '__DEV__', 'process', code)(() => storage, module, module.exports, dev, { env })
  return { ...module.exports, store }
}

test('개발자 모드 고르기는 개발 빌드 또는 EXPO_PUBLIC_DEV_ACCESS=true 일 때만 켜진다', () => {
  assert.equal(load({ dev: true }).DEV_ACCESS, true)
  assert.equal(load({ dev: false }).DEV_ACCESS, false)
  assert.equal(load({ dev: false, env: { EXPO_PUBLIC_DEV_ACCESS: 'true' } }).DEV_ACCESS, true)
})

test('예전 예시 다이어리만 지우고 사용자가 만든 다이어리는 남긴다', async () => {
  const mine = { id: 'd-1', title: '내 다이어리' }
  const { clearMockLibrary, store } = load({ store: {
    'dio:dev:mock-seeded:v1': true,
    'doc:mock-travel': {}, 'doc:mock-study': {}, 'doc:d-1': { pages: [] },
    diaries: [{ id: 'mock-travel' }, mine, { id: 'mock-class' }],
  } })
  await clearMockLibrary()
  assert.deepEqual(store.diaries, [mine])
  assert.deepEqual(Object.keys(store).sort(), ['diaries', 'doc:d-1'])
})
