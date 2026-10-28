import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createTextPageSync,createTextPageSession,encodeText,decodeText } from '../src/diary/services/textPageSync.js'
import { createHttpTransport } from '../src/diary/services/diaryApi.js'
import { createInitialState,editorReducer } from '../src/editor/state/editorReducer.js'
const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001'
const text=(value='기기 내용')=>({id,type:'text',x:1.23456,y:2,w:180,h:40,text:value,fontSize:20,color:'#123456'})
const element=o=>({...encodeText(o),pageId,version:0})
function fixture(rows=[]) {
 let remote=structuredClone(rows),mode='ok';const calls=[],values=new Map(),storage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v)}}
 const api=createTextPageSync(async r=>{
  calls.push(structuredClone(r));if(mode==='offline')throw Error('offline')
  if(!r.method)return {page:{pageId,diaryId},elements:structuredClone(remote.filter(e=>!e.deleted))}
  if(mode==='409')throw Object.assign(Error('conflict'),{status:409})
  for(const e of r.body.updates??[]){const old=remote.find(o=>o.elementId===e.elementId);assert.equal(e.version,old.version);Object.assign(old,e,{version:old.version+1})}
  for(const e of r.body.creates??[]){assert.ok(!remote.some(o=>o.elementId===e.elementId));remote.push({...e,pageId,version:0})}
  for(const id of r.body.deleteElementIds??[]){const e=remote.find(o=>o.elementId===id);e.deleted=true;e.version++}
  for(const id of r.body.restoreElementIds??[]){const e=remote.find(o=>o.elementId===id);e.deleted=false;e.version++}
  if(mode==='lost-ack'){mode='ok';throw Error('response lost')}
  return {items:structuredClone(remote.filter(e=>!e.deleted))}
 });return {storage,api,calls,remote:()=>remote,setMode:v=>{mode=v},session:()=>createTextPageSession({api,storage,key:'account:1:page',pageId,diaryId})}
}
async function open(f,objects){let state=createInitialState({id:diaryId,pages:[{id:pageId,objects}]});const session=f.session(),recovered=await session.restore();const apply=objects=>{state=editorReducer(state,{type:'importPageTexts',pageId,expectedObjects:state.doc.pages[0].objects,objects})};if(recovered!==null)apply(recovered);return {session,state:()=>state,edit:a=>{state=editorReducer(state,a)},async sync(){await session.record(state.doc.pages[0].objects);const r=await session.synchronize();if(r.objects)apply(r.objects);return r}}}
test('서버 다운로드가 편집기에 반영되기 전 오래된 스냅샷은 삭제로 전송되지 않는다',async()=>{
 const f=fixture([element(text('서버 원본'))]),s=f.session()
 await s.restore();await s.record([])
 const result=await s.synchronize()
 await assert.rejects(s.record([{id:'ink',type:'stroke'}]),{status:409})
 await s.synchronize()
 assert.equal(f.calls.filter(c=>c.method).length,0)
 const reopened=f.session();assert.deepEqual(await reopened.restore(),result.objects)
 await assert.rejects(reopened.record([]),{status:409})
 await reopened.record(result.objects);await reopened.synchronize()
 assert.equal(f.remote()[0].propertiesJson.text,'서버 원본')
 assert.equal(f.calls.filter(c=>c.method).length,0)
})
test('다운로드와 동시 편집한 로컬은 재시작 후에도 보존하고 서버를 덮어쓰지 않는다',async()=>{
 const f=fixture([element(text('서버'))]),s=f.session()
 await s.restore();await s.record([]);await s.synchronize()
 await s.retainLocal([text('다운로드 중 편집')])
 const next=f.session();assert.equal((await next.restore())[0].text,'다운로드 중 편집')
 await next.record([text('추가 편집')])
 await assert.rejects(next.synchronize(),{status:409})
 assert.equal(f.calls.filter(c=>c.method).length,0)
 assert.equal(f.remote()[0].propertiesJson.text,'서버')
})
test('최초 양쪽 텍스트를 자동 덮어쓰지 않는다',async()=>{const f=fixture([element(text('서버'))]),e=await open(f,[text('로컬')]);await assert.rejects(e.sync(),{status:409});assert.equal(f.calls.filter(c=>c.method).length,0);assert.equal(e.state().doc.pages[0].objects[0].text,'로컬');assert.equal(f.remote()[0].propertiesJson.text,'서버')})
test('편집기 reducer의 텍스트를 저장·재조회·버전 수정한다',async()=>{const f=fixture(),e=await open(f,[{id:'ink',type:'stroke'}]);e.edit({type:'addObjects',objects:[text()]});await e.sync();const next=await open(f,[]);await next.sync();assert.equal(next.state().doc.pages[0].objects[0].text,'기기 내용');next.edit({type:'updateObject',id,patch:{text:'수정'},record:true});await next.sync();assert.equal(f.remote()[0].propertiesJson.text,'수정');assert.equal(f.remote()[0].version,1);assert.equal(e.state().doc.pages[0].objects[0].id,'ink')})
test('서버 텍스트를 불러와도 필기와 히스토리를 유지한다',async()=>{const f=fixture([element(text('서버'))]),e=await open(f,[{id:'ink',type:'stroke'}]);await e.sync();assert.deepEqual(e.state().doc.pages[0].objects.map(o=>o.id),['ink',id]);assert.equal(e.state().externalDirty,true);assert.equal(e.state().past.length,0)})
test('네트워크 실패 후 앱 재시작에도 최신 로컬 텍스트가 복구된다',async()=>{const f=fixture(),e=await open(f,[]);e.edit({type:'addObjects',objects:[text('미저장')]});f.setMode('offline');await assert.rejects(e.sync());const next=await open(f,[]);assert.equal(next.state().doc.pages[0].objects[0].text,'미저장');f.setMode('ok');await next.sync();assert.equal(f.remote()[0].propertiesJson.text,'미저장')})
test('409 후 재시작에도 로컬을 보존하고 다른 사용자 변경을 덮어쓰지 않는다',async()=>{const f=fixture(),e=await open(f,[text()]);await e.sync();e.edit({type:'updateObject',id,patch:{text:'로컬 새 편집'},record:true});f.setMode('409');await assert.rejects(e.sync(),{status:409});f.setMode('ok');f.remote()[0].propertiesJson.text='다른 사용자';f.remote()[0].version++;const next=await open(f,[]);assert.equal(next.state().doc.pages[0].objects[0].text,'로컬 새 편집');const writes=f.calls.filter(c=>c.method).length;await assert.rejects(next.sync(),{status:409});assert.equal(f.calls.filter(c=>c.method).length,writes)})
test('서버 적용 후 응답 유실은 재조회로 판별하여 중복 생성하지 않는다',async()=>{const f=fixture(),e=await open(f,[text()]);f.setMode('lost-ack');await assert.rejects(e.sync());const next=await open(f,[]);await next.sync();assert.equal(f.remote().length,1);assert.equal(f.calls.filter(c=>c.body?.creates?.length).length,1)})
test('텍스트 삭제·Undo 복구·Redo도 기존 batch 계약으로 동작한다',async()=>{const f=fixture(),e=await open(f,[text()]);await e.sync();e.edit({type:'removeObjects',ids:[id]});await e.sync();assert.equal(f.remote()[0].deleted,true);e.edit({type:'undo'});await e.sync();assert.equal(f.remote()[0].deleted,false);e.edit({type:'redo'});await e.sync();assert.equal(f.remote()[0].deleted,true)})
test('기기 저장 실패 시 서버 요청을 시작하지 않는다',async()=>{const f=fixture();f.storage.setItem=async()=>{throw Error('disk full')};const e=await open(f,[text()]);await assert.rejects(e.sync());assert.equal(f.calls.length,0)})
test('늦은 서버 가져오기는 새 로컬 편집을 덮어쓰지 않는다',()=>{let s=createInitialState({pages:[{id:pageId,objects:[]}]});const expected=s.doc.pages[0].objects;s=editorReducer(s,{type:'addObjects',objects:[text('최신')]});assert.equal(editorReducer(s,{type:'importPageTexts',pageId,expectedObjects:expected,objects:[text('과거')]}),s)})
test('HTTP transport로 기존 GET·batch POST·인증 헤더를 연결한다',async()=>{let rows=[],auth=0;const server=http.createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.headers.authorization==='Bearer qa-token')auth++;if(req.method==='GET')return res.end(JSON.stringify({page:{pageId,diaryId},elements:rows}));assert.equal(req.url,`/api/v1/pages/${pageId}/elements/batch`);let raw='';for await(const c of req)raw+=c;rows=JSON.parse(raw).creates.map(e=>({...e,pageId,version:0}));res.end(JSON.stringify({items:rows}))});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const api=createTextPageSync(createHttpTransport({baseUrl:`http://127.0.0.1:${server.address().port}/api/v1`,getAccessToken:async()=> 'qa-token'})),f=fixture(),s=createTextPageSession({api,storage:f.storage,key:'http',pageId,diaryId});await s.restore();await s.record([text()]);await s.synchronize();assert.equal(decodeText((await api.load(pageId,diaryId))[0]).text,'기기 내용');assert.equal(auth,3)}finally{await new Promise(r=>server.close(r))}})

