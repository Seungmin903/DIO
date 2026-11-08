import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as mediaModule from '../src/collaboration/canvasMedia.js'
import * as apiModule from '../src/collaboration/canvasApi.js'
import * as elementsModule from '../src/collaboration/canvasElements.js'
import * as diagnosticsModule from '../src/collaboration/collaborationDiagnostics.js'
import * as writeApiModule from '../src/collaboration/canvasWriteApi.js'
import * as pagesModule from '../src/collaboration/serverPages.js'
import * as canvasFetchModule from '../src/collaboration/canvasFetch.js'
import * as pdfSourceRemoteModule from '../src/editor/services/pdfSourceRemote.js'
import * as sessionModule from '../src/collaboration/canvasSession.js'
import * as serverPaperFontModule from '../src/diary/services/serverPaperFont.js'
import * as memberStorage from '../src/diary/services/memberStorage.js'
import {createInitialState,editorReducer} from '../src/editor/state/editorReducer.js'
import {collaborationReducer} from '../src/collaboration/collaborationReducer.js'
const require=createRequire(import.meta.url),expo=createRequire(require.resolve('expo/package.json'))
const {code}=expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useMemberCanvasCollaboration.js',import.meta.url),'utf8'),{configFile:false,babelrc:false,plugins:[expo.resolve('@babel/plugin-transform-modules-commonjs')]})
const pageId='10000000-0000-4000-8000-000000000001',diaryId='20000000-0000-4000-8000-000000000001',id='30000000-0000-4000-8000-000000000001'
function fixture(failure=null,shared=false,sourceDiaryId=diaryId){
 let cursor=0,dirty=true,output,closed=false,key='session',sequence=0,rows=[],serverPages=[],serverOrder=[],deleted=new Set(),onChange,onReady,onPagesChanged
 let state=createInitialState({id:diaryId,pages:[{id:pageId,objects:[]}]}),version=0
 const slots=[],effects=[],cleanups=[],disk=new Map(),requests=[]
 const basePage={pageId,diaryId,title:'기존 페이지',canvasWidth:1188,canvasHeight:840,templateId:null,templateConfig:{blank:true},gridVisible:false,gridColor:'#DCE5F1'}
 const orderedPages=()=>{const pages=[basePage,...serverPages].filter(p=>!deleted.has(p.pageId));const order=[...serverOrder,...pages.map(p=>p.pageId).filter(id=>!serverOrder.includes(id))];return pages.sort((a,b)=>order.indexOf(a.pageId)-order.indexOf(b.pageId))}
 const transport=async r=>{requests.push(structuredClone(r));if(failure)throw failure;
   if(r.path===`/diaries/${diaryId}/members`)return {members:[{userId:'1',role:'OWNER'},...(shared?[{userId:'2',role:'EDITOR'}]:[])]}
   if(r.path.endsWith('/canvas-operations')){
    for(const e of r.body.changes.creates??[])rows.push({...e,pageId,version:++version})
    for(const e of r.body.changes.updates??[])rows=rows.map(old=>old.elementId===e.elementId?{...old,...e,version:++version}:old)
    rows=rows.filter(row=>!(r.body.changes.deleteElementIds??[]).includes(row.elementId))
    return {operationId:String(version),revision:0,items:structuredClone(rows)}
   }
   if(r.path===`/diaries/${diaryId}/pages`){
    if(r.method==='POST'){
      const p={pageId:'70000000-0000-4000-8000-000000000001',diaryId,...r.body};serverPages.push(p);return {page:p}
    }
    return {items:orderedPages()}
   }
   if(r.method==='PATCH'&&r.path.endsWith('/pages/order')){serverOrder=r.body.pageIds;return {items:orderedPages()}}
   if(r.path.includes('/elements')) {
    const parts=r.path.split('/'),elementId=parts[4]
    if(!r.method)return {items:structuredClone(parts[2]===pageId?rows:serverPages.find(p=>p.pageId===parts[2])?.elements??[])}
    if(r.method==='DELETE'){rows=rows.filter(row=>row.elementId!==elementId);return null}
    if(r.path.endsWith('/batch')){
      for(const e of r.body.creates??[])rows.push({...e,pageId,version:++version})
      for(const e of r.body.updates??[])rows=rows.map(old=>old.elementId===e.elementId?{...old,...e,version:++version}:old)
      rows=rows.filter(row=>!(r.body.deleteElementIds??[]).includes(row.elementId))
      return {items:structuredClone(rows)}
    }
    const old=rows.find(row=>row.elementId===elementId),element={...old,...r.body,elementId:elementId??r.body.elementId,pageId,version:++version}
    rows=rows.filter(row=>row.elementId!==element.elementId);rows.push(element)
    return {element:structuredClone(element)}
   }
   if(r.method==='DELETE'){deleted.add(r.path.split('/')[2]);return null}
   if(r.method==='POST'&&r.path.endsWith('/copies')){
    const source=r.path.split('/')[2],p={pageId:'80000000-0000-4000-8000-000000000001',diaryId,canvasWidth:1024,canvasHeight:768,templateConfig:{blank:true},elements:[]}
    serverPages.push(p);return {page:p}
   }
   if(r.path.endsWith('/history/me'))return {items:[],nextUndo:null,nextRedo:null}
   if(r.method==='PATCH'&&r.path===`/pages/${pageId}`){Object.assign(basePage,r.body);return {page:{...basePage}}}
   if(!r.method){
    const id=r.path.split('/')[2],p=serverPages.find(p=>p.pageId===id)
    if(deleted.has(id)||(!p&&id!==pageId))throw Object.assign(Error('missing'),{status:404,code:'PAGE_NOT_FOUND'})
    return {page:p??basePage,elements:structuredClone(p?.elements??(id===pageId?rows:[]))}
   }
   throw Error(`예상하지 않은 요청: ${r.method} ${r.path}`)}
 const load=name=>{
  if(name==='react')return {useRef:v=>{const i=cursor++;return slots[i]??=({current:v})},useState:v=>{const i=cursor++;if(!(i in slots))slots[i]=v;return [slots[i],next=>{slots[i]=typeof next==='function'?next(slots[i]):next;dirty=true}]},useEffect:(fn,deps)=>{const i=cursor++;if(!slots[i]||deps.some((v,n)=>!Object.is(v,slots[i][n]))){slots[i]=deps;effects.push(()=>{cleanups[i]?.();cleanups[i]=fn()})}}}
  if(name==='react-native')return {AppState:{addEventListener:()=>({remove(){}})}}
  if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k)}}
  if(name==='expo/fetch')return {fetch}
  if(name.endsWith('/authService'))return {authService:{getSessionKey:()=>key,getAccessToken:async()=>'token'},apiBaseUrl:'https://qa.test/api/v1',accessTokenHeader:'Authorization'}
  if(name.endsWith('/memberTransport.js'))return {createAuthenticatedMemberTransport:()=>transport}
  if(name.endsWith('/memberStorage.js'))return memberStorage
  if(name.endsWith('/serverPages.js'))return pagesModule
  if(name.endsWith('/canvasFetch.js'))return canvasFetchModule
  if(name.endsWith('/pdfSourceRemote.js'))return pdfSourceRemoteModule
  if(name.endsWith('/canvasMedia.js'))return mediaModule
  if(name.endsWith('/canvasMediaFiles'))return {canvasMediaFiles:{cached:async()=>true}}
  if(name.endsWith('/canvasApi.js'))return apiModule
  if(name.endsWith('/canvasElements.js'))return elementsModule
  if(name.endsWith('/collaborationDiagnostics.js'))return diagnosticsModule
  if(name.endsWith('/canvasWriteApi.js'))return writeApiModule
  if(name.endsWith('/canvasSession.js'))return sessionModule
  if(name.endsWith('/serverPaperFont.js'))return serverPaperFontModule
  if(name.endsWith('/collaborationSocket.js'))return {connectCollaboration:options=>{onChange=options.onChange;onReady=options.onReady;onPagesChanged=options.onPagesChanged;return {close(){}}}}
  if(name.endsWith('/common.js'))return {createId:()=>`40000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`}
  return require(name)
 }
 const module={exports:{}};new Function('require','module','exports',code)(load,module,module.exports)
 const dispatch=action=>{state=collaborationReducer(editorReducer,state,{collaborationId:`50000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`,...action});dirty=true}
 const render=()=>{cursor=0;dirty=false;output=module.exports.useMemberCanvasCollaboration({diary:{id:sourceDiaryId,source:'member-api',memberAccountId:'1'},page:state.doc.pages.find(p=>p.id===state.pageId)??state.doc.pages[0],state,loaded:true,readOnly:false,dispatch});effects.splice(0).forEach(f=>f())}
 return {state:()=>state,edit:dispatch,updatePage:(id,body)=>output.updatePage(id,body),loadPageSettings:id=>output.loadPageSettings(id),remoteSettings:body=>{Object.assign(basePage,body);onPagesChanged()},addPage:value=>output.addPage(value),copyPage:id=>output.copyPage(id),removePages:ids=>output.removePages(ids),movePage:(id,toIndex)=>output.movePage(id,toIndex),movePages:(ids,anchorId,place)=>output.movePages(ids,anchorId,place),remoteOrder:ids=>{serverOrder=ids;onPagesChanged()},remoteDelete:id=>{deleted.add(id);onPagesChanged()},status:()=>output.status,errorMessage:()=>output.errorMessage,requests,
   async settle(){for(let i=0;i<30;i++){if(dirty&&!closed)render();await new Promise(r=>setTimeout(r,5))}},
   remoteAdd(object){rows.push({...apiModule.canvasContent([object])[0],pageId,version:++version});onChange({pageId,clientOperationId:'other'})},
   remote(text){rows[0]={...rows[0],version:++version,propertiesJson:{text}};onChange({pageId,clientOperationId:'other'})},
   setShared(value){shared=value;onReady()},
   echo(frame){onChange({pageId,operationId:'9',...frame})},
   close(){closed=true;cleanups.forEach(fn=>fn?.())}}
}
for(const shared of [false,true])test(`${shared?'공유':'개인'} 편집기는 101개 행동을 전송하지 않고 제한을 안내한 뒤 소량 편집을 계속한다`,async()=>{
 const app=fixture(null,shared)
 try{
  await app.settle()
  const objects=Array.from({length:101},(_,i)=>({id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,type:'text',text:'A',x:1,y:2,w:40,h:20}))
  const before=app.state().doc
  app.edit({type:'addObjects',objects});await app.settle()
  assert.equal(app.state().doc,before);assert.match(app.state().collaborationLimitError.message,/100개/)
  app.edit({type:'canvasLimitNoticeShown',id:app.state().collaborationLimitError.id});await app.settle()
  assert.equal(app.state().collaborationLimitError,null)
  assert.equal(app.requests.filter(r=>r.method==='POST'&&(r.path.includes('/elements')||r.path.endsWith('/canvas-operations'))).length,0)
  app.edit({type:'addObjects',objects:objects.slice(0,1)});await app.settle()
  assert.equal(app.state().doc.pages[0].objects.length,1)
  assert.equal(app.requests.filter(r=>r.method==='POST'&&(r.path.includes('/elements')||r.path.endsWith('/canvas-operations'))).length,1)
 }finally{app.close()}
})

