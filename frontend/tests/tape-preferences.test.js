import test from 'node:test'
import assert from 'node:assert/strict'
import { createTapePreferences } from '../src/editor/services/tapePreferences.js'

const options = { sizes: ['slim', 'standard', 'wide'], palettes: ['pink', 'sky'], patterns: ['solid', 'dot'], defaultSize: 'standard' }
const make = overrides => createTapePreferences({ ...options, load: async () => null, save: async () => true, ...overrides })

test('첫 실행은 무선택이며 복원만으로 저장하거나 삽입하지 않는다', async () => {
  const writes = [], store = make({ load: async () => ({ size: 'wide', palette: 'sky', pattern: 'dot', src: 'private.jpg' }), save: async value => writes.push(value) })
  assert.deepEqual(store.getSnapshot(), { size: 'standard', palette: null, pattern: null })
  await store.ensureLoaded()
  assert.deepEqual(store.getSnapshot(), { size: 'wide', palette: 'sky', pattern: 'dot' })
  assert.deepEqual(writes, [])
})

test('닫기·재구독과 재실행 후 사용자 색상 두 개·규격·무늬를 복원한다', async () => {
  let saved
  const store = make({ save: async value => { saved = structuredClone(value); return true } })
  await store.ensureLoaded()
  let notifications = 0
  const unsubscribe = store.subscribe(() => notifications++)
  await store.update({ size: 'slim', palette: 'custom:#AABBCC:#112233', pattern: 'dot', x: 100 })
  unsubscribe()
  assert.equal(notifications, 1)
  assert.deepEqual(store.getSnapshot(), saved)
  const restarted = make({ load: async () => saved })
  await restarted.ensureLoaded()
  assert.deepEqual(restarted.getSnapshot(), { size: 'slim', palette: 'custom:#AABBCC:#112233', pattern: 'dot' })
})

test('느린 조회는 새로 고른 색을 덮어쓰지 않고 미변경 규격·무늬는 복원한다', async () => {
  let resolveLoad
  const writes = [], store = make({ load: () => new Promise(resolve => { resolveLoad = resolve }), save: async value => { writes.push(value); return true } })
  const loading = store.ensureLoaded()
  await Promise.resolve()
  const changing = store.update({ palette: 'pink' })
  resolveLoad({ size: 'wide', palette: 'sky', pattern: 'dot' })
  await loading; await changing
  assert.deepEqual(store.getSnapshot(), { size: 'wide', palette: 'pink', pattern: 'dot' })
  assert.deepEqual(writes, [store.getSnapshot()])
})

test('빠른 변경도 쓰기를 직렬화하여 마지막 값을 남긴다', async () => {
  let release
  const writes = [], store = make({ save: value => { writes.push(value); return writes.length === 1 ? new Promise(resolve => { release = resolve }) : Promise.resolve(true) } })
  await store.ensureLoaded()
  const first = store.update({ palette: 'sky' })
  const second = store.update({ size: 'wide' })
  await Promise.resolve()
  assert.equal(writes.length, 1)
  release(true)
  await first; await second
  assert.deepEqual(writes.at(-1), { size: 'wide', palette: 'sky', pattern: null })
})

test('잘못된 저장 값·추가 좌표·미디어 참조는 복원하지 않는다', async () => {
  for (const saved of [null, 'broken', { size: 'huge', palette: 'custom:red:blue', pattern: '__proto__', mediaFileId: 'a' }]) {
    const store = make({ load: async () => saved })
    await store.ensureLoaded()
    assert.deepEqual(store.getSnapshot(), { size: 'standard', palette: null, pattern: null })
  }
})

test('읽기·쓰기 실패 후에도 메모리 설정을 유지하고 다음 선택에서 저장을 재시도한다', async () => {
  let fail = true
  const store = make({ load: async () => { throw new Error('read') }, save: async () => { if (fail) throw new Error('full'); return true } })
  await store.ensureLoaded()
  assert.equal(await store.update({ palette: 'sky' }), false)
  assert.equal(store.getSnapshot().palette, 'sky')
  fail = false
  assert.equal(await store.update({ pattern: 'dot' }), true)
  assert.equal(store.getSnapshot().palette, 'sky')
})
