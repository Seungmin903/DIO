import test from 'node:test'
import assert from 'node:assert/strict'
import { createPenColorPreference, PEN_COLOR_KEY } from '../src/editor/utils/penColorPreference.js'
import { DEFAULT_PEN_SETTINGS } from '../src/editor/utils/penSettings.js'

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('마지막 펜 색상은 새 편집기와 앱 재시작에 복원하고 색상만 저장한다', async () => {
  const disk = new Map(), writes = []
  const storage = { getItem: async key => disk.get(key), setItem: async (key, value) => { disk.set(key, value); writes.push([key, value]) } }
  const first = createPenColorPreference(storage)
  await first.load()
  assert.equal(first.getSnapshot(), DEFAULT_PEN_SETTINGS.color)
  await first.setColor('#f80')
  const second = createPenColorPreference(storage)
  await second.load()
  assert.equal(second.getSnapshot(), '#FF8800')
  assert.deepEqual(writes, [[PEN_COLOR_KEY, '#FF8800']])
})

test('늦게 도착한 저장 색상이 새 선택을 덮어쓰지 않는다', async () => {
  for (const beforeLoad of [true, false]) {
    const read = deferred()
    const store = createPenColorPreference({ getItem: () => read.promise, setItem: async () => {} })
    if (beforeLoad) await store.setColor('#123456')
    const loading = store.load()
    if (!beforeLoad) await store.setColor('#123456')
    read.resolve('#ABCDEF'); await loading
    assert.equal(store.getSnapshot(), '#123456')
  }
})

test('빠른 색 변경은 순서대로 저장하고 열린 편집기 구독자 모두에게 알린다', async () => {
  const gate = deferred(), disk = []
  const store = createPenColorPreference({ getItem: async () => null, setItem: async (_key, value) => { if (!disk.length) await gate.promise; disk.push(value) } })
  const changes = [], unsubscribe = store.subscribe(() => changes.push(store.getSnapshot()))
  const first = store.setColor('#111111'), second = store.setColor('#222222')
  assert.equal(store.getSnapshot(), '#222222')
  gate.resolve(); await Promise.all([first, second])
  assert.deepEqual(disk, ['#111111', '#222222'])
  assert.deepEqual(changes, disk)
  unsubscribe(); await store.setColor('#333333'); assert.equal(changes.length, 2)
})

test('손상된 저장값과 읽기·쓰기 실패 이후에도 다음 선택을 저장할 수 있다', async () => {
  for (const invalid of [null, 'broken', 'rgba(0,0,0,.4)', '"#123456"']) {
    const store = createPenColorPreference({ getItem: async () => invalid })
    await store.load(); assert.equal(store.getSnapshot(), DEFAULT_PEN_SETTINGS.color)
  }
  let failed = true
  const store = createPenColorPreference({ getItem: async () => { throw Error('disk') }, setItem: async () => { if (failed) throw Error('disk') } })
  await store.load()
  await assert.rejects(store.setColor('#123456'))
  assert.equal(store.getSnapshot(), '#123456')
  failed = false; await store.setColor('#654321')
  await assert.rejects(store.setColor(null)); assert.equal(store.getSnapshot(), '#654321')
})
