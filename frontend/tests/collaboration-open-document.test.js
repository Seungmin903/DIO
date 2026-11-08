import test from 'node:test'
import assert from 'node:assert/strict'
import {loadServerPages,createServerPage,reorderServerPages} from '../src/collaboration/serverPages.js'
import {createMemberAppStore} from '../src/diary/services/memberAppStore.js'
import {memberKeys} from '../src/diary/services/memberStorage.js'
import {encodeElement} from '../src/collaboration/canvasElements.js'
const id='10000000-0000-4000-8000-000000000001',pageId='20000000-0000-4000-8000-000000000001',strokeId='30000000-0000-4000-8000-000000000001'
const stroke={id:strokeId,type:'stroke',x:1,y:2,w:30,h:40,points:[{x:0,y:0,pressure:.5},{x:20,y:30,pressure:.9}],penKind:'brush',strokeWidth:3}
const row={id,title:'공유 문서',color:'#FFFFFF',canEdit:false,permissions:{canEditCanvas:true},createdAt:'2026-10-29T00:00:00Z'}
const serverPage={pageId,diaryId:id,templateId:1,templateCode:'dio-blank-landscape',templateVersion:'1.0.0',canvasWidth:1024,canvasHeight:768,templateConfig:{blank:true}}
const transport=async({path})=>path===`/diaries/${id}/pages`?{items:[serverPage]}:{page:serverPage,elements:[{...encodeElement(stroke),pageId,version:1}]}
function fixture(){
 const disk=new Map(),keys=memberKeys('101'),api={list:async()=>({items:[row],hasNext:false,nextCursor:null}),get:async()=>row,loadPages:()=>loadServerPages(transport,id)}
 const store=createMemberAppStore({accountId:'101',api,storage:{getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k)},makeRequestId:()=>id})
 return {disk,keys,api,store}
}
test('초대받은 기기에 문서가 없으면 실제 서버 페이지 UUID와 기존 필기를 가져온다',async()=>{
 const f=fixture();await f.store.load();const opened=await f.store.open(id)
 assert.equal(opened.diary.memberAccountId,'101');assert.equal(opened.doc.id,id)
 assert.equal(opened.doc.pages[0].id,pageId);assert.equal(opened.doc.pages[0].backgroundAssetId,null)
 assert.equal(opened.doc.pages[0].objects[0].points[1].pressure,.9)
 assert.equal(opened.diary.permissions.canEditCanvas,true)
 assert.equal(JSON.parse(f.disk.get(f.keys.doc(id))).pages[0].objects[0].id,strokeId)
})
test('기존 기기 필기는 재조회로 덮어쓰지 않는다',async()=>{
 const f=fixture();await f.store.load();const existing={id,memberAccountId:'101',pages:[{id:pageId,objects:[{id:'local-stroke',type:'stroke'}]}]}
 f.disk.set(f.keys.doc(id),JSON.stringify(existing));f.api.loadPages=async()=>{throw Error('must not overwrite local content')}
 assert.deepEqual((await f.store.open(id)).doc,existing)
})
test('조회 도중 기기 문서가 생겨도 그 문서를 보존한다',async()=>{
 const f=fixture();await f.store.load();const existing={id,memberAccountId:'101',pages:[{id:pageId,objects:[stroke]}]}
 f.api.loadPages=async()=>{f.disk.set(f.keys.doc(id),JSON.stringify(existing));return loadServerPages(transport,id)}
 assert.deepEqual((await f.store.open(id)).doc,existing)
})
test('권한 오류·다른 다이어리 페이지·빈 목록은 빈 문서로 저장하지 않는다',async()=>{
 for(const result of [{items:[]},{items:[{...serverPage,diaryId:strokeId}]}])await assert.rejects(loadServerPages(async()=>result,id),{code:'INVALID_SERVER_PAGES'})
 const f=fixture();await f.store.load();f.api.loadPages=async()=>{throw Object.assign(Error('forbidden'),{status:403})}
 await assert.rejects(f.store.open(id),{status:403});assert.equal(f.disk.has(f.keys.doc(id)),false)
})
test('페이지 조회 후 계정이 종료되면 기기 문서를 만들지 않는다',async()=>{
 const f=fixture();await f.store.load();let release
 f.api.loadPages=()=>new Promise(resolve=>{release=()=>resolve([{id:pageId,objects:[stroke]}])})
 const request=f.store.open(id);while(!release)await new Promise(r=>setImmediate(r));f.store.dispose();release()
 await assert.rejects(request,{code:'STALE_ACCOUNT'});assert.equal(f.disk.has(f.keys.doc(id)),false)
})

