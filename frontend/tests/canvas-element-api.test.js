import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasElementApi } from '../src/collaboration/canvasElementApi.js'
import { createCanvasSession } from '../src/collaboration/canvasSession.js'
import { encodeElement } from '../src/collaboration/canvasElements.js'

const pageId = '10000000-0000-4000-8000-000000000001'
const diaryId = '20000000-0000-4000-8000-000000000001'
const id = '30000000-0000-4000-8000-000000000001'
const other = '30000000-0000-4000-8000-000000000002'
const object = (elementId = id, text = 'A') => ({ id: elementId, type: 'text', text, x: 1, y: 2, w: 40, h: 20 })
function fixture() {
  const calls = [], rows = new Map(), deleted = new Map(), disk = new Map()
  let lose = false, sequence = 0
  const ordered = () => [...rows.values()].sort((a,b) => a.sortKey-b.sortKey)
  const put = value => { const previous = rows.get(value.elementId) ?? deleted.get(value.elementId); rows.set(value.elementId, { ...previous, ...value, pageId, sortKey: value.sortKey ?? previous?.sortKey ?? rows.size + 1, version: (previous?.version ?? -1) + 1 }); deleted.delete(value.elementId) }
  const transport = async request => {
    calls.push(structuredClone(request))
    const { method, path, body } = request, elementId = path.split('/')[4]
    if (path.endsWith('/history/me')) return { items: [], nextUndo: null, nextRedo: null }
    if (!method) return { items: structuredClone(ordered()) }
    if (path.endsWith('/batch')) {
      for (const value of body.creates ?? []) put(value)
      for (const value of body.updates ?? []) put(value)
      for (const value of body.deleteElementIds ?? []) { deleted.set(value, rows.get(value)); rows.delete(value) }
      for (const value of body.restoreElementIds ?? []) put(deleted.get(value))
    } else if (method === 'DELETE') { deleted.set(elementId, rows.get(elementId)); rows.delete(elementId) }
    else if (path.endsWith('/restore')) put(deleted.get(elementId))
    else put({ ...body, elementId: elementId ?? body.elementId })
    if (lose) { lose = false; throw Object.assign(Error('lost'), { code: 'NETWORK_ERROR' }) }
    return path.endsWith('/batch') ? { items: structuredClone(ordered()) } : method === 'DELETE' ? null : { element: structuredClone(rows.get(elementId ?? body.elementId)) }
  }
  const api = createCanvasElementApi(transport)
  const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key,value) => disk.set(key,value) }
  return { api, calls, rows, put, lose: () => { lose = true }, session: () => createCanvasSession({ api, storage, key: 'elements', pageId, diaryId, createId: () => `command-${++sequence}` }) }
}

test('단건 저장은 사전 목록과 쓰기 응답으로 확정하고 사후 GET 실패에 영향받지 않는다', async () => {
 for (const kind of ['create','update','delete','restore']) {
  const row={...encodeElement(object()),pageId,version:1,sortKey:7}
  const calls=[]
  const api=createCanvasElementApi(async r=>{
   calls.push(r)
   if(!r.method){if(calls.length>1)throw Error('follow-up network failure');return {items:['update','delete'].includes(kind)?[row]:[]}}
   return r.method==='DELETE'?null:{element:{...row,x:kind==='update'?10:1,version:2}}
  })
  const changes=kind==='create'?{creates:[encodeElement(object())]}:kind==='update'?{updates:[{...row,x:10}]}:kind==='delete'?{deleteElementIds:[id]}:{restoreElementIds:[id]}
  const result=await api.apply(pageId,{changes,expectedVersions:{[id]:1}})
  assert.equal(calls.length,2)
  assert.equal(result.items.length,kind==='delete'?0:1)
  if(kind!=='delete')assert.equal(result.items[0].version,2)
 }
})