test('서버 UUID가 아닌 다이어리는 초기화 예외 대신 오류 상태로 표시하고 전송하지 않는다',async()=>{
 const app=fixture(null,false,'local-diary')
 try{await app.settle();assert.equal(app.status(),'error');assert.match(app.errorMessage(),/서버 다이어리 ID/);assert.equal(app.requests.length,0)}finally{app.close()}
})

test('현재 편집기 hook은 알 수 없는 기존 속지의 설정도 불러오고 저장한다',async()=>{
 const app=fixture()
 try{
  await app.settle()
  app.remoteSettings({templateCode:'new-template',templateVersion:'999',templateId:77});await app.settle()
  const before=app.state().doc.pages[0]
  const loaded=await app.loadPageSettings(pageId);assert.equal(loaded.title,'기존 페이지')
  await app.updatePage(pageId,{title:'새 속지에서도 저장',gridVisible:true});await app.settle()
  const after=app.state().doc.pages[0]
  assert.equal(after.title,'새 속지에서도 저장');assert.equal(after.gridVisible,true)
  assert.equal(after.objects,before.objects);assert.equal(after.backgroundAssetId,before.backgroundAssetId)
 }finally{app.close()}
})

test('현재 편집기 hook에서 설정을 저장하고 원격 설정을 재조회해도 요소를 보존한다',async()=>{
 const app=fixture()
 try{
  await app.settle()
  const loaded=await app.loadPageSettings(pageId);assert.equal(loaded.title,'기존 페이지')
  const before=app.state().doc.pages[0].objects
  await app.updatePage(pageId,{title:'저장한 제목',gridVisible:true});await app.settle()
  assert.equal(app.state().doc.pages[0].title,'저장한 제목')
  assert.equal(app.state().doc.pages[0].gridVisible,true)
  assert.deepEqual(app.state().doc.pages[0].objects,before)
  assert.ok(app.requests.some(r=>r.method==='PATCH'&&r.path===`/pages/${pageId}`&&r.body.title==='저장한 제목'))
  app.remoteSettings({title:'다른 참여자 제목',gridVisible:false});await app.settle()
  assert.equal(app.state().doc.pages[0].title,'다른 참여자 제목')
  assert.equal(app.state().doc.pages[0].gridVisible,false)
 }finally{app.close()}
})
test('현재 편집기 hook은 완료한 텍스트 행동마다 서버 작업을 전송하고 원격 변경을 가져온다',async()=>{
 const app=fixture()
 try{
  await app.settle();assert.equal(app.status(),'saved')
  app.edit({type:'addObjects',objects:[{id,type:'text',text:'A',x:1,y:2,w:40,h:20}]});await app.settle()
  app.edit({type:'updateObject',id,record:true,patch:{text:'B'}});await app.settle()
  const writes=app.requests.filter(r=>r.method==='POST'||r.method==='PATCH');assert.equal(writes.length,2)
  assert.equal(writes[0].path,`/pages/${pageId}/elements`);assert.equal(writes[1].path,`/pages/${pageId}/elements/${id}`)
  assert.equal(app.requests.some(r=>r.path.endsWith('/canvas-operations')),false)
  app.remote('friend');await app.settle();assert.equal(app.state().doc.pages[0].objects[0].text,'friend')
  assert.equal(app.requests.filter(r=>r.method==='POST'||r.method==='PATCH').length,2)
 }finally{app.close()}
})

