import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'
import { memberKeys, memberDocumentKey } from '../src/diary/services/memberStorage.js'
import { createAuthenticatedMemberTransport } from '../src/diary/services/memberTransport.js'
import { STORAGE_KEYS } from '../src/editor/utils/storageContract.js'

const id = '11111111-2222-3333-4444-555555555555', page = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const stamp = '2026-10-27T00:00:00.123456Z', nextStamp = '2026-10-27T00:00:00.123457Z'
const form = { title: '회원 다이어리', color: '#123456', pattern: null, pageSize: 'portrait',
  templateConfig: { version: 2, dateMode: 'undated', orientation: 'portrait', cover: false, dividers: false, monthly: false, weekly: false, daily: false, reusable: [], legacyEndPages: [] } }
const copy = v => JSON.parse(JSON.stringify(v))

test('서버 커서를 끝까지 읽어 다른 기기 자료를 표시하고 문서는 만들지 않는다', async () => {
  const f=fixture(), remote={...f.row,id:'99999999-2222-3333-4444-555555555555',canEdit:false,pageCount:17,isShared:true}; const calls=[]
  const store=createMemberAppStore({accountId:'101',storage:f.storage,makeRequestId:()=> 'list-test-key',api:{...f.api,list:async options=>{
    calls.push(options.cursor);return options.cursor?{items:[remote],hasNext:false,nextCursor:null}:{items:[{...f.row,pageCount:2,isShared:false}],hasNext:true,nextCursor:'next-opaque'}
  }}})
  await store.load(); assert.deepEqual(calls,[undefined,'next-opaque'])
  assert.equal(store.getSnapshot().diaries.length,2); const shared=store.getSnapshot().diaries.find(d=>d.id===remote.id)
  assert.equal(shared.type,'공유');assert.equal(shared.canManage,false);assert.equal(shared.pageCount,17)
  assert.equal(f.values.has(memberKeys('101').doc(remote.id)),false)
})

test('다음 페이지 실패·반복 커서는 기존 목록과 문서를 유지하고 재시도로 복구한다', async () => {
  const f=fixture(), local=f.store();await local.load();await local.create(form)
  const doc=f.values.get(memberKeys('101').doc(id));let mode='fail'
  const store=createMemberAppStore({accountId:'101',storage:f.storage,makeRequestId:()=> 'list-test-key',api:{...f.api,list:async({cursor})=>{
    if(mode==='ok')return {items:[],hasNext:false,nextCursor:null}
    if(cursor&&mode==='fail')throw new Error('offline')
    return {items:[],hasNext:true,nextCursor:'repeat'}
  }}})
  await assert.rejects(store.load(),/offline/);assert.equal(store.getSnapshot().diaries.length,1)
  mode='loop';await assert.rejects(store.reload(),{code:'INVALID_LIST_CURSOR'});assert.equal(store.getSnapshot().diaries.length,1)
  mode='ok';await store.reload();assert.deepEqual(store.getSnapshot().diaries,[])
  assert.equal(f.values.get(memberKeys('101').doc(id)),doc)
})

test('늦은 목록 응답은 동시 생성 결과를 덮어쓰거나 로그아웃 후 계정 목록을 바꾸지 않는다', async () => {
  const f=fixture();let release,slow=false
  const api={...f.api,list:async()=>{if(slow)await new Promise(resolve=>release=resolve);return {items:[],hasNext:false,nextCursor:null}}}
  const store=createMemberAppStore({accountId:'101',api,storage:f.storage,makeRequestId:()=> 'list-race-key'})
  await store.load();slow=true;const listing=store.reload();while(!release)await new Promise(r=>setTimeout(r,0))
  await store.create(form);release();await assert.rejects(listing,{code:'LIST_CHANGED'})
  assert.equal(store.getSnapshot().diaries[0].id,id)
  const before=f.values.get(memberKeys('101').index);release=null;const stale=store.reload();while(!release)await new Promise(r=>setTimeout(r,0))
  store.dispose();release();await assert.rejects(stale,{code:'STALE_ACCOUNT'});assert.equal(f.values.get(memberKeys('101').index),before)
})
function fixture() {
  const values = new Map([[STORAGE_KEYS.diaries, '[{"id":"guest","title":"기존 기기 다이어리"}]']]), writes = []
  let failIndex = false, failRead = false, loseResponse = false, calls = 0, applied = 0
  let row = { id, title: form.title, color: form.color, coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp }
  const receipts = new Map(), sent = []
  const storage = {
    async getItem(key) { if (failRead) throw new Error('read failed'); return values.get(key) ?? null },
    async setItem(key, value) { if (failIndex && key.endsWith(':index')) { failIndex = false; throw new Error('index failed') }; writes.push(key); values.set(key, value) },
    async removeItem(key) { writes.push(key); values.delete(key) },
  }
  const api = {
    async create(input, options) {
      calls++; sent.push({ input: copy(input), key: options.requestId })
      if (!receipts.has(options.requestId)) { applied++; receipts.set(options.requestId, { ...row, firstPageId: page, pageIds: [page] }) }
      if (loseResponse) { loseResponse = false; throw Object.assign(new Error('response lost'), { code: 'NETWORK_ERROR' }) }
      return copy(receipts.get(options.requestId))
    },
    async get() { return copy(row) },
    async update(target, input) {
      if (input.expectedUpdatedAt !== row.updatedAt) throw Object.assign(new Error('conflict'), { status: 409 })
      row = { ...row, title: input.title, updatedAt: nextStamp }; return copy(row)
    },
  }
  const store = (accountId = '101') => createMemberAppStore({ accountId, api: { ...api, list: async () => ({ items: accountId === '101' && applied ? [{ ...row, pageCount: 1, isShared: false }] : [], hasNext: false, nextCursor: null }) }, storage, makeRequestId: () => 'member-test-key' })
  return { store, storage, api, values, writes, sent, get calls() { return calls }, get applied() { return applied },
    failIndex: () => { failIndex = true }, failRead: () => { failRead = true }, loseResponse: () => { loseResponse = true },
    changeRemote: () => { row = { ...row, title: '다른 기기에서 수정', updatedAt: nextStamp } }, get row() { return row } }
}