test('요소 1000개 페이지의 단건 저장도 GET 1회와 PATCH 1회이며 정렬 경계와 다른 요소를 보존한다',async()=>{
 const rows=Array.from({length:1000},(_,i)=>({...encodeElement(object(`40000000-0000-4000-8000-${String(i).padStart(12,'0')}`)),pageId,version:1,sortKey:i}))
 rows.push({...encodeElement(object(id)),pageId,version:1,sortKey:1000},{elementId:other,pageId,elementType:'AUDIO',sortKey:1001})
 const calls=[]
 const api=createCanvasElementApi(async r=>{calls.push(r);return r.method?{element:{...rows[1000],x:20,version:2}}:{items:rows}})
 const result=await api.apply(pageId,{changes:{updates:[{...rows[1000],x:20}]}})
 assert.deepEqual(calls.map(r=>r.method??'GET'),['GET','PATCH'])
 assert.equal(result.items.length,1001);assert.equal(result.items.at(-1).x,20)
 assert.ok(result.items.sortKeys.includes(1001))
})

test('batch 전체 활성 목록은 건드리지 않은 요소를 보존하고 삭제·추가를 반영한다',async()=>{
 const old={...encodeElement(object()),pageId,version:0,sortKey:1}
 const untouched={...encodeElement(object(other)),pageId,version:0,sortKey:2}
 const remote={...encodeElement(object('30000000-0000-4000-8000-000000000003')),pageId,version:0,sortKey:3}
 const api=createCanvasElementApi(async r=>r.method?{items:[untouched,remote]}:{items:[old,untouched]})
 const result=await api.apply(pageId,{changes:{creates:[encodeElement(object(remote.elementId))],deleteElementIds:[id]},expectedVersions:{[id]:0}})
 // The server's complete snapshot is authoritative, rather than a change-only list.
 assert.deepEqual(result.items.map(e=>e.elementId),[other,remote.elementId])
})

test('요소 API 6개의 경로·메서드·응답 형식으로 조회·생성·수정·삭제·복구·일괄 변경한다', async () => {
  const f = fixture(), a = encodeElement(object())
  await f.api.create(pageId, a)
  const loaded = await f.api.load(pageId)
  await f.api.update(pageId, id, { version: loaded[0].version, x: 10 })
  await f.api.remove(pageId, id)
  assert.equal((await f.api.load(pageId)).length, 0)
  assert.equal((await f.api.restore(pageId, id)).x, 10)
  await f.api.batch(pageId, { creates: [encodeElement(object(other))], updates: [{ elementId: id, version: f.rows.get(id).version, x: 20 }] })
  assert.equal((await f.api.load(pageId)).length, 2)
  assert.ok(f.calls.some(r => r.method === 'POST' && r.path.endsWith('/elements')))
  assert.ok(f.calls.some(r => r.method === 'PATCH' && r.path.endsWith(`/elements/${id}`)))
  assert.ok(f.calls.some(r => r.method === 'DELETE' && r.path.endsWith(`/elements/${id}`)))
  assert.ok(f.calls.some(r => r.method === 'POST' && r.path.endsWith('/restore')))
  assert.ok(f.calls.some(r => r.method === 'POST' && r.path.endsWith('/batch')))
  assert.equal(f.calls.some(r => r.path.includes('canvas-operations')), false)
})

test('실제 저장 세션은 한 요소 생성·수정·삭제와 다중 변경을 요소 API에만 전송한다', async () => {
  const f = fixture(), session = f.session(), a = object(), b = object(other)
  await session.restore([]); await session.synchronize()
  for (const [before, after] of [[[],[a]], [[a],[{...a,x:10}]], [[{...a,x:10}],[{...a,x:20},b]], [[{...a,x:20},b],[b]]]) {
    await session.enqueue({ id: `edit-${f.calls.length}`, pageId, before, after }); await session.synchronize(); await session.acceptImport(after)
  }
  assert.deepEqual([...f.rows.keys()], [other])
  assert.deepEqual(f.calls.filter(r=>r.method).map(r=>[r.method,r.path.split('/').at(-1)]), [['POST','elements'],['PATCH',id],['POST','batch'],['DELETE',id]])
})

