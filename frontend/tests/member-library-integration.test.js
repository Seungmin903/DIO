import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'
import { memberKeys } from '../src/diary/services/memberStorage.js'
import { memberLibraryQuery } from '../src/diary/services/memberLibraryQuery.js'

const row = id => ({ id, title: id, color: '#123456', version: '1', canEdit: true, permissions: { canTrash: true }, pageCount: 7, isShared: false })
const page = (items, nextCursor = null) => ({ items, hasNext: nextCursor !== null, nextCursor })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function fixture(ids = ['a','b','c']) {
  const keys = memberKeys('101'), disk = new Map([[keys.doc('a'), 'handwriting-kept'], ['guest:index', 'guest-kept']])
  const rows = new Map(ids.map(id => [id, row(id)])), deleted = new Set(), calls = [], writes = []
  const api = { list: async input => { calls.push(['list', input]); return page([...rows.values()].filter(r => !deleted.has(r.id))) },
    trashList: async () => page([...deleted].map(id => ({ ...row(id), canRestore: true }))),
    trash: async id => { calls.push(['trash', id]); deleted.add(id) },
    get: async id => rows.get(id), update: async (id, input) => { const next={...rows.get(id), title:input.title,version:'2'};rows.set(id,next);return next } }
  const storage = { getItem: async k => disk.get(k) ?? null, setItem: async (k,v) => { writes.push(k); disk.set(k,v) }, removeItem: async k => disk.delete(k) }
  const store = createMemberAppStore({ accountId:'101',api,storage,makeRequestId:()=> 'test-key',serverLibrary:true })
  return { store, api, disk, keys, rows, calls, writes, deleted }
}

test('모든 다이어리·즐겨찾기·공유 UI를 서버 조건으로 정확히 변환한다', () => {
  assert.deepEqual(memberLibraryQuery(), {q:'',sort:'updated',filter:'all',favorite:false})
  assert.deepEqual(memberLibraryQuery({filter:'favorite',query:'  여름  ',searchOpen:true,sort:'title'}), {q:'여름',sort:'title',filter:'all',favorite:true})
  assert.deepEqual(memberLibraryQuery({filter:'shared',query:'hidden',searchOpen:false,sort:'pages'}), {q:'',sort:'pages',filter:'shared',favorite:false})
})

test('최초 조회는 20개 첫 페이지만 읽고 더 보기에서 같은 조건·커서를 전송한다', async () => {
  const f=fixture();f.api.list=async input=>{f.calls.push(['list',input]);return input.cursor?page([row('b')]):page([row('z')],'opaque-2')}
  await f.store.load();assert.equal(f.calls.length,1);assert.equal(f.calls[0][1].limit,20)
  assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['z']);assert.equal(f.store.getSnapshot().library.hasNext,true)
  await f.store.loadMoreLibrary();assert.equal(f.calls[1][1].cursor,'opaque-2')
  assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['z','b']);assert.equal(f.store.getSnapshot().library.hasNext,false)
})

test('검색·정렬 결과 순서를 보존하고 필터 밖 캐시와 필기 문서를 지우지 않는다', async () => {
  const f=fixture();await f.store.load()
  f.api.list=async input=>{f.calls.push(['list',input]);return page([{...row('z'),isShared:true},row('a')])}
  await f.store.queryLibrary({q:'찾기',sort:'title',filter:'shared',favorite:true})
  assert.deepEqual(f.calls.at(-1)[1],{q:'찾기',sort:'title',filter:'shared',favorite:true,cursor:undefined,limit:20})
  assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['z','a'])
  assert.ok(f.store.getSnapshot().diaries.some(r=>r.id==='b'));assert.equal(f.disk.get(f.keys.doc('a')),'handwriting-kept')
  assert.equal(f.disk.get('guest:index'),'guest-kept')
})

test('조건이 바뀌면 이전 커서를 버리고 느린 검색 응답을 반영하지 않는다', async () => {
  const f=fixture();await f.store.load();const gate=deferred()
  f.api.list=async ({q,cursor})=>{assert.equal(cursor,undefined);if(q==='old'){await gate.promise;return page([row('old')],'old-cursor')}return page([row('new')])}
  const old=f.store.queryLibrary({q:'old'});const rejected=assert.rejects(old,{code:'STALE_LIBRARY'})
  await f.store.queryLibrary({q:'new'});const before=f.disk.get(f.keys.index);gate.resolve();await rejected
  assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['new']);assert.equal(f.disk.get(f.keys.index),before)
})

