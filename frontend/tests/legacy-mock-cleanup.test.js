import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/services/legacyMockCleanup.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })

function load(store) {
  const storage = { STORAGE_KEYS: { doc: 'doc', diaries: 'diaries' },
    loadJSON: async (key, fallback) => key in store ? store[key] : fallback,
    saveJSON: async (key, value) => { store[key] = value },
    removeJSON: async (key) => { delete store[key] } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(() => storage, module, module.exports)
  return module.exports
}

test('예전 예시 다이어리만 지우고 사용자가 만든 다이어리는 남긴다', async () => {
  const mine = { id: 'd-1', title: '내 다이어리' }
  const store = {
    'dio:dev:mock-seeded:v1': true,
    'doc:mock-travel': {}, 'doc:mock-study': {}, 'doc:d-1': { pages: [] },
    diaries: [{ id: 'mock-travel' }, mine, { id: 'mock-class' }],
  }
  await load(store).clearMockLibrary()
  assert.deepEqual(store.diaries, [mine])
  assert.deepEqual(Object.keys(store).sort(), ['diaries', 'doc:d-1'])
})
