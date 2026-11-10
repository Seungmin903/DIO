import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
import {encodeText,decodeText} from '../src/diary/services/textPageSync.js'
import {encodeElement} from '../src/collaboration/canvasElements.js'
import {tastingElementId} from '../src/editor/templates/tastingElements.js'
const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001'
const text=(value='A',elementId=id)=>({id:elementId,type:'text',text:value,x:1,y:2,w:40,h:20})
const row=(object,version=1)=>({...encodeText(object),pageId,version})
function fixture(){
 const disk=new Map(),calls=[],operations=new Map();let rows=[],lose=false,version=0,sequence=0
 const api={load:async()=>structuredClone(rows),history:async()=>({items:[],nextUndo:null,nextRedo:null}),
  apply:async(_page,request)=>{calls.push(structuredClone(request));let response=operations.get(request.clientOperationId)
   if(!response){const byId=new Map(rows.map(e=>[e.elementId,e]));for(const e of request.changes.creates??[])byId.set(e.elementId,{...e,pageId,version:++version});for(const e of request.changes.updates??[])byId.set(e.elementId,{...byId.get(e.elementId),...e,version:++version});for(const e of request.changes.deleteElementIds??[])byId.delete(e);rows=[...byId.values()];response={operationId:String(operations.size+1),items:structuredClone(rows),revision:0};operations.set(request.clientOperationId,response)}
   if(lose){lose=false;throw Error('response lost')}return {...response,items:structuredClone(rows)}},control:async()=>{throw Error('unexpected control')}}
 const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)}
 const session=active=>createCanvasSession({api,storage,key:'journal',pageId,diaryId,createId:()=>`40000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,isActive:active??(()=>true)})
 return {api,disk,calls,operations,session,setRows:value=>{rows=value},rows:()=>rows,lose:()=>{lose=true}}
}
test('동일 ID의 다른 서버 요소와 충돌하면 로컬 ID를 바꾸고 후속 편집까지 저장한다',async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[],after:[text('mine')]})
 await s.enqueue({id:'later',pageId,before:[text('mine')],after:[text('mine updated')]})
 f.setRows([row(text('friend'),1)])
 const result=await s.synchronize(),saved=s.snapshot(),resolved=saved.resolvedIdConflicts.at(-1)
 assert.equal(saved.queue.length,0);assert.equal(f.calls.length,2)
 assert.equal(resolved.oldElementId,id);assert.notEqual(resolved.newElementId,id)
 assert.equal(result.objects.find(o=>o.id===id).text,'friend')
 assert.equal(result.objects.find(o=>o.id===resolved.newElementId).text,'mine updated')
 assert.equal(f.rows().find(e=>e.elementId===id).propertiesJson.text,'friend')
 assert.equal(f.rows().find(e=>e.elementId===resolved.newElementId).propertiesJson.text,'mine updated')
})
test('동일 ID와 내용의 생성은 이미 반영된 것으로 처리한다',async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[],after:[text('same')]});f.setRows([row(text('same'),1)])
 await s.synchronize();assert.equal(s.snapshot().queue.length,0);assert.equal(f.calls.length,0)
})
test('두 사용자가 같은 별을 처음 칠하면 서버의 표시를 최신 버전으로 갱신한다',async()=>{
 const f=fixture(),s=f.session(),asset='remote-tasting-note-portrait'
 const mark={id:tastingElementId(pageId,'star-0',asset),type:'shape',shape:'rect',x:0,y:0,w:1,h:1,rotation:0,opacity:1,hidden:true,locked:true,tastingMark:'star-0',fill:'#112233'}
 await s.restore([]);await s.synchronize();await s.enqueue({id:'mine',pageId,before:[],after:[mark]})
 f.setRows([{...encodeElement({...mark,fill:'#abcdef'}),pageId,version:3}])
 const result=await s.synchronize()
 assert.equal(f.calls[0].changes.updates[0].version,3)
 assert.equal(result.objects.length,1);assert.equal(result.objects[0].fill,'#112233')
 assert.equal(s.snapshot().queue.length,0)
})
test('같은 색 별을 동시에 칠한 두 번째 사용자의 작업도 서버 이력으로 전송한다',async()=>{
 const f=fixture(),s=f.session(),asset='remote-tasting-note-portrait'
 const mark={id:tastingElementId(pageId,'star-0',asset),type:'shape',shape:'rect',x:0,y:0,w:1,h:1,rotation:0,opacity:1,hidden:true,locked:true,tastingMark:'star-0',fill:'#112233'}
 await s.restore([]);await s.synchronize();await s.enqueue({id:'mine',pageId,before:[],after:[mark]})
 f.setRows([{...encodeElement(mark),pageId,version:3}]);await s.synchronize()
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].changes.updates[0].version,3)
 assert.equal(f.calls[0].clientOperationId,'mine');assert.equal(s.snapshot().queue.length,0)
})
test('ID 충돌 자동 복구 기록은 재시작 후에도 유지된다',async()=>{
 const f=fixture();let s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[],after:[text('mine')]});f.setRows([row(text('friend'),1)])
 await s.synchronize();const chosen=s.snapshot().resolvedIdConflicts.at(-1).newElementId
 s=f.session();await s.restore([text('mine',chosen)]);const saved=s.snapshot()
 assert.equal(saved.queue.length,0);assert.equal(saved.resolvedIdConflicts.at(-1).newElementId,chosen)
 assert.equal(f.rows().some(e=>e.elementId===id&&e.propertiesJson.text==='friend'),true)
 assert.equal(f.rows().some(e=>e.elementId===chosen&&e.propertiesJson.text==='mine'),true)
})
test('서버 조회 중 추가된 편집도 저장 대기열에서 유실되지 않는다',async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 let release,started;const ready=new Promise(resolve=>{started=resolve}),gate=new Promise(resolve=>{release=resolve})
 const originalLoad=f.api.load;f.api.load=async()=>{started();await gate;return originalLoad()}
 const pending=s.synchronize();await ready
 await s.enqueue({id:'during-load',pageId,before:[],after:[text('during load')]})
 release();const result=await pending
 assert.equal(result.objects[0].text,'during load');assert.equal(s.snapshot().queue.length,0)
 assert.equal(f.rows()[0].propertiesJson.text,'during load')
})
test('응답 유실과 앱 재시작 후 동일한 작업 ID·본문으로 재시도하며 두 행동을 합치지 않는다',async()=>{
 const f=fixture();let s=f.session();await s.restore([]);await s.enqueue({id:'a',pageId,before:[],after:[text('A')]});f.lose()
 await assert.rejects(s.synchronize());const first=f.calls[0]
 s=f.session();await s.restore([]);await s.enqueue({id:'b',pageId,before:[text('A')],after:[text('B')]});const result=await s.synchronize()
 assert.deepEqual(f.calls[1],first);assert.equal(f.operations.size,2);assert.deepEqual(f.calls.map(r=>r.clientOperationId),['a','a','b'])
 assert.equal(result.objects[0].text,'B');assert.equal(s.snapshot().queue.length,0)
})
test('같은 요소의 동시 수정도 최신 버전에 내 변경을 반영하고 동기화를 계속한다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('mine')]});f.setRows([row(text('friend'),2)])
 const result=await s.synchronize();assert.equal(f.calls.length,1)
 assert.equal(result.objects[0].text,'mine');assert.equal(s.snapshot().queue.length,0);assert.equal(f.calls[0].changes.updates[0].version,2)
})
test('친구가 다른 요소를 추가해도 내 작업만 전송하고 양쪽 요소를 유지한다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('mine')]})
 f.setRows([row(text()),row(text('friend','50000000-0000-4000-8000-000000000001'))]);const result=await s.synchronize()
 assert.equal(f.calls[0].changes.updates.length,1);assert.deepEqual(result.objects.map(o=>o.text),['mine','friend'])
})
test('실행 취소 응답 유실 재시도는 같은 명령만 복구하며 다음 작업까지 취소하지 않는다',async()=>{
 const f=fixture();f.setRows([row(text())]);let applied=false,lose=true;const controls=[]
 let historyCalls=0;f.api.history=async()=>historyCalls++===0?{items:[],nextUndo:null,nextRedo:null}:({items:[],nextUndo:applied?null:{operationId:'1',revision:0},nextRedo:applied?{operationId:'1',revision:1}:null})
 f.api.control=async(_page,direction,request)=>{controls.push({direction,request});applied=true;f.setRows([]);if(lose){lose=false;throw Error('lost')};return {items:[],operationId:'1',clientOperationId:'initial',revision:1}}
 const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('B')]});await s.synchronize() // 이번 세션 작업(operationId '1')만 되돌리기 대상
 await assert.rejects(s.control('undo'))
 const restored=f.session();await restored.restore([text()]);const result=await restored.control('undo')
 assert.equal(controls.length,2);assert.deepEqual(controls[0],controls[1]);assert.equal(result.direction,'undo');assert.equal(result.objects.length,0)
})
test('로그아웃 이후 도착한 조회 응답은 로컬 기록에 반영하지 않는다',async()=>{
 const f=fixture();let active=true,resolve;f.api.load=()=>new Promise(r=>resolve=r)
 const s=f.session(()=>active);await s.restore([]);const pending=s.synchronize();await new Promise(r=>setImmediate(r));active=false;resolve([row(text('other'))])
 await assert.rejects(pending);assert.equal(s.snapshot().base,null)
})


test('앱 재시작 시 본문 저장이 큐 저장보다 앞섰어도 더 최신의 기기 편집을 복구한다',async()=>{
 const f=fixture();f.setRows([row(text())]);let s=f.session()
 await s.restore([text()]);await s.synchronize();await s.acceptImport([text()])
 const savedAt=s.snapshot().uiLocalAt+1
 s=f.session();await s.restore([text('newer saved document')],savedAt)
 const result=await s.synchronize()
 assert.equal(result.objects[0].text,'newer saved document')
 assert.equal(f.calls.length,1)
})

test('같은 요소의 다른 속성은 함께 반영한다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('mine')]})
 f.setRows([row({...text(),x:99},2)]);const result=await s.synchronize()
 assert.equal(result.objects[0].text,'mine');assert.equal(result.objects[0].x,99)
})
test('삭제된 요소는 오래된 수정으로 되살리지 않는다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('mine')]});f.setRows([])
 const result=await s.synchronize();assert.equal(result.objects.length,0);assert.equal(f.calls.length,0)
})
test('409로 거절된 요청은 최신 버전과 새 ID로 복구한다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('mine')]})
 const apply=f.api.apply;let rejected
 f.api.apply=async(p,r)=>{rejected=r;f.api.apply=apply;f.setRows([row({...text(),x:77},2)]);throw Object.assign(Error('race'),{status:409})}
 await assert.rejects(s.synchronize(),e=>e.status===409)
 const result=await s.synchronize();assert.equal(result.objects[0].x,77);assert.equal(result.objects[0].text,'mine');assert.notEqual(f.calls[0].clientOperationId,rejected.clientOperationId)
 assert.equal(s.snapshot().queue.length,0)
})
test('실행 취소 충돌 후에도 일반 편집을 계속한다',async()=>{
 const f=fixture();f.setRows([row(text())]);const s=f.session();await s.restore([text()]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('B')]});await s.synchronize() // 이번 세션 작업(operationId '1')
 f.api.history=async()=>({items:[],nextUndo:{operationId:'1',revision:0},nextRedo:null})
 let attempts=0;f.api.control=async()=>{attempts++;throw Object.assign(Error('conflict'),{status:409})}
 await assert.rejects(s.control('undo'),e=>e.status===409);assert.equal(s.snapshot().control,null)
 await s.enqueue({id:'next',pageId,before:[text('B')],after:[text('next')]});const result=await s.synchronize()
 assert.equal(attempts,1);assert.equal(result.objects[0].text,'next')
})
test('오래된 첫 스냅샷은 보관하고 최신 서버로 합류한다',async()=>{
 const f=fixture();f.setRows([row(text('server'),2)]);const s=f.session();await s.restore([text('old')]);const result=await s.synchronize()
 assert.equal(result.objects[0].text,'server');assert.equal(result.expectedLocal[0].text,'old');assert.equal(s.snapshot().recoveredLocal[0].objects[0].text,'old')
})

test('두 기기가 같은 좌표에 동시에 그린 별도 필기는 모두 남는다',async()=>{
 const f=fixture(),a=f.session(),b=f.session()
 await a.restore([]);await b.restore([]);await a.synchronize();await b.synchronize()
 const stroke=elementId=>({id:elementId,type:'stroke',x:10,y:10,w:20,h:20,points:[{x:0,y:0},{x:20,y:20}],strokeWidth:3})
 const one=stroke(id),two=stroke('50000000-0000-4000-8000-000000000001')
 await a.enqueue({id:'draw-a',pageId,before:[],after:[one]});await b.enqueue({id:'draw-b',pageId,before:[],after:[two]})
 await Promise.all([a.synchronize(),b.synchronize()])
 const first=await a.synchronize(),second=await b.synchronize()
 assert.deepEqual(new Set(first.objects.map(o=>o.id)),new Set([one.id,two.id]));assert.deepEqual(new Set(second.objects.map(o=>o.id)),new Set([one.id,two.id]))
})

test('400으로 거절된 작업은 보관하고 다음 편집은 계속 전송한다',async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'bad',pageId,before:[],after:[text()]})
 const other=text('valid','60000000-0000-4000-8000-000000000001')
 await s.enqueue({id:'good',pageId,before:[text()],after:[text(),other]})
 const apply=f.api.apply;f.api.apply=async(p,r)=>{if(r.clientOperationId==='bad')throw Object.assign(Error('invalid'),{status:400,code:'INVALID_CANVAS'});return apply(p,r)}
 const result=await s.synchronize();assert.equal(result.rejectedCount,1);assert.equal(s.snapshot().queue.length,0)
 assert.equal(s.snapshot().rejectedEdits[0].after[0].text,'A');assert.equal(result.objects[0].text,'valid')
 const restored=f.session();await restored.restore([]);assert.equal(restored.snapshot().rejectedEdits[0].id,'bad')
 // 다음 동기화는 새로 거절된 편집이 없으니 '저장 안 됨'이 아니다(보관한 거절은 keptRejectedCount 로만 남는다)
 const next=await s.synchronize();assert.equal(next.rejectedCount,0);assert.equal(next.keptRejectedCount,1)
})
for(const status of [403,404])test(`${status} 확정 거절은 보관 후 전송을 멈추고 큐 머리는 해제한다`,async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'bad',pageId,before:[],after:[text()]});await s.enqueue({id:'next',pageId,before:[text()],after:[text('next')]})
 let calls=0;f.api.apply=async()=>{calls++;throw Object.assign(Error('denied'),{status})}
 await assert.rejects(s.synchronize(),e=>e.status===status)
 assert.equal(calls,1);assert.equal(s.snapshot().rejectedEdits[0].id,'bad');assert.equal(s.snapshot().queue[0].id,'next')
})

test('요소 삭제 404는 같은 묶음의 다른 수정까지 버리지 않고 최신 상태로 다시 구성한다',async()=>{
 const f=fixture(),s=f.session(),otherId='60000000-0000-4000-8000-000000000001'
 const x=text('X'),y=text('Y',otherId);f.setRows([row(x),row(y)])
 await s.restore([x,y]);await s.synchronize()
 await s.enqueue({id:'both',pageId,before:[x,y],after:[text('X changed'),text('Y changed',otherId)]})
 const apply=f.api.apply;let oldRequest
 f.api.apply=async(p,r)=>{oldRequest=r;f.setRows([row(y,2)]);f.api.apply=apply;throw Object.assign(Error('element deleted'),{status:404,code:'CANVAS_ELEMENT_NOT_FOUND'})}
 await assert.rejects(s.synchronize(),e=>e.code==='CANVAS_ELEMENT_NOT_FOUND')
 assert.equal(s.snapshot().queue.length,1);assert.equal(s.snapshot().rejectedEdits,undefined)
 const result=await s.synchronize();assert.equal(result.objects.length,1);assert.equal(result.objects[0].text,'Y changed')
 assert.notEqual(f.calls[0].clientOperationId,oldRequest.clientOperationId);assert.equal(f.calls[0].changes.updates.length,1)
})

for(const duplicate of [false,true])test(`순서 변경은 재조회·세션 재시작 후 유지하고 비공유 오디오의 키는 보존한다 (${duplicate?'중복 복구':'기존 슬롯'})`,async()=>{
 const {createCanvasApi}=await import('../src/collaboration/canvasApi.js')
 const a=text('A'),b=text('B','60000000-0000-4000-8000-000000000001'),c=text('C','60000000-0000-4000-8000-000000000002')
 const photoId='60000000-0000-4000-8000-000000000003',photoKey=duplicate?10:15
 let rows=[{...row(a),sortKey:10},{...row(b),sortKey:20},{...row(c),sortKey:30},{elementId:photoId,pageId,elementType:'AUDIO',sortKey:photoKey}],request,sequence=0
 const ordered=()=>structuredClone(rows).sort((a,b)=>a.sortKey-b.sortKey||a.elementId.localeCompare(b.elementId))
 const api=createCanvasApi(async options=>{
  if(options.path.endsWith('/history/me'))return {items:[],nextUndo:null,nextRedo:null}
  if(!options.method)return {page:{pageId,diaryId},elements:ordered()}
  request=options.body
  for(const update of request.changes.updates??[]){const old=rows.find(e=>e.elementId===update.elementId);Object.assign(old,update,{version:old.version+1})}
  return {operationId:'1',revision:0,items:ordered()}
 })
 const disk=new Map(),storage={getItem:async key=>disk.get(key)??null,setItem:async(key,value)=>disk.set(key,value)}
 const session=()=>createCanvasSession({api,storage,key:'ordering',pageId,diaryId,createId:()=>`order-${++sequence}`})
 const first=session();await first.restore([a,b,c]);await first.synchronize()
 await first.enqueue({id:'reorder',pageId,before:[a,b,c],after:[c,a,b]});const result=await first.synchronize()
 assert.deepEqual(result.objects.map(o=>o.id),[c.id,a.id,b.id]);assert.equal(rows.find(e=>e.elementId===photoId).sortKey,photoKey)
 assert.equal(request.changes.updates.some(e=>e.elementId===photoId),false)
 assert.equal(new Set(rows.map(e=>e.sortKey)).size,4)
 await first.acceptImport(result.objects);const restored=session();await restored.restore(result.objects)
 assert.deepEqual((await restored.synchronize()).objects.map(o=>o.id),[c.id,a.id,b.id])
})
test('이전에 연 동안 · 다른 기기의 실행 기록은 되돌리기 · 다시하기 후보에서 빼고 이번에 만든 것만 남긴다',async()=>{
 const f=fixture();f.setRows([row(text())])
 let state='old'
 f.api.history=async()=>state==='old'
  ?{items:[{operationId:'7'}],nextUndo:{operationId:'7',revision:1},nextRedo:{operationId:'5',revision:1}}
  :{items:[{operationId:'1'},{operationId:'7'}],nextUndo:{operationId:'1',revision:2},nextRedo:null}
 const s=f.session();await s.restore([text()])
 const first=await s.synchronize()
 assert.equal(first.history.nextUndo,null);assert.equal(first.history.nextRedo,null)
 await assert.rejects(s.control('undo'),e=>e.code==='NO_CANVAS_HISTORY')
 await assert.rejects(s.control('redo'),e=>e.code==='NO_CANVAS_HISTORY')
 await s.enqueue({id:'a',pageId,before:[text()],after:[text('B')]}) // 이번 세션 작업 → 서버가 operationId '1' 로 반영
 state='new'
 const next=await s.synchronize()
 assert.equal(next.history.nextUndo.operationId,'1')
})
test('서버 기록 조회가 처음에 실패했다가 나중에 성공해도 이번 세션에 한 작업은 되돌리기 후보로 남고, 편집 전송은 막히지 않는다',async()=>{
 const f=fixture();let fail=true
 f.api.history=async()=>{if(fail)throw Error('history down');return {items:[{operationId:'1'}],nextUndo:{operationId:'1',revision:0},nextRedo:null}}
 const s=f.session();await s.restore([])
 await s.enqueue({id:'a',pageId,before:[],after:[text('A')]})
 await s.synchronize().catch(()=>{})
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].clientOperationId,'a');assert.equal(s.snapshot().queue.length,0)
 fail=false
 const next=await s.synchronize();assert.equal(next.history.nextUndo.operationId,'1')
})
test('개인 경로(1인 다이어리)는 저장 응답에 작업 번호가 없어도 첫 저장 전에 잡은 기준선보다 새 작업은 되돌릴 수 있다(649)',async()=>{
 const f=fixture();f.setRows([row(text())])
 const plain=f.api.apply;f.api.apply=async(page,request)=>{const {operationId,...rest}=await plain(page,request);return rest} // 요소 API 처럼 번호 없음
 let state='old'
 f.api.history=async()=>state==='old'
  ?{items:[{operationId:'5'}],nextUndo:{operationId:'5',revision:1},nextRedo:null}
  :{items:[{operationId:'6'},{operationId:'5'}],nextUndo:{operationId:'6',revision:2},nextRedo:null}
 const s=f.session();await s.restore([text()])
 const first=await s.synchronize();assert.equal(first.history.nextUndo,null) // 이전 기록(5)은 제외
 await s.enqueue({id:'mine',pageId,before:[text()],after:[text('B')]});state='new'
 const next=await s.synchronize();assert.equal(next.history.nextUndo.operationId,'6')
})
test('ID 충돌 복구 뒤 편집기가 옛 ID로 보낸 편집은 새 ID로 바꿔 저장하고, 결과를 받아들이면 바꾸기를 끝낸다',async()=>{
 const f=fixture(),s=f.session();await s.restore([]);await s.synchronize()
 await s.enqueue({id:'mine',pageId,before:[],after:[text('mine')]});f.setRows([row(text('friend'),1)])
 const result=await s.synchronize(),renamed=result.idRemaps[id]
 assert.ok(renamed&&renamed!==id)
 await s.enqueue({id:'stale',pageId,before:[text('mine')],after:[text('mine edited')]})
 await s.synchronize()
 assert.equal(f.rows().find(e=>e.elementId===id).propertiesJson.text,'friend','옛 ID(상대 요소)는 그대로')
 assert.equal(f.rows().find(e=>e.elementId===renamed).propertiesJson.text,'mine edited')
 await s.acceptImport([text('friend'),text('mine edited',renamed)])
 const after=await s.synchronize();assert.equal(after.idRemaps,null)
})