test('공유 다이어리는 기존 작업 반영으로만 저장하고 개인 전환 후 요소 API를 사용한다',async()=>{
 const app=fixture(null,true)
 try{
  await app.settle()
  app.edit({type:'addObjects',objects:[{id,type:'text',text:'공유',x:1,y:2,w:40,h:20}]});await app.settle()
  app.edit({type:'updateObject',id,record:true,patch:{text:'함께 수정'}});await app.settle()
  const sharedWrites=app.requests.filter(r=>r.method==='POST'||r.method==='PATCH')
  assert.equal(sharedWrites.length,2);assert.ok(sharedWrites.every(r=>r.path.endsWith('/canvas-operations')))
  assert.ok(sharedWrites.every(r=>!('canvasWriteMode' in r.body)))
  assert.ok(sharedWrites.every(r=>typeof r.body.clientOperationId==='string' && r.body.clientOperationId.length>0))
  assert.notEqual(sharedWrites[0].body.clientOperationId,sharedWrites[1].body.clientOperationId)
  app.setShared(false);await app.settle()
  app.edit({type:'updateObject',id,record:true,patch:{text:'개인 수정'}});await app.settle()
  assert.equal(app.requests.filter(r=>r.method==='PATCH').at(-1).path,`/pages/${pageId}/elements/${id}`)
  app.setShared(true);await app.settle()
  app.edit({type:'updateObject',id,record:true,patch:{text:'다시 공유'}});await app.settle()
  assert.equal(app.requests.filter(r=>r.method==='POST').at(-1).path,`/pages/${pageId}/canvas-operations`)
  assert.equal(app.state().doc.pages[0].objects[0].text,'다시 공유')
 }finally{app.close()}
})

 test('초대받은 기기의 권한·페이지·네트워크 오류를 구분하고 기기 내용을 유지한다',async()=>{
 for(const failure of [{status:403,code:'COLLABORATION_ACCESS_DENIED'},{status:404,code:'PAGE_NOT_FOUND'},{status:0,code:'NETWORK_ERROR'}]){
  const app=fixture(failure)
  try{await app.settle();assert.equal(app.status(),'error');assert.match(app.errorMessage(),new RegExp(failure.code));assert.equal(app.state().doc.pages[0].id,pageId);assert.equal(app.requests.some(r=>r.method==='POST'),false)}finally{app.close()}
 }
})