test('다음 페이지 네트워크 실패는 기존 행을 유지하고 실패한 페이지 커서로 재시도한다', async () => {
  const f=fixture();let fail=true
  f.api.list=async input=>{f.calls.push(['list',input]);if(!input.cursor)return page([row('a')],'two');if(fail)throw Error('offline');return page([row('b')])}
  await f.store.load();await assert.rejects(f.store.loadMoreLibrary(),/offline/)
  assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['a']);fail=false
  await f.store.retryLibrary();assert.equal(f.calls.at(-1)[1].cursor,'two');assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['a','b'])
})

test('반복·무효 커서는 자동 루프 없이 중단하고 첫 페이지부터 복구한다', async () => {
  const f=fixture();f.api.list=async input=>{f.calls.push(['list',input]);return page([row('a')],'same')}
  await f.store.load();await assert.rejects(f.store.loadMoreLibrary(),{code:'INVALID_LIST_CURSOR'})
  f.api.list=async input=>{f.calls.push(['list',input]);return page([row('b')])}
  await f.store.retryLibrary();assert.equal(f.calls.at(-1)[1].cursor,undefined);assert.deepEqual(f.store.getSnapshot().library.items.map(r=>r.id),['b'])
})

test('100자를 넘는 검색은 요청 없이 안내하고 재시도도 잘못된 조건을 보내지 않는다', async () => {
  const f=fixture();await f.store.load();const before=f.calls.length
  await assert.rejects(f.store.queryLibrary({q:'가'.repeat(101)}),{code:'INVALID_DIARY_LIST_QUERY'})
  await assert.rejects(f.store.retryLibrary(),{code:'INVALID_DIARY_LIST_QUERY'});assert.equal(f.calls.length,before)
})

test('진행 중 조회가 있어도 수정 후 조회는 새 요청으로 시작해 구 메타데이터를 덮어쓰지 않는다', async () => {
  const f=fixture();await f.store.load();const gate=deferred();let slow=true
  f.api.list=async()=>{if(slow){slow=false;await gate.promise;return page([row('a')])}return page([...f.rows.values()])}
  const old=f.store.reload();const rejected=assert.rejects(old,{code:'STALE_LIBRARY'})
  await f.store.update('a',{title:'changed'});gate.resolve();await rejected
  assert.equal(f.store.getSnapshot().library.items.find(r=>r.id==='a').title,'changed')
})

test('로그아웃 후 늦은 검색은 캐시와 새 계정 상태를 바꾸지 않는다', async () => {
  const f=fixture();await f.store.load();const gate=deferred(),before=f.disk.get(f.keys.index)
  f.api.list=async()=>{await gate.promise;return page([row('late')])};const reading=f.store.queryLibrary({q:'late'})
  f.store.dispose();gate.resolve();await assert.rejects(reading,{code:'STALE_ACCOUNT'});assert.equal(f.disk.get(f.keys.index),before)
})

