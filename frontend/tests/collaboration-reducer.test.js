import test from 'node:test'
import assert from 'node:assert/strict'
import {collaborationReducer} from '../src/collaboration/collaborationReducer.js'
import {editorReducer,createInitialState} from '../src/editor/state/editorReducer.js'
const pageId='10000000-0000-4000-8000-000000000001',id='20000000-0000-4000-8000-000000000001',photoId='20000000-0000-4000-8000-000000000002'
const text={id,type:'text',text:'A',x:1,y:2,w:40,h:20}
const photo={id:photoId,type:'photo',x:3,y:4,w:30,h:20}
const initial=()=>createInitialState({pages:[{id:pageId,objects:[text,photo]}]})
const reduce=(state,action)=>collaborationReducer(editorReducer,state,{collaborationId:'30000000-0000-4000-8000-000000000001',...action})
test('완료한 드래그 한 번만 전송하고 취소한 드래그는 보내지 않는다',()=>{
 let s=initial();s=reduce(s,{type:'checkpoint'});s=reduce(s,{type:'updateObject',id,patch:{x:10}});s=reduce(s,{type:'updateObject',id,patch:{x:20}})
 assert.equal(s.collaborationEdits.length,0);s=reduce(s,{type:'commitCheckpoint'});assert.equal(s.collaborationEdits.length,1)
 assert.equal(s.collaborationEdits[0].before[0].x,1);assert.equal(s.collaborationEdits[0].after[0].x,20)
 s=reduce(s,{type:'checkpoint',collaborationId:'40000000-0000-4000-8000-000000000001'});s=reduce(s,{type:'updateObject',id,patch:{x:80}});s=reduce(s,{type:'revertToCheckpoint'})
 assert.equal(s.collaborationEdits.length,1);assert.equal(s.doc.pages[0].objects[0].x,20)
})
test('사진은 기기에만 남고 로컬 실행 취소가 친구의 텍스트를 되돌리지 않는다',()=>{
 let s=reduce(initial(),{type:'updateObject',id:photoId,record:true,patch:{x:9}})
 assert.equal(s.collaborationEdits.length,0);assert.equal(s.collaborationPast.at(-1).hasCanvas,false)
 s=reduce(s,{type:'importCollaborationElements',pageId,expectedElements:[text],objects:[{...text,text:'friend'}]})
 s=reduce(s,{type:'undo'})
 assert.equal(s.doc.pages[0].objects[1].x,3);assert.equal(s.doc.pages[0].objects[0].text,'friend')
})
test('새 로컬 편집을 늦은 서버 응답으로 덮어쓰지 않는다',()=>{
 let s=reduce(initial(),{type:'updateObject',id,record:true,patch:{text:'B'}})
 s=reduce(s,{type:'collaborationHistoryApplied',direction:'undo',historyClientOperationId:s.collaborationEdits[0].id,pageId,expectedElements:[{...text,text:'B'},photo],objects:[text,photo]})
 assert.equal(s.doc.pages[0].objects[0].text,'A');assert.equal(s.collaborationFuture[0].hasCanvas,true)
 s=reduce(s,{type:'updateObject',id,record:true,patch:{text:'C'}})
 assert.equal(reduce(s,{type:'importCollaborationElements',pageId,expectedElements:[text,photo],objects:[]}).doc.pages[0].objects[0].text,'C')
})
test('페이지 이동 시 이전 페이지의 작업을 큐에 남긴다',()=>{
 let s=initial();s.doc.pages.push({id:'second',objects:[]})
 s=reduce(s,{type:'checkpoint'});s=reduce(s,{type:'updateObject',id,patch:{x:10}});s=reduce(s,{type:'selectPage',id:'second'})
 assert.equal(s.collaborationEdits[0].pageId,pageId);assert.equal(s.pageId,'second')
})
test('사진 드래그 중 친구 텍스트 반영을 내 작업으로 기록하지 않으며 취소해도 보존한다',()=>{
 let s=reduce(initial(),{type:'checkpoint'});s=reduce(s,{type:'updateObject',id:photoId,patch:{x:70}})
 s=reduce(s,{type:'importCollaborationElements',pageId,expectedElements:[text,{...photo,x:70}],objects:[{...text,text:'remote'},{...photo,x:70}]})
 const committed=reduce(s,{type:'commitCheckpoint'})
 assert.equal(committed.collaborationEdits.length,0)
 assert.equal(committed.doc.pages[0].objects[1].x,70)
 const cancelled=reduce(s,{type:'revertToCheckpoint'})
 assert.equal(cancelled.doc.pages[0].objects[1].x,3);assert.equal(cancelled.doc.pages[0].objects[0].text,'remote')
 const unchanged=reduce(committed,{type:'importCollaborationElements',pageId,expectedElements:committed.doc.pages[0].objects,objects:committed.doc.pages[0].objects})
 assert.equal(unchanged.doc,committed.doc)
})

