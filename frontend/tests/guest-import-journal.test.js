import test from 'node:test'
import assert from 'node:assert/strict'
import { createGuestImportJournalStore } from '../src/diary/services/guestImportJournal.js'

const key = 'test:guest-import'
function storage(initial = []) {
  const disk = new Map(initial), writes = []
  return { disk, writes,
    async getItem(name) {
      const value = disk.get(name) ?? null
      if (value !== null) assert.ok(Buffer.byteLength(value) <= 256 * 1024, '큰 SQLite 행을 읽지 않는다')
      return value
    },
    async setItem(name, value) {
      assert.ok(Buffer.byteLength(value) <= 256 * 1024, '큰 SQLite 행을 쓰지 않는다')
      writes.push(name); disk.set(name, value)
    },
    async removeItem(name) { disk.delete(name) },
    async getAllKeys() { return [...disk.keys()] },
  }
}
const store = data => createGuestImportJournalStore({ storage: data, key })
function entry(payload = 'before') {
  return { requestId: 'unchanged-create-id', diaryId: 'server-diary', pageIds: ['server-page'], settingsDone: [], batchesDone: [],
    favoriteDone: false, skipped: [], startedAt: '2026-11-03',
    plan: { create: { title: '제목', initialPages: [] }, pages: [{ settings: {}, batches: [{ clientOperationId: 'operation-1', creates: [{ payload }] }] }] } }
}
const journal = value => ({ format: 1, diaries: { diary: value } })

test('재개 목록은 생성 전 항목과 서버 다이어리가 있는 항목을 구분한다', async () => {
  const data = storage(), source = journal(entry('photo'))
  source.diaries.diary.diaryId = null
  source.diaries.created = { ...entry('second'), requestId: 'request-2', diaryId: 'server-id' }
  await store(data).save(source)
  const reader = store(data)
  assert.deepEqual((await reader.pendingIds()).sort(), ['created', 'diary'])
  assert.deepEqual(await reader.pendingIds({ createdOnly: true }), ['created'])
})

test('수 MB의 한 다이어리·펜 계획도 모든 행을 256KiB 미만으로 나누고 그대로 복원한다', async () => {
  const data = storage(), value = entry('가🖊'.repeat(180000))
  value.plan.pages[0].batches.push(...[2, 3].map(n => ({ clientOperationId: `operation-${n}`, creates: [{ payload: '그림🖊'.repeat(130000) }] })))
  assert.ok(Buffer.byteLength(JSON.stringify(value)) > 3 * 1024 * 1024)
  await store(data).save(journal(value))
  assert.ok(data.disk.size > 20)
  assert.deepEqual(await store(data).load(), journal(value))
  // 후보 목록 확인은 큰 본문 조각을 읽지 않고 작은 인덱스만 읽는다.
  const read = data.getItem
  data.getItem = async name => { assert.ok(!name.includes(':data:')); return read(name) }
  assert.deepEqual(await store(data).pendingIds(), ['diary'])
})

test('요청을 저장하면 원본 creates를 중복 저장하지 않고 완료 묶음의 본문은 해제할 수 있다', async () => {
  const data = storage(), value = entry('x'.repeat(200000)), batch = value.plan.pages[0].batches[0]
  batch.request = { clientOperationId: batch.clientOperationId, changes: { creates: batch.creates }, expectedVersions: {} }
  await store(data).save(journal(value))
  const restored = (await store(data).load()).diaries.diary
  assert.equal(restored.plan.pages[0].batches[0].creates, undefined)
  assert.deepEqual(restored.plan.pages[0].batches[0].request, batch.request)
})

test('다른 다이어리와 변경 없는 묶음 본문은 단계별 저장에서 다시 쓰지 않는다', async () => {
  const data = storage(), writer = store(data), first = entry('a'.repeat(200000)), second = entry('b'.repeat(200000))
  const value = { format: 1, diaries: { first, second } }
  await writer.save(value)
  const oldBytes = data.disk.size
  data.writes.length = 0
  first.settingsDone.push(0)
  await writer.save(value)
  assert.equal(data.writes.filter(name => name.includes(':data:')).length, 1, '변경된 다이어리 메타데이터만 쓴다')
  assert.equal(data.disk.size, oldBytes, '이전 인덱스·메타 조각은 청소한다')
  assert.deepEqual(await store(data).load(), value)
})

