import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecentPenColors, normalizeRecentPenColors, recentPenColorKey } from '../src/editor/utils/recentPenColors.js'

const disk = () => { const data = new Map(), writes = []; return { data, writes, getItem: async key => data.get(key), setItem: async (key, value) => { data.set(key, value); writes.push(value) } } }
test('실제로 기록한 최근 7개만 유지하며 연속 중복은 쓰지 않고 재사용 색은 맨 앞으로 옮긴다', async () => {
  const storage = disk(), store = createRecentPenColors(storage)
  await store.load(); assert.deepEqual(store.getSnapshot(), [])
  for (let i = 1; i <= 8; i++) await store.record('#' + String(i).repeat(6))
  assert.deepEqual(store.getSnapshot(), ['#888888','#777777','#666666','#555555','#444444','#333333','#222222'])
  const count = storage.writes.length
  assert.equal(await store.record('#888888'), false); assert.equal(storage.writes.length, count)
  await store.record('#444444')
  assert.deepEqual(store.getSnapshot(), ['#444444','#888888','#777777','#666666','#555555','#333333','#222222'])
  const restarted = createRecentPenColors(storage); await restarted.load()
  assert.deepEqual(restarted.getSnapshot(), store.getSnapshot())
})
test('느린 복원 중 발생한 사용도 기존 기록을 보존하며 호출 순서대로 저장한다', async () => {
  let resolve
  const read = new Promise(done => { resolve = done }), storage = disk()
  const store = createRecentPenColors({ ...storage, getItem: () => read })
  const load = store.load(), a = store.record('#123456'), b = store.record('#654321')
  resolve('["#ABCDEF"]'); await Promise.all([load,a,b])
  assert.deepEqual(store.getSnapshot(), ['#654321','#123456','#ABCDEF'])
  assert.deepEqual(storage.writes.map(JSON.parse), [['#123456','#ABCDEF'],['#654321','#123456','#ABCDEF']])
})
test('펜과 형광펜은 분리하고 과거 선택 색만으로 사용 이력을 만들지 않는다', async () => {
  const storage = disk(); storage.data.set('dio-editor-last-pen-color-v1','#112233')
  const pen = createRecentPenColors(storage), highlighter = createRecentPenColors(storage,'highlighter')
  await Promise.all([pen.load(),highlighter.load()]); assert.deepEqual(pen.getSnapshot(), [])
  await pen.record('#abc'); await highlighter.record('#def')
  assert.deepEqual(pen.getSnapshot(), ['#AABBCC']); assert.deepEqual(highlighter.getSnapshot(), ['#DDEEFF'])
  assert.notEqual(recentPenColorKey('pen'),recentPenColorKey('highlighter'))
})
test('손상값·저장 실패에서 복구하며 실패한 색은 다음 실제 사용에 재시도한다', async () => {
  assert.deepEqual(normalizeRecentPenColors(['invalid',null,'#abc','#AABBCC','#123456']), ['#AABBCC','#123456'])
  const storage = disk(); let failed = true
  storage.data.set(recentPenColorKey('pen'),'broken')
  const store = createRecentPenColors({ ...storage, setItem: async (...args) => { if(failed) throw Error('full'); return storage.setItem(...args) } })
  await store.load(); await assert.rejects(store.record('#123456')); assert.deepEqual(store.getSnapshot(), [])
  failed=false; await store.record('#123456'); assert.deepEqual(store.getSnapshot(), ['#123456'])
  await store.record(null); assert.deepEqual(store.getSnapshot(), ['#123456'])
})

test('일시적인 읽기 실패 후 기록해도 저장된 최근 색을 다시 읽어 보존한다', async () => {
  const storage = disk(), key = recentPenColorKey('pen')
  const saved = ['#777777','#666666','#555555','#444444','#333333','#222222','#111111']
  storage.data.set(key, JSON.stringify(saved))
  let unavailable = true, reads = 0
  const store = createRecentPenColors({ ...storage, getItem: async k => {
    reads++; if (unavailable) throw Error('I/O'); return storage.getItem(k)
  } })
  await assert.rejects(store.load(), /I\/O/)
  await assert.rejects(store.record('#888888'), /I\/O/)
  assert.equal(storage.writes.length, 0)
  assert.deepEqual(JSON.parse(storage.data.get(key)), saved)
  unavailable = false
  await store.record('#888888')
  assert.equal(reads, 3)
  assert.deepEqual(store.getSnapshot(), ['#888888', ...saved.slice(0, 6)])
  assert.deepEqual(JSON.parse(storage.data.get(key)), store.getSnapshot())
})

test('대기 중인 읽기가 실패해도 후속 기록은 재시도하고 기존 디스크 이력을 병합한다', async () => {
  const storage = disk(), key = recentPenColorKey('pen')
  storage.data.set(key, '["#ABCDEF"]')
  let rejectRead, reads = 0
  const pending = new Promise((_resolve, reject) => { rejectRead = reject })
  const store = createRecentPenColors({ ...storage, getItem: k => ++reads === 1 ? pending : storage.getItem(k) })
  const loading = store.load(), first = store.record('#123456'), second = store.record('#654321')
  const rejectedLoad = assert.rejects(loading), rejectedFirst = assert.rejects(first)
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  rejectRead(Error('I/O'))
  await Promise.all([rejectedLoad, rejectedFirst, second])
  assert.deepEqual(store.getSnapshot(), ['#654321','#ABCDEF'])
  assert.deepEqual(storage.writes.map(JSON.parse), [['#654321','#ABCDEF']])
})
