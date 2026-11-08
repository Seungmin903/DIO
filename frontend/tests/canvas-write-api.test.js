import test from 'node:test'
import assert from 'node:assert/strict'
import { createCanvasWriteApi } from '../src/collaboration/canvasWriteApi.js'
import { createCanvasSession } from '../src/collaboration/canvasSession.js'
import { encodeElement } from '../src/collaboration/canvasElements.js'

const diaryId='10000000-0000-4000-8000-000000000001',pageId='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001'
const object={id,type:'text',text:'A',x:1,y:2,w:40,h:20}
const request={clientOperationId:id,changes:{creates:[encodeElement(object)]},expectedVersions:{}}
function fixture(){
 const calls=[],disk=new Map();let shared=false,rows=[],lose=false
 const transport=async r=>{
  calls.push(structuredClone(r))
  if(r.path.endsWith('/members'))return {members:[{userId:'1',role:'OWNER'},...(shared?[{userId:'2',role:'EDITOR'}]:[])]}
  if(r.path.endsWith('/history/me'))return {items:[],nextUndo:null,nextRedo:null}
  if(!r.method)return r.path.endsWith('/elements')?{items:rows}:{page:{pageId,diaryId},elements:rows}
  if(lose){lose=false;throw Error('network lost')}
  if(r.path.endsWith('/canvas-operations'))return {operationId:'1',revision:0,items:rows=r.body.changes.creates.map(e=>({...e,pageId,version:0}))}
  return {element:(rows=[{...r.body,pageId,version:0}])[0]}
 }
 const api=createCanvasWriteApi(transport,undefined,diaryId)
 return {api,calls,share:value=>{shared=value},lose:()=>{lose=true},session:()=>createCanvasSession({api,storage:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)},key:'routing',pageId,diaryId,createId:()=>id})}
}

test('개인 페이지 소속은 최초 조회에서 검증하고 같은 세션 재조회에서는 반복하지 않는다',async()=>{
 const f=fixture();await f.api.load(pageId,diaryId);await f.api.load(pageId,diaryId)
 assert.equal(f.calls.filter(r=>r.path===`/pages/${pageId}`).length,1)
 await assert.rejects(f.api.load(pageId,'other-diary'),{code:'INVALID_CANVAS_PAGE_MEMBERSHIP'})
 const calls=[]
 const api=createCanvasWriteApi(async r=>{calls.push(r);return r.path.endsWith('/members')?{members:[{userId:'1',role:'OWNER'}]}:{page:{pageId,diaryId:'other-diary'}}},undefined,diaryId)
 await assert.rejects(api.load(pageId,diaryId),{code:'INVALID_CANVAS_PAGE_MEMBERSHIP'})
 assert.equal(calls.some(r=>r.path.endsWith('/elements')),false)
})

test('개인·공유 조회와 저장을 참여 멤버 기준으로 구분하며 내부 경로 표시는 전송하지 않는다',async()=>{
 for(const shared of [false,true]){
  const f=fixture();f.share(shared);await f.api.load(pageId,diaryId)
  assert.equal(f.calls.at(-1).path,shared?`/pages/${pageId}`:`/pages/${pageId}/elements`)
  const prepared=await f.api.prepare(request);await f.api.apply(pageId,prepared)
  const writes=f.calls.filter(r=>r.method)
  assert.equal(writes.length,1);assert.equal(writes[0].path,shared?`/pages/${pageId}/canvas-operations`:`/pages/${pageId}/elements`)
  assert.equal('canvasWriteMode' in writes[0].body,false)
 }
})

for(const initial of [false,true])test(`전송 실패·재시작·공유 상태 변경에도 준비된 ${initial?'공유':'개인'} 작업의 경로를 유지한다`,async()=>{
 const f=fixture();f.share(initial)
 let session=f.session();await session.restore([]);await session.synchronize()
 await session.enqueue({id,pageId,before:[],after:[object]});f.lose();await assert.rejects(session.synchronize())
 f.share(!initial);session=f.session();await session.restore([]);await session.synchronize()
 const writes=f.calls.filter(r=>r.method)
 assert.equal(writes.length,2);assert.equal(writes[0].path,writes[1].path);assert.deepEqual(writes[0].body,writes[1].body)
})

test('경로 표시가 없는 기존 대기 작업은 원래 공동편집 API와 작업 ID를 유지한다',async()=>{
 const f=fixture();await f.api.apply(pageId,request)
 assert.equal(f.calls[0].path,`/pages/${pageId}/canvas-operations`)
 assert.deepEqual(f.calls[0].body,request)
})

test('멤버 조회 실패·잘못된 응답은 개인 모드로 추정하지 않고 저장을 중단한다',async()=>{
 for(const body of [{},{members:[]},{members:[{userId:'1',role:'OWNER'},{userId:'1',role:'EDITOR'}]},{members:[{userId:'1',role:'INVALID'}]}]){
  const calls=[];const api=createCanvasWriteApi(async r=>{calls.push(r);return body},undefined,diaryId)
  await assert.rejects(api.prepare(request),{code:'INVALID_CANVAS_MEMBERSHIP'})
  assert.equal(calls.some(r=>r.method),false)
 }
 const failure=Object.assign(Error('forbidden'),{status:403})
 await assert.rejects(createCanvasWriteApi(async()=>{throw failure},undefined,diaryId).prepare(request),failure)
})

test('참여 멤버 조회는 잠시 기억하고 멤버 변경 이벤트에 비운다',async()=>{
 const f=fixture();await f.api.load(pageId,diaryId);await f.api.load(pageId,diaryId);const prepared=await f.api.prepare(request);await f.api.apply(pageId,prepared)
 assert.equal(f.calls.filter(r=>r.path.endsWith('/members')).length,1)
 f.share(true);f.api.invalidateMembership();await f.api.load(pageId,diaryId)
 assert.equal(f.calls.filter(r=>r.path.endsWith('/members')).length,2);assert.equal(f.calls.at(-1).path,`/pages/${pageId}`)
})
