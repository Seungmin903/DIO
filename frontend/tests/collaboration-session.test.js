import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
import {encodeText,decodeText} from '../src/diary/services/textPageSync.js'
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
 f.api.history=async()=>({items:[],nextUndo:applied?null:{operationId:'1',revision:0},nextRedo:applied?{operationId:'1',revision:1}:null})
 f.api.control=async(_page,direction,request)=>{controls.push({direction,request});applied=true;f.setRows([]);if(lose){lose=false;throw Error('lost')};return {items:[],operationId:'1',clientOperationId:'initial',revision:1}}
 const s=f.session();await s.restore([text()]);await s.synchronize();await assert.rejects(s.control('undo'))
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
 f.api.history=async()=>({items:[],nextUndo:{operationId:'1',revision:0},nextRedo:null})
 let attempts=0;f.api.control=async()=>{attempts++;throw Object.assign(Error('conflict'),{status:409})}
 await assert.rejects(s.control('undo'),e=>e.status===409);assert.equal(s.snapshot().control,null)
 await s.enqueue({id:'next',pageId,before:[text()],after:[text('next')]});const result=await s.synchronize()
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