for (const kind of ['create','update','delete','batch']) test(`${kind} 응답 유실 후 세션 재시작은 이미 반영된 변경을 다시 쓰지 않는다`, async () => {
  const f = fixture(), a = object(), b = object(other)
  const before = kind === 'create' || kind === 'batch' ? [] : [a]
  const after = kind === 'delete' ? [] : kind === 'batch' ? [a,b] : [{...a,x:10}]
  if(before.length)f.put(encodeElement(a))
  let session = f.session(); await session.restore(before); await session.synchronize()
  await session.enqueue({id:'lost',pageId,before,after}); f.lose()
  await assert.rejects(session.synchronize(), {code:'NETWORK_ERROR'})
  session = f.session(); await session.restore(before); const result = await session.synchronize()
  assert.equal(f.calls.filter(r=>r.method).length, 1)
  assert.equal(result.objects.length, after.length); assert.equal(session.snapshot().queue.length, 0)
})

test('요소 버전 충돌은 덮어쓰지 않고 409로 전달한다', async () => {
  const f = fixture(); f.put(encodeElement(object()))
  await assert.rejects(f.api.apply(pageId,{ changes:{updates:[{elementId:id,version:99,x:10}]} }), {status:409})
  assert.equal(f.calls.some(r=>r.method),false)
})

test('재시도 생성은 서버 숫자 표기·이름 공백·JSON 키 순서를 정규화하되 내용 차이는 거절한다',async()=>{
 const expected={...encodeElement(object()),name:'  이름  ',sortKey:1,propertiesJson:{a:1,b:2}}
 const current={...expected,pageId,version:0,name:'이름',sortKey:'1.0000000000',propertiesJson:{b:2,a:1}}
 const calls=[]
 const api=createCanvasElementApi(async r=>{calls.push(r);return {items:[current]}})
 await api.apply(pageId,{changes:{creates:[expected]}})
 assert.equal(calls.some(r=>r.method),false)
 for(const patch of [{sortKey:2},{x:2},{propertiesJson:{a:'1',b:2}}]){
  await assert.rejects(api.apply(pageId,{changes:{creates:[{...expected,...patch}]}}),{status:409})
 }
})

test('명시적 복구 변경은 단건 복구 또는 원자적 batch로 전달한다', async () => {
  const f=fixture(); f.put(encodeElement(object())); f.put(encodeElement(object(other)))
  await f.api.remove(pageId,id); await f.api.remove(pageId,other)
  await f.api.apply(pageId,{changes:{restoreElementIds:[id]},expectedVersions:{[id]:0}})
  assert.equal(f.calls.at(-1).path,`/pages/${pageId}/elements/${id}/restore`)
  await f.api.apply(pageId,{changes:{restoreElementIds:[other],updates:[{elementId:id,version:f.rows.get(id).version,x:9}]},expectedVersions:{[other]:0}})
  const write=f.calls.filter(r=>r.method).at(-1)
  assert.equal(write.path,`/pages/${pageId}/elements/batch`)
  assert.deepEqual(write.body.restoreElementIds,[other]); assert.equal(write.body.updates[0].x,9)
})

test('지원하지 않는 요소의 순서와 미디어 준비·사진 수신 경로를 유지한다', async () => {
  const row={...encodeElement(object()),pageId,version:0,sortKey:2}
  const audio={elementId:other,pageId,elementType:'AUDIO',sortKey:99}
  let hydrated,prepared
  const media={hydrate:async rows=>{hydrated=rows},prepare:async body=>{prepared=body;return body}}
  const api=createCanvasElementApi(async()=>({items:[row,audio]}),media)
  const loaded=await api.load(pageId)
  assert.equal(loaded.length,1); assert.deepEqual(loaded.sortKeys,[2,99]); assert.equal(hydrated,loaded)
  const body={changes:{creates:[encodeElement(object())]}}
  assert.equal(await api.prepare(body),body); assert.equal(prepared,body)
})

test('다른 페이지·중복 ID·잘못된 요소 응답과 권한 오류는 성공으로 취급하지 않는다', async () => {
  const row={...encodeElement(object()),pageId,version:0}
  for(const items of [[{...row,pageId:diaryId}],[row,row],[{...row,width:0}]]) {
    const api=createCanvasElementApi(async()=>({items}))
    await assert.rejects(api.load(pageId))
  }
  const error=Object.assign(Error('denied'),{status:403})
  await assert.rejects(createCanvasElementApi(async()=>{throw error}).load(pageId),error)
})