test('내가 아무것도 하지 않아도 상대가 추가한 스티커·텍스트·도형을 이벤트로 즉시 반영한다',async()=>{
 const app=fixture()
 try{
  await app.settle()
  for(const [i,type] of ['sticker','text','shape','tape'].entries()){
   const object={id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,type,x:10,y:20,w:30,h:40}
   app.remoteAdd(object);await app.settle()
   assert.equal(app.state().doc.pages[0].objects.some(o=>o.id===object.id),true)
  }
  assert.equal(app.requests.some(r=>r.method==='POST'),false)
 }finally{app.close()}
})
test('추가 후 움직이지 않은 스티커·텍스트·도형도 바로 전송한다',async()=>{
 for(const type of ['sticker','text','shape','tape']){
  const app=fixture()
  try{await app.settle();app.edit({type:'addObjects',objects:[{id,type,x:10,y:20,w:30,h:40}]});await app.settle()
   assert.equal(app.requests.filter(r=>r.method==='POST').length,1)
  }finally{app.close()}
 }
})
test('텍스트 자동 높이 보정 이후에도 상대 요소를 추가 조작 없이 받아온다',async()=>{
 const app=fixture()
 try{await app.settle();app.edit({type:'addObjects',objects:[{id,type:'text',text:'A',x:1,y:2,w:40,h:20}]});await app.settle()
  app.edit({type:'updateObject',id,patch:{h:25}});await app.settle()
  const remote={id:'60000000-0000-4000-8000-000000000001',type:'sticker',x:10,y:20,w:30,h:40}
  app.remoteAdd(remote);await app.settle()
  assert.equal(app.state().doc.pages[0].objects.some(o=>o.id===remote.id),true)
  assert.equal(app.state().doc.pages[0].objects.find(o=>o.id===id).h,25)
 }finally{app.close()}
})