test('전송 중 새 편집도 즉시 journal에 남고 다음 저장에서 이어서 반영한다',async()=>{
 const f=fixture();let release,entered
 const start=new Promise(r=>{entered=r}),gate=new Promise(r=>{release=r})
 let first=true
 const api={load:f.api.load,batch:async(...args)=>{if(first){first=false;entered();await gate}return f.api.batch(...args)}}
 const s=createTextPageSession({api,storage:f.storage,key:'concurrent',pageId,diaryId});await s.restore();await s.record([text('처음')]);const saving=s.synchronize();await start
 await s.record([text('전송 중 새 편집')]);release();assert.equal((await saving).status,'pending');await s.synchronize();assert.equal(f.remote()[0].propertiesJson.text,'전송 중 새 편집')
})

test('기기에서 바뀐 내용이 없을 때만 재진입 시 새 서버 텍스트를 가져온다',async()=>{
 const f=fixture(),e=await open(f,[text()]);await e.sync();f.remote()[0].propertiesJson.text='서버 새 버전';f.remote()[0].version++
 const again=await open(f,[]);await again.sync();assert.equal(again.state().doc.pages[0].objects[0].text,'서버 새 버전')
})
test('계정/편집 세션 종료 뒤 늦은 응답은 기준 기록을 덮어쓰지 않는다',async()=>{
 const f=fixture();let active=true,release
 const wait=new Promise(r=>{release=r}),api={load:async()=>{await wait;return []},batch:f.api.batch}
 const s=createTextPageSession({api,storage:f.storage,key:'closed',pageId,diaryId,isActive:()=>active});await s.restore();await s.record([text()]);const task=s.synchronize();active=false;release();await assert.rejects(task);assert.equal(f.calls.length,0)
})
