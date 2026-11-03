import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'

const id = '11111111-2222-3333-4444-555555555555'
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no }); return { promise, resolve, reject } }
const page = items => ({ items, hasNext: false, nextCursor: null })
async function fixture({ shared = false } = {}) {
  const disk = new Map(), calls = []
  let row = { id, title: '기록', favorite: false, canEdit: !shared, isShared: shared, version: '1', permissions: { canTrash: !shared } }
  const api = {
    list: async query => page(query.favorite && !row.favorite ? [] : [{ ...row }]),
    get: async () => ({ ...row }),
    setFavorite: async (diaryId, favorite) => { calls.push({ diaryId, favorite }); row = { ...row, favorite }; return { id: diaryId, userId: '101', favorite } },
  }
  const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) } }
  const makeStore = () => createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true })
  const store = makeStore(); await store.load()
  return { store, api, storage, disk, calls, makeStore }
}

test('즐겨찾기는 회원 상태 PATCH에 명시적 boolean만 보내고 응답을 검증한다', async () => {
  const calls = []
  const api = createMemberDiaryApi(async input => { calls.push(input); return { diaryId: id, userId: '101', favorite: input.body.favorite } })
  for (const favorite of [true, false]) {
    assert.deepEqual(await api.setFavorite(id, favorite), { id, userId: '101', favorite })
    assert.deepEqual(calls.at(-1), { method: 'PATCH', path: `/diaries/${id}/membership`, body: { favorite } })
  }
  await assert.rejects(api.setFavorite(id, 'true'), { code: 'INVALID_RESPONSE' })
  await assert.rejects(api.setFavorite('local-id', true), { code: 'INVALID_RESPONSE' })
  for (const response of [null, { diaryId: id, userId: '101', favorite: false }, { diaryId: 'other', userId: '101', favorite: true }]) {
    await assert.rejects(createMemberDiaryApi(async () => response).setFavorite(id, true), { code: 'INVALID_RESPONSE' })
  }
})

for (const shared of [false, true]) test(`${shared ? '공유 편집자' : '개인 소유자'}의 별과 캐시를 갱신하고 다시 불러와 유지한다`, async () => {
  const f = await fixture({ shared })
  await f.store.toggleFavorite(id)
  assert.equal(f.store.getSnapshot().diaries[0].favorite, true)
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
  assert.equal(JSON.parse(f.disk.get(f.store.keys.index))[0].favorite, true)
  const reopened = f.makeStore(); await reopened.load()
  assert.equal(reopened.getSnapshot().library.items[0].favorite, true)
  await reopened.toggleFavorite(id)
  assert.equal(reopened.getSnapshot().diaries[0].favorite, false)
})

test('연타는 같은 요청을 공유하고 응답 전 별을 확정하지 않는다', async () => {
  const f = await fixture(), gate = deferred(); let calls = 0
  f.api.setFavorite = async () => { calls++; return gate.promise }
  const first = f.store.toggleFavorite(id), second = f.store.toggleFavorite(id)
  assert.equal(first, second); assert.equal(calls, 1)
  assert.equal(f.store.getSnapshot().diaries[0].favorite, false)
  f.api.list = async () => page([{ ...f.store.getSnapshot().diaries[0], favorite: true }])
  gate.resolve({ id, userId: '101', favorite: true }); await first
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
})

test('실패한 PATCH는 기존 별을 유지하고 같은 목표값으로 재시도한다', async () => {
  const f = await fixture(), original = f.api.setFavorite
  f.api.setFavorite = async () => { throw Object.assign(Error('offline'), { status: 0 }) }
  await assert.rejects(f.store.toggleFavorite(id), /offline/)
  assert.equal(f.store.getSnapshot().diaries[0].favorite, false)
  f.api.setFavorite = original; await f.store.toggleFavorite(id)
  assert.deepEqual(f.calls, [{ diaryId: id, favorite: true }])
})