test('페이지 삭제를 요소 전체 삭제 요청으로 변환하지 않고 로컬 복원 시 사진을 보존한다',()=>{
 let s=initial();s.doc.pages.push({id:'second',objects:[]})
 s=reduce(s,{type:'removePage',id:pageId})
 assert.equal(s.collaborationEdits.length,0)
 s=reduce(s,{type:'undo'});assert.deepEqual(s.doc.pages.find(p=>p.id===pageId).objects,[text,photo])
})

test('늦은 조회 응답도 내 수정과 상대 새 요소를 함께 표시한다',()=>{
 let s=reduce(initial(),{type:'updateObject',id,record:true,patch:{x:70}})
 const friend={...text,id:'50000000-0000-4000-8000-000000000001',text:'friend'}
 s=reduce(s,{type:'importCollaborationElements',pageId,expectedElements:[text],objects:[{...text,text:'remote'},friend]})
 const mine=s.doc.pages[0].objects.find(o=>o.id===id)
 assert.equal(mine.x,70);assert.equal(mine.text,'remote')
 assert.equal(s.doc.pages[0].objects.some(o=>o.id===friend.id),true)
 assert.equal(s.doc.pages[0].objects.find(o=>o.id===photoId).type,'photo')
 assert.equal(s.collaborationEdits.length,1)
})
test('자동 크기 보정은 실행 취소 기록을 늘리지 않지만 서버에는 전송한다',()=>{
 const s=reduce(initial(),{type:'updateObject',id,patch:{h:25}})
 assert.equal(s.past.length,0);assert.equal(s.collaborationEdits.length,1)
 assert.equal(s.collaborationEdits[0].after[0].h,25)
})

test('상대가 추가한 서버 페이지는 기존 필기와 현재 페이지를 유지하며 목록에 반영한다',()=>{
 const before=initial(),added={id:'50000000-0000-4000-8000-000000000001',objects:[]}
 const s=reduce(before,{type:'importServerPages',pages:[added]})
 assert.equal(s.pageId,pageId);assert.equal(s.doc.pages.length,2)
 assert.deepEqual(s.doc.pages[0].objects,[text,photo]);assert.equal(s.collaborationEdits.length,0)
 const again=reduce(s,{type:'importServerPages',pages:[added]});assert.equal(again.doc.pages.length,2)
 const selected=reduce(again,{type:'importServerPages',pages:[added],selectId:added.id});assert.equal(selected.pageId,added.id)
})

test('서버에서 빠진 현재 페이지는 복구용으로 보관하고 남은 페이지로 전환한다',()=>{
 const other={id:'50000000-0000-4000-8000-000000000001',objects:[]}
 let s=reduce(initial(),{type:'importServerPages',pages:[other]})
 s=reduce(s,{type:'reconcileServerPages',pageIds:[other.id],pages:[]})
 assert.equal(s.pageId,other.id);assert.deepEqual(s.doc.pages,[other])
 assert.deepEqual(s.doc.pageRecovery[0].page.objects,[text,photo])
 assert.equal(s.collaborationEdits.length,0)
})
test('서버 순서를 반영하면서 페이지 내용과 현재 선택을 유지한다',()=>{
 const other={id:'50000000-0000-4000-8000-000000000001',objects:[]}
 const s=reduce(initial(),{type:'importServerPages',pages:[other]})
 const result=reduce(s,{type:'reconcileServerPages',pageIds:[other.id,pageId],pages:[]})
 assert.deepEqual(result.doc.pages.map(p=>p.id),[other.id,pageId]);assert.equal(result.pageId,pageId)
 assert.equal(result.doc.pages[1],s.doc.pages[0])
 const again=reduce(result,{type:'reconcileServerPages',pageIds:[other.id,pageId],pages:[]});assert.equal(again.doc,result.doc)
})

test('회원 초기화는 서버에 없는 페이지를 생성하지 않고 비회원 초기화는 유지한다',()=>{
 const before=initial(),after=reduce(before,{type:'resetDiary'})
 assert.equal(after.doc,before.doc);assert.equal(after.pageId,before.pageId);assert.equal(after.collaborationEdits.length,0)
 assert.notEqual(editorReducer(before,{type:'resetDiary'}).pageId,before.pageId)
})