test('내 스티커를 드래그하는 중에도 상대 새 요소를 받고 드래그 종료 후 내 이동을 전송한다',async()=>{
 const app=fixture()
 try{
  await app.settle();app.edit({type:'addObjects',objects:[{id,type:'sticker',x:1,y:2,w:40,h:20}]});await app.settle()
  app.edit({type:'checkpoint'});app.edit({type:'updateObject',id,patch:{x:90}});await app.settle()
  const remote={id:'60000000-0000-4000-8000-000000000001',type:'shape',x:10,y:20,w:30,h:40}
  app.remoteAdd(remote);await app.settle()
  assert.equal(app.state().doc.pages[0].objects.some(o=>o.id===remote.id),true)
  assert.equal(app.state().doc.pages[0].objects.find(o=>o.id===id).x,90)
  app.edit({type:'commitCheckpoint'});await app.settle()
  const writes=app.requests.filter(r=>r.method==='POST'||r.method==='PATCH')
  assert.equal(writes.at(-1).body.x,90)
  assert.equal(writes.some(r=>r.method==='POST'&&r.body.elementId===remote.id),false)
 }finally{app.close()}
})

test('기존 서버 생성 API의 페이지 ID로 이동한 다음 캔버스를 연결한다',async()=>{
 const app=fixture()
 try{await app.settle();const created=await app.addPage(null);await app.settle()
  assert.equal(app.state().pageId,created.id)
  const post=app.requests.find(r=>r.method==='POST'&&r.path===`/diaries/${diaryId}/pages`)
  assert.ok(post);assert.equal(app.requests.some(r=>r.path===`/pages/${created.id}`),true)
  assert.equal(app.status(),'saved');assert.equal(app.state().doc.pages.length,2)
 }finally{app.close()}
})