test('즐겨찾기 필터에서 해제하면 행을 제거하고 첫 페이지부터 다시 조회한다', async () => {
  const f = await fixture(); await f.store.toggleFavorite(id)
  await f.store.queryLibrary({ favorite: true })
  assert.equal(f.store.getSnapshot().library.items.length, 1)
  await f.store.toggleFavorite(id)
  assert.deepEqual(f.store.getSnapshot().library.items, [])
  assert.equal(f.store.getSnapshot().diaries[0].favorite, false)
})

test('이전 목록과 단건 조회가 늦게 도착해도 저장한 별을 되돌리지 않는다', async () => {
  const f = await fixture(), listGate = deferred(), detailGate = deferred(), original = f.api.list
  f.api.list = () => listGate.promise
  const oldList = f.store.reload(), rejectedList = assert.rejects(oldList)
  f.api.get = () => detailGate.promise
  const oldDetail = f.store.refresh(id)
  f.api.list = original
  await f.store.toggleFavorite(id)
  const old = { ...f.store.getSnapshot().diaries[0], favorite: false }
  listGate.resolve(page([old])); detailGate.resolve(old)
  await rejectedList; await oldDetail
  assert.equal(f.store.getSnapshot().diaries[0].favorite, true)
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
})

test('다른 계정의 응답은 반영하지 않는다', async () => {
  const f = await fixture()
  f.api.setFavorite = async () => ({ id, userId: '202', favorite: true })
  await assert.rejects(f.store.toggleFavorite(id), { code: 'INVALID_RESPONSE' })
  assert.equal(f.store.getSnapshot().diaries[0].favorite, false)
})

test('먼저 시작한 제목 수정 응답이 새 즐겨찾기 상태를 덮어쓰지 않는다', async () => {
  const f = await fixture(), gate = deferred()
  f.api.update = () => gate.promise
  const old = { ...f.store.getSnapshot().diaries[0], title: '수정 제목', favorite: false }
  const update = f.store.update(id, { title: old.title, color: '#123456' })
  await f.store.toggleFavorite(id)
  f.api.list = async () => page([{ ...old, favorite: true }])
  gate.resolve(old); await update
  assert.equal(f.store.getSnapshot().diaries[0].favorite, true)
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
  assert.equal(old.favorite, false, 'API 응답 객체를 직접 바꾸지 않는다')
})

test('종료된 저장소 호출은 동기 예외 없이 Promise를 거부하고 요청을 보내지 않는다', async () => {
  const f = await fixture(), before = f.disk.get(f.store.keys.index)
  f.store.dispose()
  let pending
  assert.doesNotThrow(() => { pending = f.store.toggleFavorite(id) })
  await assert.rejects(pending, { code: 'STALE_ACCOUNT' })
  assert.deepEqual(f.calls, [])
  assert.equal(f.disk.get(f.store.keys.index), before)
})

for (const reject of [false, true]) test(`계정 전환 후 이전 ${reject ? '실패' : '성공'} 응답과 캐시 쓰기를 차단한다`, async () => {
  const f = await fixture(), gate = deferred()
  f.api.setFavorite = () => gate.promise
  const before = f.disk.get(f.store.keys.index), pending = f.store.toggleFavorite(id)
  const rejected = assert.rejects(pending, { code: 'STALE_ACCOUNT' })
  f.store.dispose()
  if (reject) gate.reject(Error('late failure'))
  else gate.resolve({ id, userId: '101', favorite: true })
  await rejected; assert.equal(f.disk.get(f.store.keys.index), before)
})

test('저장 후 재조회 실패를 PATCH 실패로 표시하지 않고 별을 보존한다', async () => {
  const f = await fixture()
  f.api.list = async () => { throw Error('refresh offline') }
  await f.store.toggleFavorite(id)
  assert.equal(f.store.getSnapshot().diaries[0].favorite, true)
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
  assert.match(f.store.getSnapshot().library.error.message, /refresh offline/)
})

test('서버 저장 후 캐시 실패여도 메모리의 성공 상태를 유지한다', async () => {
  const f = await fixture()
  f.storage.setItem = async () => { throw Error('disk full') }
  await f.store.toggleFavorite(id)
  assert.equal(f.store.getSnapshot().diaries[0].favorite, true)
  assert.equal(f.store.getSnapshot().library.items[0].favorite, true)
})