function pageCreator(){
 const disk=new Map(),calls=[],pages=[];let fail=false
 const storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k)}
 const transport=async request=>{calls.push(request)
  if(request.method==='POST'){
   const p={...serverPage,pageId:strokeId,templateId:null,templateCode:null,templateVersion:null,...request.body}
   pages.push(p);if(fail)throw Error('lost');return {page:p}
  }
  if(request.path.endsWith('/pages'))return {items:pages}
  return {page:pages.find(p=>request.path.endsWith(p.pageId)),elements:[]}
 }
 const create=()=>createServerPage({transport,diaryId:id,storage,key:'pending',createId:()=>pageId})
 return {calls,pages,disk,create,transport,lose:()=>{fail=true}}
}
test('페이지 추가는 기존 POST로 생성한 서버 UUID와 속지를 사용한다',async()=>{
 const f=pageCreator(),page=await f.create()
 assert.equal(page.id,strokeId);assert.equal(page.canvasWidth,1024)
 assert.equal(f.calls[0].path,`/diaries/${id}/pages`);assert.equal(f.calls[0].method,'POST')
 assert.equal(f.calls[0].body.templateId,undefined);assert.equal(f.disk.size,0)
})
test('페이지 생성 응답이 유실돼도 목록에서 복구하고 POST를 중복하지 않는다',async()=>{
 const f=pageCreator();f.lose();await assert.rejects(f.create());const page=await f.create()
 assert.equal(page.id,strokeId);assert.equal(f.calls.filter(r=>r.method==='POST').length,1)
})
test('새 페이지 목록 조회는 이미 열었던 페이지의 필기를 덮어쓰지 않는다',async()=>{
 const f=pageCreator();await f.create();const pages=await loadServerPages(f.transport,id,{knownIds:[strokeId]})
 assert.deepEqual(pages,[]);assert.equal(f.calls.some(r=>r.path===`/pages/${strokeId}`),false)
})

test('서버 도착 전 끊긴 페이지 생성은 동일 요청 본문으로 다시 보내 복구한다',async()=>{
 const disk=new Map(),storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v),removeItem:async k=>disk.delete(k)},requests=[]
 let lost=true
 const transport=async r=>{
  if(!r.method)return {items:[]}
  requests.push(structuredClone(r))
  if(lost){lost=false;throw Error('before arrival')}
  return {page:{...serverPage,pageId:strokeId,templateId:null,templateCode:null,templateVersion:null,...r.body}}
 }
 const create=()=>createServerPage({transport,diaryId:id,storage,key:'pending',createId:()=>pageId})
 await assert.rejects(create());const page=await create()
 assert.equal(page.id,strokeId);assert.deepEqual(requests[0],requests[1]);assert.equal(disk.size,0)
})

test('페이지 추가가 속지 확인에서 거절되면 원인을 알 수 있는 문구로 알린다',async()=>{
 for(const [status,code,pattern,kept] of [[400,'INVALID_PAGE_REQUEST',/앱을 최신 버전으로 업데이트/,false],[500,'PAGE_TEMPLATE_CATALOG_INVALID',/속지 목록을 확인하고 있어요/,true],[400,'OTHER',/^요청을 처리하지 못했어요/,false]]){
  const disk=new Map(),storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>{disk.set(k,v)},removeItem:async k=>{disk.delete(k)}}
  const transport=async r=>{if(!r.method)return {items:[]};throw Object.assign(Error('요청을 처리하지 못했어요. 다시 시도해 주세요.'),{status,code})}
  await assert.rejects(createServerPage({transport,diaryId:id,storage,key:'pending',createId:()=>pageId}),error=>error.code===code&&pattern.test(error.message))
  assert.equal(disk.has('pending'),kept) // 서버 오류(5xx)는 같은 요청으로 다시 시도할 수 있게 남긴다
 }
})
test('이동은 최신 서버 페이지 목록을 사용해 다른 사람이 추가한 페이지도 보존한다',async()=>{
 const a=pageId,b=strokeId,c='40000000-0000-4000-8000-000000000001',calls=[]
 const transport=async r=>{calls.push(r);return r.method?{items:r.body.pageIds.map(pageId=>({pageId,diaryId:id}))}:{items:[a,b,c].map(pageId=>({pageId,diaryId:id}))}}
 await reorderServerPages(transport,id,{ids:[a],anchorId:b,place:'after'})
 assert.deepEqual(calls.at(-1).body.pageIds,[b,a,c]);assert.equal(calls.at(-1).path,`/diaries/${id}/pages/order`)
})
test('이동 중 서버 목록이 바뀌어 거절되면 최신 목록으로 한 번 다시 계산한다',async()=>{
 const a=pageId,b=strokeId,c='40000000-0000-4000-8000-000000000001';let reads=0;const patches=[]
 const transport=async r=>{
  if(!r.method)return {items:(++reads===1?[a,b]:[a,b,c]).map(pageId=>({pageId,diaryId:id}))}
  patches.push(r.body.pageIds);if(patches.length===1)throw Object.assign(Error('stale'),{status:400,code:'INVALID_PAGE_REQUEST'})
  return {items:r.body.pageIds.map(pageId=>({pageId,diaryId:id}))}
 }
 await reorderServerPages(transport,id,{ids:[a],anchorId:b,place:'after'})
 assert.deepEqual(patches,[[b,a],[b,a,c]])
})
test('기준 페이지가 삭제되면 다른 순서로 추측해서 저장하지 않는다',async()=>{
 let writes=0
 const transport=async r=>{if(r.method)writes++;return {items:[{pageId,diaryId:id}]}}
 await assert.rejects(reorderServerPages(transport,id,{ids:[pageId],anchorId:strokeId,place:'after'}),{code:'PAGE_ORDER_CHANGED'})
 assert.equal(writes,0)
})