test('서버에 없는 기기 페이지는 복구용으로 보관하고 실제 페이지로 연결한다',async()=>{
 const app=fixture(),orphan='90000000-0000-4000-8000-000000000001'
 try{await app.settle();app.edit({type:'importServerPages',pages:[{id:orphan,objects:[{id,type:'sticker',x:1,y:2,w:40,h:20}]}],selectId:orphan});await app.settle()
  assert.equal(app.state().pageId,pageId);assert.equal(app.status(),'saved')
  assert.equal(app.state().doc.pageRecovery[0].page.id,orphan)
  assert.equal(app.state().doc.pageRecovery[0].page.objects.length,1)
  assert.equal(app.requests.some(r=>r.path===`/pages/${orphan}`),false)
 }finally{app.close()}
})
test('복제와 삭제는 기존 API를 호출하고 서버 페이지 목록으로 이동한다',async()=>{
 const app=fixture()
 try{await app.settle();const copied=await app.copyPage(pageId);await app.settle()
  assert.equal(app.state().pageId,copied.id);assert.equal(app.status(),'saved')
  assert.equal(app.requests.some(r=>r.method==='POST'&&r.path===`/pages/${pageId}/copies`),true)
  await app.removePages([copied.id]);await app.settle()
  assert.equal(app.state().pageId,pageId);assert.equal(app.status(),'saved');assert.equal(app.state().doc.pages.length,1)
  assert.equal(app.requests.some(r=>r.method==='DELETE'&&r.path===`/pages/${copied.id}`),true)
 }finally{app.close()}
})
test('상대가 현재 페이지를 삭제하면 보관 후 남은 서버 페이지로 옮겨 동기화를 계속한다',async()=>{
 const app=fixture()
 try{await app.settle();const added=await app.addPage(null);await app.settle()
  app.edit({type:'selectPage',id:pageId});await app.settle()
  app.remoteDelete(pageId);await app.settle()
  assert.equal(app.state().pageId,added.id);assert.equal(app.status(),'saved')
  assert.equal(app.state().doc.pageRecovery.some(r=>r.page.id===pageId),true)
 }finally{app.close()}
})