test('일괄 이동은 최대 3개 동시 호출·중복 탭 결합·명시적 성공 목록을 보장한다', async () => {
  const f=fixture(['a','b','c','d','e']);await f.store.load();let inFlight=0,max=0;const gate=deferred()
  f.api.trash=async id=>{f.calls.push(['trash',id]);max=Math.max(max,++inFlight);await gate.promise;f.deleted.add(id);inFlight--}
  const first=f.store.bulkTrash(['a','b','c','d','e']),duplicate=f.store.bulkTrash(['a','b','c','d','e']);assert.equal(first,duplicate)
  await assert.rejects(f.store.lifecycle('trash','a'),{code:'OPERATION_PENDING'})
  for(let i=0;i<20&&inFlight<3;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(inFlight,3);gate.resolve();const result=await first;assert.equal(max,3);assert.equal(result.succeeded.length,5);assert.deepEqual(result.failed,[])
  assert.deepEqual(f.store.getSnapshot().library.items,[]);assert.equal(f.disk.get(f.keys.doc('a')),'handwriting-kept')
})

test('부분 실패는 성공 항목을 재전송하지 않고 네트워크 실패만 재시도한다', async () => {
  const f=fixture();await f.store.load();let retry=false
  f.api.trash=async id=>{f.calls.push(['trash',id]);if(id==='b'&&!retry)throw Error('offline');if(id==='c')throw Object.assign(Error('forbidden'),{status:403});f.deleted.add(id)}
  const result=await f.store.bulkTrash(['a','b','c']);assert.deepEqual(result.succeeded,['a']);assert.equal(result.failed.length,2)
  retry=true;const after=await f.store.retryBulkTrash();assert.deepEqual(new Set(after.succeeded),new Set(['a','b']));assert.equal(after.failed[0].id,'c')
  assert.deepEqual(f.calls.filter(c=>c[0]==='trash').map(c=>c[1]),['a','b','c','b']);assert.equal(f.store.getSnapshot().bulkTrash.canRetry,false)
})

test('일괄 성공 뒤 조회 실패는 재확인에서 DELETE 없이 조회만 다시 수행한다', async () => {
  const f=fixture(['a']);await f.store.load();let fail=true
  f.api.list=async()=>{if(fail)throw Error('list failed');return page([])}
  await f.store.bulkTrash(['a']);assert.equal(f.store.getSnapshot().bulkTrash.canRetry,true)
  fail=false;await f.store.retryBulkTrash();assert.equal(f.calls.filter(c=>c[0]==='trash').length,1);assert.equal(f.store.getSnapshot().bulkTrash.canRetry,false)
})

test('일괄 응답 유실은 같은 ID만 재시도하고 문서를 삭제하지 않는다', async () => {
  const f=fixture(['a']);await f.store.load();let first=true
  f.api.trash=async id=>{f.calls.push(['trash',id]);f.deleted.add(id);if(first){first=false;throw Error('lost response')}}
  await f.store.bulkTrash(['a']);await f.store.retryBulkTrash();assert.equal(f.deleted.size,1);assert.deepEqual(f.calls.filter(c=>c[0]==='trash').map(c=>c[1]),['a','a'])
  assert.equal(f.disk.get(f.keys.doc('a')),'handwriting-kept')
})

test('401 이후 대기 항목 전송을 멈추며 권한 없는 선택은 요청 전에 거부한다', async () => {
  const f=fixture(['a','b','c','d','e']);await f.store.load()
  f.api.trash=async id=>{f.calls.push(['trash',id]);throw Object.assign(Error('login'),{status:401})}
  const result=await f.store.bulkTrash(['a','b','c','d','e']);assert.equal(result.failed.length,5);assert.ok(f.calls.filter(c=>c[0]==='trash').length<=3)
  const g=fixture(['a']);g.rows.set('a',{...row('a'),permissions:{canTrash:false},canEdit:false});await g.store.load()
  await assert.rejects(g.store.bulkTrash(['a']),{code:'FORBIDDEN'});assert.equal(g.calls.filter(c=>c[0]==='trash').length,0)
})

test('일괄 이동의 지연 성공도 로그아웃 후 저장 목록과 문서를 바꾸지 않는다', async () => {
  const f=fixture(['a']);await f.store.load();const gate=deferred(),before=f.disk.get(f.keys.index)
  f.api.trash=()=>gate.promise;const writing=f.store.bulkTrash(['a']);f.store.dispose();gate.resolve()
  await assert.rejects(writing,{code:'STALE_ACCOUNT'});assert.equal(f.disk.get(f.keys.index),before);assert.equal(f.disk.get(f.keys.doc('a')),'handwriting-kept')
})

test('응답 유실 일괄 작업을 정리하기 전에는 복원·새 이동을 막고 안내를 닫으면 오래된 재시도를 폐기한다', async () => {
  const f=fixture(['a','b']);await f.store.load()
  f.api.trash=async id=>{f.calls.push(['trash',id]);f.deleted.add(id);throw Error('lost response')}
  f.api.restore=async id=>{f.calls.push(['restore',id]);f.deleted.delete(id);return row(id)}
  await f.store.bulkTrash(['a']);assert.equal(f.store.getSnapshot().bulkTrash.hasRetryableFailures,true)
  await assert.rejects(f.store.lifecycle('restore','a'),{code:'OPERATION_PENDING'})
  await assert.rejects(f.store.bulkTrash(['b']),{code:'OPERATION_PENDING'})
  assert.deepEqual(f.calls.filter(c=>['trash','restore'].includes(c[0])),[['trash','a']])
  f.store.dismissBulkTrash();await f.store.lifecycle('restore','a')
  await assert.rejects(f.store.retryBulkTrash(),{code:'NO_PENDING_OPERATION'})
  assert.equal(f.deleted.has('a'),false);assert.equal(f.disk.get(f.keys.doc('a')),'handwriting-kept')
})


test('선택 휴지통 이동도 각 표지·방향을 계정별 저장소에 보존한다',async()=>{
 const f=fixture(['a','b']);await f.store.load();
 await f.store.setDiaries(rows=>rows.map((row,i)=>({...row,pageSize:i?'landscape':'portrait',cover:{enabled:true,color:i?'#112233':'#445566',elastic:Boolean(i)}})));
 await f.store.bulkTrash(['a','b']);
 const meta=JSON.parse(f.disk.get(f.keys.localMeta));
 for(const item of f.store.getSnapshot().trash){assert.deepEqual(item.cover,meta[item.id].cover);assert.equal(item.pageSize,meta[item.id].pageSize)}
 assert.equal(f.store.getSnapshot().trash.length,2);
});