test('회원 생성은 서버 페이지 ID·빈 세로 규격을 저장하고 비회원 자료와 계정별 키를 분리한다', async () => {
  const f = fixture(), store = f.store(); await store.load()
  const diary = await store.create(form), keys = memberKeys('101')
  const doc = JSON.parse(f.values.get(keys.doc(id)))
  assert.equal(diary.id, id); assert.equal(doc.id, id); assert.equal(doc.pages[0].id, page)
  assert.equal(doc.pages[0].backgroundAssetId, null); assert.equal(doc.pages[0].canvasWidth, 768); assert.equal(doc.pages[0].canvasHeight, 1024)
  assert.equal(memberDocumentKey(diary), keys.doc(id)); assert.equal(memberDocumentKey({ id: 'guest' }), null)
  assert.equal(JSON.parse(f.values.get(STORAGE_KEYS.diaries))[0].id, 'guest')
  assert.ok(f.writes.every(key => key.startsWith('dio:member:v1:101:')))
  const other = f.store('202'); await other.load(); assert.equal(other.getSnapshot().diaries.length, 0)
})

test('응답 유실·재실행에도 같은 입력과 키를 사용하며 서버 생성은 한 번이다', async () => {
  const f = fixture(), first = f.store(); await first.load(); f.loseResponse()
  await assert.rejects(first.create(form), /response lost/)
  first.dispose()
  const resumed = f.store(); await resumed.load(); assert.ok(resumed.getSnapshot().pending)
  const diary = await resumed.retryCreation()
  assert.equal(diary.id, id); assert.equal(f.applied, 1); assert.equal(f.calls, 2)
  assert.deepEqual(f.sent[0], f.sent[1]); assert.equal(f.values.has(memberKeys('101').pending), false)
})

test('서버 성공 뒤 목록 저장 실패를 재시도해도 이미 저장·편집한 문서를 덮어쓰지 않는다', async () => {
  const f = fixture(), first = f.store(); await first.load(); f.failIndex()
  await assert.rejects(first.create(form), /index failed/)
  const key = memberKeys('101').doc(id), doc = JSON.parse(f.values.get(key))
  doc.pages[0].objects.push({ id: 'existing-stroke', type: 'pen' }); f.values.set(key, JSON.stringify(doc))
  first.dispose(); const second = f.store(); await second.load(); await second.retryCreation()
  assert.equal(JSON.parse(f.values.get(key)).pages[0].objects[0].id, 'existing-stroke'); assert.equal(f.applied, 1)
})

test('빠른 이중 저장은 한 요청으로 합치고 이전 요청을 다른 폼으로 바꾸지 않는다', async () => {
  const f = fixture(), store = f.store(); await store.load()
  const [a, b] = await Promise.all([store.create(form), store.create(form)])
  assert.equal(a.id, b.id); assert.equal(f.calls, 1)
  const g = fixture(), pending = g.store(); await pending.load(); g.loseResponse(); await assert.rejects(pending.create(form))
  await assert.rejects(pending.create({ ...form, title: '다른 내용' }), { code: 'PENDING_CREATION' }); assert.equal(g.calls, 1)
})

test('계정 종료 후 늦은 서버 성공은 새 계정 상태나 저장 목록에 반영하지 않는다', async () => {
  const f = fixture(); let release
  const original = f.api.create; f.api.create = async (...args) => { await new Promise(resolve => { release = resolve }); return original(...args) }
  const store = f.store(); await store.load(); const request = store.create(form)
  while (!release) await new Promise(resolve => setTimeout(resolve, 0))
  store.dispose(); release(); await assert.rejects(request, { code: 'STALE_ACCOUNT' })
  assert.deepEqual(JSON.parse(f.values.get(memberKeys('101').index)), []); assert.equal(f.values.has(memberKeys('101').doc(id)), false)
  const other = f.store('202'); await other.load(); assert.deepEqual(other.getSnapshot().diaries, [])
})

