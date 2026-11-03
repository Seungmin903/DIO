import test from 'node:test'
import assert from 'node:assert/strict'
import {assertCanvasBatchLimits} from '../src/collaboration/canvasBatchLimits.js'
import {createCanvasApi} from '../src/collaboration/canvasApi.js'
import {createCanvasElementApi} from '../src/collaboration/canvasElementApi.js'
import {createCanvasWriteApi} from '../src/collaboration/canvasWriteApi.js'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
import {collaborationReducer} from '../src/collaboration/collaborationReducer.js'
import {editorReducer,createInitialState} from '../src/editor/state/editorReducer.js'
import {encodeElement} from '../src/collaboration/canvasElements.js'

const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001'
const objects=n=>Array.from({length:n},(_,i)=>({id:`30000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,type:'text',text:'A',x:1,y:2,w:40,h:20}))
const reduce=(state,action)=>collaborationReducer(editorReducer,state,{collaborationId:'command',...action})
for(const field of ['creates','updates','deleteElementIds','restoreElementIds'])test(`${field} 100개는 허용하고 101개는 로컬 오류로 거부한다`,()=>{
  assert.doesNotThrow(()=>assertCanvasBatchLimits({[field]:Array(100).fill('id')}))
  assert.throws(()=>assertCanvasBatchLimits({[field]:Array(101).fill('id')}),e=>e.code==='CANVAS_BATCH_LIMIT'&&e.status===undefined)
})
test('배열별 제한은 총합 제한이 아니며 expectedVersions는 200개까지다',()=>{
  const changes=Object.fromEntries(['creates','updates','deleteElementIds','restoreElementIds'].map(k=>[k,Array(100).fill('id')]))
  const versions=Object.fromEntries(Array.from({length:200},(_,i)=>[i,1]))
  assert.doesNotThrow(()=>assertCanvasBatchLimits(changes,versions))
  assert.throws(()=>assertCanvasBatchLimits(changes,{...versions,extra:1}),{code:'CANVAS_BATCH_LIMIT'})
})
test('개인·공유 직접 API와 경로 준비 모두 초과 요청을 전송 전에 차단한다',async()=>{
  const calls=[],transport=async r=>{calls.push(r);throw Error('unexpected request')}
  const request={changes:{creates:objects(101).map(encodeElement)},expectedVersions:{}}
  await assert.rejects(createCanvasApi(transport).apply(pageId,request),{code:'CANVAS_BATCH_LIMIT'})
  const personal=createCanvasElementApi(transport)
  await assert.rejects(personal.apply(pageId,request),{code:'CANVAS_BATCH_LIMIT'})
  await assert.rejects(personal.batch(pageId,request.changes),{code:'CANVAS_BATCH_LIMIT'})
  await assert.rejects(createCanvasWriteApi(transport,undefined,diaryId).prepare(request),{code:'CANVAS_BATCH_LIMIT'})
  assert.deepEqual(calls,[])
})
test('개인·공유 API는 종류별 100개 혼합 요청을 한 번만 전송한다',async()=>{
  const changes={creates:objects(100).map(encodeElement),updates:objects(100).map(encodeElement),deleteElementIds:objects(100).map(o=>o.id),restoreElementIds:objects(100).map(o=>o.id)}
  const calls=[],transport=async request=>{calls.push(request);return {items:[],operationId:'1',revision:0}}
  await createCanvasElementApi(transport).batch(pageId,changes)
  await createCanvasApi(transport).apply(pageId,{changes,expectedVersions:{},clientOperationId:'one'})
  assert.equal(calls.length,2)
  assert.deepEqual(calls.map(r=>r.path),[`/pages/${pageId}/elements/batch`,`/pages/${pageId}/canvas-operations`])
})
for(const kind of ['create','update','delete'])test(`101개 ${kind}는 문서·선택·Undo·큐를 바꾸지 않고 다음 100개 작업은 허용한다`,()=>{
  const all=objects(101),initial=createInitialState({pages:[{id:pageId,objects:kind==='create'?[]:all}]})
  const action=n=>kind==='create'?{type:'addObjects',objects:all.slice(0,n)}:kind==='delete'?{type:'removeObjects',ids:all.slice(0,n).map(o=>o.id)}
    :{type:'updateMany',record:true,patches:Object.fromEntries(all.slice(0,n).map(o=>[o.id,{x:77}]))}
  const blocked=reduce(initial,action(101))
  assert.equal(blocked.doc,initial.doc);assert.equal(blocked.past,initial.past);assert.equal(blocked.future,initial.future)
  assert.equal(blocked.selectedIds,initial.selectedIds);assert.deepEqual(blocked.collaborationEdits,initial.collaborationEdits)
  assert.ok(blocked.collaborationLimitError.message.includes('100개'))
  const valid=reduce(blocked,action(100))
  assert.notEqual(valid.doc,initial.doc);assert.equal(valid.collaborationEdits.length,1);assert.equal(valid.past.length,1)
})
test('101개 묶음 드래그는 체크포인트 이전 내용과 이력으로 유지하고 빈 완료를 전송하지 않는다',()=>{
  const all=objects(101),initial=createInitialState({pages:[{id:pageId,objects:all}]})
  const checkpoint=reduce(initial,{type:'checkpoint'})
  const rejected=reduce(checkpoint,{type:'updateMany',patches:Object.fromEntries(all.map(o=>[o.id,{x:88}]))})
  assert.equal(rejected.doc,checkpoint.doc);assert.equal(rejected.past,checkpoint.past)
  const complete=reduce(rejected,{type:'commitCheckpoint'})
  assert.equal(complete.collaborationEdits.length,0)
  assert.deepEqual(complete.doc.pages[0].objects,all)
})
test('101개 원격 요소 수신과 게스트 편집은 제한하지 않는다',()=>{
  const initial=createInitialState({pages:[{id:pageId,objects:[]}]})
  const incoming=reduce(initial,{type:'importCollaborationElements',pageId,expectedElements:[],objects:objects(101)})
  assert.equal(incoming.doc.pages[0].objects.length,101);assert.equal(incoming.collaborationLimitError,undefined)
  assert.equal(editorReducer(initial,{type:'addObjects',objects:objects(101)}).doc.pages[0].objects.length,101)
})
test('같은 드래그는 한 번만 안내하고 소비 후에도 재생성하지 않으며 새 드래그는 다시 안내한다',()=>{
  const all=objects(101),initial=createInitialState({pages:[{id:pageId,objects:all}]})
  let state=reduce(initial,{type:'checkpoint',collaborationId:'gesture-one'})
  const move={type:'updateMany',patches:Object.fromEntries(all.map(o=>[o.id,{x:77}]))}
  state=reduce(state,move)
  const first=state.collaborationLimitError
  assert.equal(first.id,'gesture-one');assert.equal(first.pageId,pageId)
  assert.equal(reduce(state,move),state,'반복 이동은 상태 참조까지 유지한다')
  const doc=state.doc,past=state.past
  state=reduce(state,{type:'canvasLimitNoticeShown',id:first.id})
  assert.equal(state.collaborationLimitError,null);assert.equal(state.doc,doc);assert.equal(state.past,past)
  assert.equal(reduce(state,move),state,'토스트 소비 후 같은 드래그도 재안내하지 않는다')
  state=reduce(state,{type:'commitCheckpoint'})
  state=reduce(state,{type:'checkpoint',collaborationId:'gesture-two'})
  state=reduce(state,move)
  assert.equal(state.collaborationLimitError.id,'gesture-two')
  assert.equal(reduce(state,{type:'canvasLimitNoticeShown',id:'gesture-one'}),state,'오래된 소비가 새 알림을 지우지 않는다')
})
test('좌표 드래그는 제스처 누적 대상과 반올림을 검사하고 원위치로 돌아온 변경은 제외한다',()=>{
  const all=objects(101);let state=reduce(createInitialState({pages:[{id:pageId,objects:all}]}),{type:'checkpoint'})
  state=reduce(state,{type:'updateMany',patches:Object.fromEntries(all.slice(0,100).map(o=>[o.id,{x:77}]))})
  const blocked=reduce(state,{type:'updateObject',id:all[100].id,patch:{x:88}})
  assert.equal(blocked.doc,state.doc);assert.ok(blocked.collaborationLimitError)
  state=reduce(blocked,{type:'updateObject',id:all[0].id,patch:{x:all[0].x}})
  const next=reduce(state,{type:'updateObject',id:all[100].id,patch:{x:88}})
  assert.notEqual(next.doc,state.doc)
  let rounded=reduce(createInitialState({pages:[{id:pageId,objects:all}]}),{type:'checkpoint'})
  rounded=reduce(rounded,{type:'updateMany',patches:Object.fromEntries(all.map(o=>[o.id,{x:o.x+0.0001}]))})
  assert.equal(rounded.collaborationLimitError,undefined,'서버에 직렬화되는 0.001 단위에서 같은 좌표는 변경이 아니다')
})
test('좌표 변경 중에는 관계없는 요소 본문을 직렬화하지 않으며 다른 속성 변경은 전체 검사로 복귀한다',()=>{
  const all=objects(101);let state=reduce(createInitialState({pages:[{id:pageId,objects:all}]}),{type:'checkpoint'})
  let reads=0
  Object.defineProperty(state.doc.pages[0].objects[100],'text',{enumerable:true,get(){reads++;return 'untouched'}})
  state=reduce(state,{type:'updateObject',id:all[0].id,patch:{x:77}})
  assert.equal(reads,0)
  state=reduce(state,{type:'updateObject',id:all[0].id,patch:{text:'changed'}})
  assert.ok(reads>0);assert.equal(state.collaborationGesture.limitGeometryIds,null)
  const before=state.doc
  const blocked=reduce(state,{type:'updateMany',patches:Object.fromEntries(all.map(o=>[o.id,{x:88}]))})
  assert.equal(blocked.doc,before);assert.ok(blocked.collaborationLimitError)
})
test('같은 사용자 행동의 생성100·수정100·삭제100은 총합300이어도 허용한다',()=>{
  const all=objects(200),initial=createInitialState({pages:[{id:pageId,objects:all}]})
  const replacements=Object.fromEntries(all.map((o,i)=>[o.id,[i<100?{...o,x:99}:{...o,id:`50000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`}]]))
  const result=reduce(initial,{type:'replaceObjects',replacements})
  assert.notEqual(result.doc,initial.doc);assert.equal(result.collaborationLimitError,undefined)
  assert.equal(result.collaborationEdits.length,1)
})
test('기존에 준비된 restore101 요청도 큐와 명령 ID를 유지하며 차단한다',async()=>{
  const saved={format:2,pageId,diaryId,base:[],uiLocal:[],control:null,recent:[],queue:[{id:'old-command',pageId,before:[],after:[],mediaApiVersion:1,request:{clientOperationId:'old-command',changes:{restoreElementIds:objects(101).map(o=>o.id)},expectedVersions:{}}}]}
  let stored=JSON.stringify(saved),writes=0
  const session=createCanvasSession({api:{load:async()=>[],apply:async()=>{writes++}},storage:{getItem:async()=>stored,setItem:async(k,v)=>{stored=v}},key:'legacy',pageId,diaryId,createId:()=> 'unused'})
  await session.restore([])
  await assert.rejects(session.synchronize(),{code:'CANVAS_BATCH_LIMIT'})
  assert.equal(writes,0);assert.deepEqual(session.snapshot().queue,saved.queue)
})
test('기존 초과 큐는 미디어 준비·쓰기 없이 보존하고 재시작·재시도에도 삭제하지 않는다',async()=>{
  const disk=new Map(),all=objects(101);let prepares=0,writes=0
  const api={load:async()=>[],prepare:async r=>{prepares++;return r},apply:async()=>{writes++;throw Error('unexpected write')},history:async()=>({items:[]})}
  const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)}
  const make=()=>createCanvasSession({api,storage,key:'limit',pageId,diaryId,createId:()=> 'seed'})
  let session=make();await session.restore([])
  await session.enqueue({id:'big',pageId,before:[],after:all})
  await session.enqueue({id:'next',pageId,before:all,after:[...all,{...objects(1)[0],id:'40000000-0000-4000-8000-000000000001'}]})
  for(let i=0;i<2;i++){
    await assert.rejects(session.synchronize(),error=>error.code==='CANVAS_BATCH_LIMIT'&&/이후 편집은 서버에 저장되지 않고 기기에만/.test(error.message)&&/재시도만으로 해결되지/.test(error.message))
    const snapshot=session.snapshot()
    assert.deepEqual(snapshot.queue.map(e=>e.id),['big','next']);assert.equal(snapshot.uiLocal.length,102)
    assert.equal(snapshot.rejectedEdits,undefined);assert.equal(snapshot.recent.length,0)
    session=make();await session.restore([])
  }
  assert.equal(prepares,0);assert.equal(writes,0)
})
test('100개 정상 세션 작업은 한 번의 서버 이력 단위로 전송한다',async()=>{
  const all=objects(100),calls=[],disk=new Map()
  const session=createCanvasSession({api:{load:async()=>[],apply:async(p,r)=>{calls.push(r);return {items:r.changes.creates.map((e,i)=>({...e,pageId,sortKey:i,version:0}))}},history:async()=>({items:[]})},
    storage:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)},key:'valid',pageId,diaryId,createId:()=> 'id'})
  await session.restore([]);await session.enqueue({id:'one-action',pageId,before:[],after:all})
  const result=await session.synchronize()
  assert.equal(calls.length,1);assert.equal(calls[0].clientOperationId,'one-action');assert.equal(result.objects.length,100)
  assert.equal(session.snapshot().queue.length,0)
})
