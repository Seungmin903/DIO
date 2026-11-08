import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvasSession,compactEdit,splitRequest,JOURNAL_FORMAT} from '../src/collaboration/canvasSession.js'
import {encodeText} from '../src/diary/services/textPageSync.js'
import {MAX_CANVAS_BATCH_ITEMS} from '../src/collaboration/canvasBatchLimits.js'

const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001'
const uuid=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const text=(n,value='A')=>({id:uuid(n),type:'text',text:value,x:1,y:2,w:40,h:20})
const objects=count=>Array.from({length:count},(_,i)=>text(i+1))
const row=(object,version=1,sortKey=1)=>({...encodeText(object),pageId,version,sortKey})

function fixture(){
  const disk=new Map(),calls=[];let rows=[],version=0,sequence=0,writes=0
  const api={load:async()=>structuredClone(rows),history:async()=>({items:[],nextUndo:null,nextRedo:null}),
    apply:async(_page,request)=>{calls.push(structuredClone(request));const byId=new Map(rows.map(e=>[e.elementId,e]))
      for(const e of request.changes.creates??[])byId.set(e.elementId,{...e,pageId,version:++version})
      for(const e of request.changes.updates??[]){const {version:_v,...patch}=e;byId.set(e.elementId,{...byId.get(e.elementId),...patch,version:++version})}
      for(const id of request.changes.deleteElementIds??[])byId.delete(id)
      // 실제 서버처럼 sortKey 순으로 돌려준다
      rows=[...byId.values()].sort((a,b)=>(a.sortKey??0)-(b.sortKey??0));return {operationId:'1',revision:1,items:structuredClone(rows)}}}
  const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>{writes++;disk.set(k,v)}}
  const session=()=>createCanvasSession({api,storage,key:'journal',pageId,diaryId,createId:()=>uuid(900+(++sequence))})
  return {api,disk,calls,session,setRows:value=>{rows=value},rows:()=>rows,writes:()=>writes}
}

test('획 하나를 더한 편집은 바뀐 요소만 담고, 참조가 같은 요소는 인코딩하지 않는다',()=>{
  const all=objects(300);let reads=0
  // 바뀌지 않은 요소의 본문을 읽으면(인코딩하면) reads 가 오른다
  for(const object of all)Object.defineProperty(object,'text',{enumerable:true,get(){reads++;return 'untouched'}})
  const added=text(301,'new')
  const entry=compactEdit({id:'e',pageId,before:all,after:[...all,added]})
  assert.equal(reads,0)
  assert.equal(entry.compact,true);assert.deepEqual(entry.before,[]);assert.deepEqual(entry.after.map(o=>o.id),[added.id]);assert.equal(entry.reordered,false);assert.equal(entry.order,undefined)
})

test('내용이 바뀐 요소와 지운 요소만 남기고, 순서가 바뀌면 전체 id 순서를 함께 둔다',()=>{
  const [a,b,c]=objects(3)
  const changed={...b,text:'B2'}
  const entry=compactEdit({id:'e',pageId,before:[a,b,c],after:[changed,a]})
  assert.deepEqual(entry.before.map(o=>o.id),[b.id,c.id]);assert.deepEqual(entry.after.map(o=>o.id),[b.id])
  assert.equal(entry.reordered,true);assert.deepEqual(entry.order,[b.id,a.id])
  assert.deepEqual(compactEdit(entry),entry,'이미 줄인 항목은 그대로 둔다')
})

test('줄인 항목으로도 전송 요청과 미리보기가 같다: 생성·수정·삭제·순서 변경',async()=>{
  const f=fixture();const [a,b,c]=objects(3);f.setRows([row(a,1,1),row(b,1,2),row(c,1,3)])
  const s=f.session();await s.restore([a,b,c]);await s.synchronize()
  const changed={...b,text:'B2'},added=text(4,'D')
  await s.enqueue({id:uuid(500),pageId,before:[a,b,c],after:[c,changed,added]})
  const snapshot=s.snapshot()
  assert.equal(snapshot.queue[0].compact,true);assert.deepEqual(snapshot.queue[0].before.map(o=>o.id),[a.id,b.id]);assert.deepEqual(snapshot.queue[0].after.map(o=>o.id),[b.id,added.id])
  const result=await s.synchronize()
  const request=f.calls[0]
  assert.deepEqual(request.changes.deleteElementIds,[a.id]);assert.deepEqual(request.changes.creates.map(e=>e.elementId),[added.id])
  // 순서가 바뀌었으므로 내용이 그대로인 c 도 sortKey 수정으로 들어간다
  assert.deepEqual(request.changes.updates.map(e=>e.elementId).sort(),[b.id,c.id].sort())
  assert.ok(request.changes.updates.every(e=>Number.isFinite(e.sortKey)))
  assert.equal(request.changes.updates.find(e=>e.elementId===b.id).propertiesJson.text,'B2')
  assert.deepEqual(result.objects.map(o=>o.id),[c.id,b.id,added.id]);assert.equal(result.objects[1].text,'B2')
})