test('조각·인덱스·헤드 쓰기 어느 단계가 실패해도 이전 체크포인트와 요청 ID가 남는다', async () => {
  const base = storage(), before = journal(entry())
  await store(base).save(before)
  const after = journal(entry('새 필기🖊'.repeat(25000)))
  const probe = storage(base.disk), probeWriter = store(probe); await probeWriter.load(); await probeWriter.save(after)
  const count = probe.writes.length
  for (let failAt = 1; failAt <= count; failAt++) {
    const data = storage(base.disk), writer = store(data)
    await writer.load()
    const set = data.setItem; let writes = 0
    data.setItem = async (...args) => { if (++writes === failAt) throw Error('disk full'); return set(...args) }
    await assert.rejects(writer.save(after), /disk full/)
    assert.deepEqual(await store(data).load(), before, `write ${failAt}`)
    data.setItem = set
    await writer.save(after)
    assert.deepEqual(await store(data).load(), after)
  }
})

test('헤드 저장 응답이 유실돼도 다음 저장이 현재 세대를 읽어 참조 중인 조각을 덮어쓰지 않는다', async () => {
  const data = storage(), writer = store(data), value = journal(entry())
  await writer.save(value)
  const set = data.setItem; let lost = true
  data.setItem = async (name, raw) => { await set(name, raw); if (name === key && lost) { lost = false; throw Error('response lost') } }
  value.diaries.diary.settingsDone.push(0)
  await assert.rejects(writer.save(value), /response lost/)
  assert.deepEqual(await store(data).load(), value)
  data.setItem = set
  await writer.save(value)
  assert.deepEqual(await store(data).load(), value)
})

test('기존 단일 키 기록을 요청 ID·전송 본문 변경 없이 조각 저장으로 이전한다', async () => {
  const data = storage(), legacy = journal(entry('legacy'))
  legacy.diaries.diary.plan.pages[0].batches[0].request = { clientOperationId: 'operation-1', changes: { creates: [{ payload: 'uploaded' }] } }
  data.disk.set(key, JSON.stringify(legacy))
  const writer = store(data), loaded = await writer.load()
  assert.deepEqual(loaded, legacy)
  await writer.save(loaded)
  assert.equal(JSON.parse(data.disk.get(key)).format, 2)
  const restored = (await store(data).load()).diaries.diary
  assert.equal(restored.requestId, legacy.diaries.diary.requestId)
  assert.deepEqual(restored.plan.pages[0].batches[0].request, legacy.diaries.diary.plan.pages[0].batches[0].request)
})

test('조각 누락은 빈 계획으로 바꾸지 않고 오류로 남기며 기록을 초기화하지 않는다', async () => {
  const data = storage(); await store(data).save(journal(entry()))
  const removed = [...data.disk.keys()].find(name => name.includes(':data:'))
  data.disk.delete(removed)
  const head = data.disk.get(key)
  await assert.rejects(store(data).load(), error => error.code === 'INVALID_LOCAL_CACHE')
  assert.equal(data.disk.get(key), head)
})

test('완료 정리 뒤에는 진행 본문을 회수하고 다른 저장 키는 지우지 않는다', async () => {
  const data = storage(), writer = store(data)
  data.disk.set('guest:original', 'keep')
  await writer.save(journal(entry()))
  await writer.save({ format: 1, diaries: {} })
  assert.deepEqual(await store(data).pendingIds(), [])
  assert.equal([...data.disk.keys()].filter(name => name.startsWith(`${key}:data:`)).length, 0)
  assert.equal(data.disk.get('guest:original'), 'keep')
})

test('다른 실행기가 저장 중 읽어도 조각 청소와 겹치지 않고 새 체크포인트를 읽는다', async () => {
  const data = storage(), writer = store(data), value = journal(entry())
  await writer.save(value)
  const set = data.setItem
  let release, started
  const blocked = new Promise(resolve => { release = resolve }), ready = new Promise(resolve => { started = resolve })
  data.setItem = async (name, raw) => { if (name === key) { started(); await blocked } return set(name, raw) }
  value.diaries.diary.settingsDone.push(0)
  const saving = writer.save(value)
  await ready
  const reading = store(data).load()
  release()
  await saving
  assert.deepEqual(await reading, value)
})