test('읽기 실패·회원 문서 부재를 빈 목록/문서로 바꿔 덮어쓰지 않는다', async () => {
  const f = fixture(), store = f.store(); f.failRead(); await assert.rejects(store.load()); await assert.rejects(store.create(form), { code: 'NOT_READY' }); assert.equal(f.calls, 0)
  const g = fixture(), available = g.store(); await available.load(); await available.create(form)
  g.values.delete(memberKeys('101').doc(id)); g.values.set(`${STORAGE_KEYS.doc}:${id}`, JSON.stringify({ id, pages: [{ id: 'guest-page', objects: [] }] }))
  await assert.rejects(available.open(id), { code: 'MISSING_MEMBER_DOCUMENT' })
  assert.equal(g.values.has(memberKeys('101').doc(id)), false)
})

test('233 수정은 서버의 미세초 토큰을 사용하고 충돌하면 최신 메타데이터만 확인한다', async () => {
  const f = fixture(), store = f.store(); await store.load(); await store.create(form)
  f.changeRemote()
  await assert.rejects(store.update(id, { ...form, title: '내 수정' }), { status: 409 })
  assert.equal(f.row.title, '다른 기기에서 수정'); assert.equal(store.getSnapshot().diaries[0].updatedAt, nextStamp)
  const result = await store.update(id, { ...form, title: '다시 확인한 수정' }); assert.equal(result.title, '다시 확인한 수정')
})

test('401 토큰 갱신은 같은 생성 키로 한 번 재시도하고 계정이 바뀌면 재전송하지 않는다', async () => {
  const calls = []; let token = 'old', refreshes = 0
  const auth = { getSessionKey: () => '101:1', getAccessToken: ({ userId }) => userId === '101' ? token : null, refresh: async () => { token = 'new'; refreshes++ } }
  const transport = createAuthenticatedMemberTransport({ auth, accountId: '101', baseUrl: 'http://localhost/api/v1', fetchImpl: async (url, options) => {
    calls.push(options); return options.headers.Authorization === 'Bearer old' ? new Response('{"code":"INVALID_TOKEN"}', { status: 401 }) : new Response('{}', { status: 200 })
  } })
  await transport({ method: 'POST', path: '/member/diaries', requestId: 'same-retry-key', body: {} })
  assert.equal(refreshes, 1); assert.equal(calls.length, 2); assert.equal(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key'])
  let account = '101'
  const switched = createAuthenticatedMemberTransport({ auth: { getSessionKey: () => `${account}:1`, getAccessToken: ({ userId }) => userId === account ? 'token' : null, refresh: async () => assert.fail('must not refresh another account') },
    accountId: '101', baseUrl: 'http://localhost/api/v1', fetchImpl: async () => { account = '202'; return new Response('{}', { status: 401 }) } })
  await assert.rejects(switched({ path: '/member/diaries' }), { status: 401 })
})


const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('늦은 상세 GET은 성공한 PATCH의 제목과 마이크로초 수정 기준을 되돌리지 않는다', async () => {
  const f = fixture(), store = f.store(); await store.load(); await store.create(form)
  const response = deferred(), started = deferred(), captured = copy(f.row)
  f.api.get = async () => { started.resolve(); return response.promise }
  // Use the production store with a deferred server response, preserving the same storage.
  const current = f.store(); await current.load()
  const reading = current.refresh(id); await started.promise
  const updated = await current.update(id, { ...form, title: '수정 성공' })
  response.resolve(captured)
  assert.equal((await reading).title, updated.title)
  assert.equal(current.getSnapshot().diaries[0].title, '수정 성공')
  assert.equal(current.getSnapshot().diaries[0].updatedAt, nextStamp)
  assert.equal(JSON.parse(f.values.get(memberKeys('101').index))[0].updatedAt, nextStamp)
})

test('뒤에 시작한 상세 GET보다 먼저 시작한 응답이 늦게 오면 최신 상세를 유지한다', async () => {
  const f = fixture(), first = f.store(); await first.load(); await first.create(form)
  const older = deferred(), newer = deferred(), requests = []
  f.api.get = () => { const response = requests.length ? newer : older; requests.push(response); return response.promise }
  const store = f.store(); await store.load()
  const a = store.refresh(id), b = store.refresh(id)
  newer.resolve({ ...f.row, title: '최신 상세', updatedAt: nextStamp }); await b
  older.resolve({ ...f.row, title: '이전 상세', updatedAt: stamp }); await a
  assert.equal(store.getSnapshot().diaries[0].title, '최신 상세')
  assert.equal(store.getSnapshot().diaries[0].updatedAt, nextStamp)
})

test('목록 갱신 뒤 도착한 이전 상세가 최신 목록 메타데이터를 덮어쓰지 않는다', async () => {
  const f = fixture(), first = f.store(); await first.load(); await first.create(form)
  const response = deferred(), started = deferred(), captured = copy(f.row)
  f.api.get = async () => { started.resolve(); return response.promise }
  const store = f.store(); await store.load()
  const reading = store.refresh(id); await started.promise
  f.changeRemote(); await store.reload()
  response.resolve(captured); await reading
  assert.equal(store.getSnapshot().diaries[0].title, '다른 기기에서 수정')
  assert.equal(store.getSnapshot().diaries[0].updatedAt, nextStamp)
})