test('한 페이지와 묶음 이동은 기존 PATCH를 호출하며 상대 순서 변경도 현재 페이지를 유지해 반영한다',async()=>{
 const app=fixture()
 try{
  await app.settle();const added=await app.addPage(null);await app.settle();const copied=await app.copyPage(pageId);await app.settle()
  const selected=app.state().pageId
  await app.movePage(pageId,2);await app.settle()
  assert.deepEqual(app.state().doc.pages.map(p=>p.id),[added.id,copied.id,pageId])
  const patch=app.requests.filter(r=>r.method==='PATCH').at(-1)
  assert.equal(patch.path,`/diaries/${diaryId}/pages/order`)
  assert.deepEqual(patch.body.pageIds,[added.id,copied.id,pageId]);assert.equal(app.state().pageId,selected)
  await app.movePages([pageId,added.id],copied.id,'before');await app.settle()
  assert.deepEqual(app.state().doc.pages.map(p=>p.id),[added.id,pageId,copied.id])
  app.remoteOrder([copied.id,pageId,added.id]);await app.settle()
  assert.deepEqual(app.state().doc.pages.map(p=>p.id),[copied.id,pageId,added.id]);assert.equal(app.state().pageId,selected)
  assert.equal(app.status(),'saved')
 }finally{app.close()}
})

test('보고 있지 않은 페이지도 상대 요소를 알림만으로 갱신하고 내 작업으로 다시 보내지 않는다',async()=>{
 const app=fixture()
 try{await app.settle();const added=await app.addPage(null);await app.settle()
  const remote={id:'60000000-0000-4000-8000-000000000001',type:'sticker',x:10,y:20,w:30,h:40}
  app.remoteAdd(remote);await app.settle()
  assert.equal(app.state().pageId,added.id)
  assert.equal(app.state().doc.pages.find(p=>p.id===pageId).objects.some(o=>o.id===remote.id),true)
  assert.equal(app.requests.some(r=>r.method==='POST'&&r.path.endsWith('/canvas-operations')),false)
 }finally{app.close()}
})

test('원격 사용자 사진은 별도 사용자 액션 없이 기존 편집기 상태에 반영된다',async()=>{
 const app=fixture()
 try{await app.settle()
  const media='70000000-0000-4000-8000-000000000001'
  const remote={id:'70000000-0000-4000-8000-000000000002',type:'photo',x:10,y:20,w:30,h:40,mediaFileId:media,src:`media:${media}`}
  app.remoteAdd(remote);await app.settle()
  const photo=app.state().doc.pages.find(p=>p.id===pageId).objects.find(o=>o.id===remote.id)
  assert.equal(photo.src,`media:${media}`)
  assert.equal(app.requests.some(r=>r.method==='POST'&&r.path.endsWith('/canvas-operations')),false)
 }finally{app.close()}
})

test('내 계정이 낸 서버 에코는 재조회하지 않고, 다른 계정의 변경과 실패한 동기화의 전송 확인은 그대로 처리한다',async()=>{
 const app=fixture()
 try{
  await app.settle();app.edit({type:'addObjects',objects:[{id,type:'text',text:'A',x:1,y:2,w:40,h:20}]});await app.settle()
  assert.equal(app.state().collaborationEdits.length,0,'동기화 결과와 함께 전송 확인이 나간다')
  const before=app.requests.length
  app.echo({clientOperationId:'40000000-0000-4000-8000-000000000001',actorUserId:'1'});await app.settle()
  assert.equal(app.requests.length,before,'내 계정 에코(1인 다이어리의 임의 ID)는 재조회하지 않는다')
  app.echo({clientOperationId:'40000000-0000-4000-8000-000000000002',actorUserId:'1'});await app.settle()
  assert.ok(app.requests.length>before,'보낸 횟수를 넘는 에코는 남의 변경으로 재조회한다')
  const again=app.requests.length
  app.echo({clientOperationId:'40000000-0000-4000-8000-000000000003',actorUserId:'2'});await app.settle()
  assert.ok(app.requests.length>again,'다른 계정의 변경은 재조회한다')
 }finally{app.close()}
 const failing=fixture({status:0,code:'NETWORK_ERROR'})
 try{
  await failing.settle();failing.edit({type:'addObjects',objects:[{id,type:'text',text:'A',x:1,y:2,w:40,h:20}]});await failing.settle()
  assert.equal(failing.state().collaborationEdits.length,0,'동기화가 실패해도 저널에 넣은 편집의 전송 확인은 나간다');assert.equal(failing.status(),'error')
 }finally{failing.close()}
})