test('예전 형식(전후 전체 사본) 저널은 한 항목씩 양보하며 줄이고 준비된 요청과 명령 ID 를 유지한다',async()=>{
  const f=fixture();const all=objects(5)
  const legacy={format:2,pageId,diaryId,base:[],uiLocal:all,control:null,recent:['done'],queue:[
    {id:'q1',pageId,before:[],after:all.slice(0,2)},
    {id:'q2',pageId,before:all.slice(0,2),after:all,request:{clientOperationId:'q2',changes:{creates:[]},expectedVersions:{}},mediaApiVersion:1},
  ],rejectedEdits:[{id:'r1',pageId,before:[all[0]],after:[],status:400,code:null,rejectedAt:1}]}
  f.disk.set('journal',JSON.stringify(legacy))
  const s=f.session();let yields=0;const originalTimeout=globalThis.setTimeout
  globalThis.setTimeout=(fn,ms,...rest)=>{if(ms===0)yields++;return originalTimeout(fn,ms,...rest)}
  try{await s.restore(all)}finally{globalThis.setTimeout=originalTimeout}
  assert.ok(yields>=2,'항목마다 한 번씩 양보한다')
  const snapshot=s.snapshot()
  assert.equal(snapshot.format,JOURNAL_FORMAT);assert.deepEqual(snapshot.recent,['done'])
  assert.deepEqual(snapshot.queue.map(e=>e.id),['q1','q2']);assert.ok(snapshot.queue.every(e=>e.compact))
  assert.deepEqual(snapshot.queue[0].after.map(o=>o.id),all.slice(0,2).map(o=>o.id))
  assert.deepEqual(snapshot.queue[1].request,legacy.queue[1].request);assert.equal(snapshot.queue[1].mediaApiVersion,1)
  assert.equal(snapshot.rejectedEdits[0].compact,true);assert.equal(snapshot.rejectedEdits[0].status,400)
  assert.equal(JSON.parse(f.disk.get('journal')).format,JOURNAL_FORMAT,'변환한 저널은 새 형식으로 저장한다')
})

test('서버 상태가 그대로인 주기 동기화는 저널을 다시 저장하지 않는다',async()=>{
  const f=fixture();const [a]=objects(1);f.setRows([row(a)])
  const s=f.session();await s.restore([a]);await s.synchronize()
  const before=f.writes()
  await s.synchronize();await s.synchronize()
  assert.equal(f.writes(),before)
  f.setRows([row({...a,text:'friend'},2)])
  await s.synchronize()
  assert.equal(f.writes(),before+1,'서버 요소의 version 이 오르면 다시 저장한다')
})

test('요청 분할은 종류별 100개씩 나누고 기대 버전은 해당 부분만 담는다',()=>{
  const ids=objects(250).map(o=>o.id)
  const request={clientOperationId:'big',changes:{updates:ids.slice(0,150).map(id=>({elementId:id,version:1})),creates:ids.slice(150,220).map(id=>({elementId:id})),deleteElementIds:ids.slice(220,250)},expectedVersions:Object.fromEntries(ids.slice(220,250).map(id=>[id,3]))}
  let n=0;const parts=splitRequest(request,()=>`id-${++n}`)
  assert.deepEqual(parts.map(p=>[(p.changes.updates??[]).length,(p.changes.creates??[]).length,(p.changes.deleteElementIds??[]).length]),[[100,0,0],[50,0,0],[0,70,0],[0,0,30]])
  assert.ok(parts.every(p=>Object.keys(p.expectedVersions).length<=MAX_CANVAS_BATCH_ITEMS))
  assert.deepEqual(Object.keys(parts[3].expectedVersions).length,30);assert.deepEqual(parts.map(p=>p.clientOperationId),['id-1','id-2','id-3','id-4'])
})

test('서버도 대기열도 그대로인 동기화는 unchanged 를 돌려주고 objects 를 읽기 전에는 미리보기를 만들지 않는다',async()=>{
  const f=fixture();const [a]=objects(1);f.setRows([row(a)])
  const s=f.session();await s.restore([a])
  const first=await s.synchronize();assert.equal(first.unchanged,false);assert.equal(first.objects[0].id,a.id)
  const idle=await s.synchronize();assert.equal(idle.unchanged,true);assert.equal(s.pending(),false)
  assert.equal(idle.objects[0].id,a.id,'읽으면 그때 만든다')
  await s.enqueue({id:uuid(500),pageId,before:[a],after:[a,text(2,'B')]});assert.equal(s.pending(),true)
  const sent=await s.synchronize();assert.equal(sent.unchanged,false);assert.equal(sent.objects.length,2);assert.equal(s.pending(),false)
  f.setRows([row({...a,text:'friend'},2)]);assert.equal((await s.synchronize()).unchanged,false)
})
