import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/services/legacySampleCleanup.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })

function load(store = {}, { failRemove = false } = {}) {
  const calls = []
  const storage = { STORAGE_KEYS: { doc: 'doc', diaries: 'diaries' },
    loadJSON: async (key, fallback) => { calls.push(['load', key]); return key in store ? store[key] : fallback },
    saveJSON: async (key, value) => { calls.push(['save', key]); store[key] = value; return true },
    removeJSON: async (key) => { calls.push(['remove', key]); if (failRemove) return false; delete store[key]; return true } }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(() => storage, module, module.exports)
  return { ...module.exports, store, calls }
}

test('예전 예시 다이어리만 지우고 사용자가 만든 다이어리는 남긴다', async () => {
  const mine = { id: 'd-1', title: '내 다이어리' }
  const { removeLegacySampleDiaries, LEGACY_SAMPLE_CLEANUP_KEY, store } = load({
    'dio:dev:mock-seeded:v1': true,
    'doc:mock-travel': {}, 'doc:mock-study': {}, 'doc:d-1': { pages: [] },
    diaries: [{ id: 'mock-travel' }, mine, { id: 'mock-class' }],
  })
  assert.equal(await removeLegacySampleDiaries(), true)
  assert.deepEqual(store.diaries, [mine])
  assert.deepEqual(Object.keys(store).sort(), ['diaries', 'doc:d-1', LEGACY_SAMPLE_CLEANUP_KEY].sort())
})

test('예시가 없으면 보관함 목록을 다시 쓰지 않는다', async () => {
  const diaries = [{ id: 'd-1' }]
  const { removeLegacySampleDiaries, store, calls } = load({ diaries })
  await removeLegacySampleDiaries()
  assert.equal(store.diaries, diaries)
  assert.ok(!calls.some(([op, key]) => op === 'save' && key === 'diaries'))
})

test('한 번 마친 뒤에는 다시 정리하지 않는다', async () => {
  const { removeLegacySampleDiaries, LEGACY_SAMPLE_CLEANUP_KEY, calls } = load({ 'dio:legacy-samples-removed:v1': true })
  assert.equal(LEGACY_SAMPLE_CLEANUP_KEY, 'dio:legacy-samples-removed:v1')
  assert.equal(await removeLegacySampleDiaries(), true)
  assert.deepEqual(calls, [['load', LEGACY_SAMPLE_CLEANUP_KEY]])
})

test('지우기가 실패하면 완료 표시를 남기지 않아 다음 실행 때 다시 시도한다', async () => {
  const { removeLegacySampleDiaries, LEGACY_SAMPLE_CLEANUP_KEY, store } = load({ 'doc:mock-travel': {} }, { failRemove: true })
  assert.equal(await removeLegacySampleDiaries(), false)
  assert.ok(!(LEGACY_SAMPLE_CLEANUP_KEY in store))
})
