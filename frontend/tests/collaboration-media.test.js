import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvasMedia,createMediaRequest} from '../src/collaboration/canvasMedia.js'
import {createCanvasApi} from '../src/collaboration/canvasApi.js'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
const pageId='10000000-0000-4000-8000-000000000001',diaryId='10000000-0000-4000-8000-000000000002'
const localId='20000000-0000-4000-8000-000000000001',remoteId='30000000-0000-4000-8000-000000000001'
const photo={id:'40000000-0000-4000-8000-000000000001',type:'photo',x:1,y:2,w:30,h:30,mediaFileId:localId,src:`media:${localId}`}
function fixture(){
 let rows=[],uploads=0,downloads=0,lost=false,failPrepare=false,pause=false,release
 const committed=new Map(),requests=[]
 const transport=async request=>{
  requests.push(structuredClone(request))
  if(request.path.endsWith('/history/me'))return {items:[]}
  if(!request.method)return {page:{pageId,diaryId},elements:structuredClone(rows)}
  if(!committed.has(request.body.clientOperationId)){
   for(const create of request.body.changes.creates??[])rows.push({...create,version:1})
   for(const patch of request.body.changes.updates??[]){const old=rows.find(row=>row.elementId===patch.elementId);Object.assign(old,patch,{version:old.version+1})}
   rows=rows.filter(row=>!request.body.changes.deleteElementIds?.includes(row.elementId))
   committed.set(request.body.clientOperationId,{operationId:String(committed.size+1),revision:0,items:structuredClone(rows)})
   if(lost){lost=false;throw Object.assign(Error('lost'),{status:0})}
  }
  return structuredClone(committed.get(request.body.clientOperationId))
 }
 const client=()=>{
  const disk=new Map(),saved=new Set(),storage={getItem:async k=>disk.get(k)??null,setItem:async(k,v)=>disk.set(k,v)}
  const media=createCanvasMedia({storage,key:'media',files:{upload:async id=>{if(failPrepare)throw failPrepare instanceof Error?failPrepare:Error('offline');return {id}},cached:async id=>saved.has(id),save:async id=>saved.add(id)},request:async(path,options)=>{
   if(path==='/media'){uploads++;assert.equal(options.body.id,localId);return {mediaFileId:remoteId}}
   assert.equal(path,`/media/${remoteId}/file`);downloads++;if(pause)await new Promise(resolve=>release=resolve);return new Uint8Array([1])
  }})
  const api=createCanvasApi(transport,media)
  let n=0;const engine=()=>createCanvasSession({api,storage,key:'journal',pageId,diaryId,createId:()=>`client-${++n}`})
  return {engine,storage,media,saved}
 }
 return {delay:()=>pause=true,resume:()=>{pause=false;release?.()},client,rows:()=>rows,counts:()=>({uploads,downloads}),requests,lose:()=>lost=true,fail:flag=>failPrepare=flag}
}
test('사진과 사용자 스티커는 기존 에셋 API로 두 기기 간 추가·이동·삭제·재접속된다',async()=>{
 const f=fixture(),a=f.client(),b=f.client(),first=a.engine(),second=b.engine()
 await first.restore([]);await first.synchronize()
 const sticker={...photo,id:'40000000-0000-4000-8000-000000000002',type:'sticker'}
 await first.enqueue({id:'add',pageId,before:[],after:[photo,sticker]})
 await first.enqueue({id:'move',pageId,before:[photo,sticker],after:[{...photo,x:50},sticker]})
 const result=await first.synchronize();assert.equal(result.objects[0].x,50)
 assert.equal(result.objects[0].mediaFileId,remoteId);assert.equal(f.counts().uploads,1)
 await second.restore([]);const received=await second.synchronize()
 assert.equal(received.objects[0].src,`media:${remoteId}`);assert.ok(b.saved.has(remoteId))
 await second.acceptImport(received.objects)
 await second.enqueue({id:'remove',pageId,before:received.objects,after:[]});await second.synchronize()
 assert.equal((await first.synchronize()).objects.length,0)
 assert.ok(f.requests.filter(r=>r.method).every(r=>r.path===`/pages/${pageId}/canvas-operations`))
 const restarted=a.engine();await restarted.restore([]);assert.equal((await restarted.synchronize()).objects.length,0)
})
test('업로드와 응답 유실 후 재시도는 저장된 미디어 매핑과 동일 명령을 사용한다',async()=>{
 const f=fixture(),a=f.client(),first=a.engine();await first.restore([]);await first.synchronize()
 await first.enqueue({id:'add',pageId,before:[],after:[photo]});f.lose()
 await assert.rejects(first.synchronize(),/lost/)
 const restarted=a.engine();await restarted.restore([]);await restarted.synchronize()
 assert.equal(f.counts().uploads,1);assert.equal(f.rows().length,1)
 assert.equal(f.requests.filter(r=>r.method)[0].body.changes.creates[0].mediaFileId,remoteId)
})
test('업로드 실패는 준비되지 않은 기기 ID를 보내지 않고 다음 재시도에 다시 준비한다',async()=>{
 const f=fixture(),a=f.client(),engine=a.engine();await engine.restore([]);await engine.synchronize()
 await engine.enqueue({id:'add',pageId,before:[],after:[photo]});f.fail(true)
 await assert.rejects(engine.synchronize(),/offline/);assert.equal(f.requests.filter(r=>r.method).length,0)
 assert.equal(engine.snapshot().queue[0].request,undefined)
 f.fail(false);await engine.synchronize();assert.equal(f.rows()[0].mediaFileId,remoteId)
})
test('사진 틀의 각 칸도 같은 파일을 중복 업로드하지 않고 내려받는다',async()=>{
 const f=fixture(),a=f.client(),body=await a.media.prepare({changes:{creates:[{elementType:'PHOTO',propertiesJson:{cells:[{mediaFileId:localId},null,{mediaFileId:localId}]}}]}})
 assert.equal(body.changes.creates[0].propertiesJson.cells[0].mediaFileId,remoteId)
 assert.equal(f.counts().uploads,1)
 await a.media.hydrate(body.changes.creates);assert.equal(f.counts().downloads,1)
})
test('파일 요청은 401에서 갱신하고 세션 교체·외부 경로는 거부한다',async()=>{
 let key='one',attempts=0,refresh=[]
 const request=createMediaRequest({auth:{getSessionKey:()=>key,getAccessToken:async value=>{refresh.push(value.forceRefresh);return 'token'},getConnectionOptions:()=>({getAuthHeaders:()=>({Authorization:'Bearer token'})})},accountId:'1',sessionKey:'one',baseUrl:'https://dio.test/api/v1',fetchImpl:async()=>++attempts===1?{status:401,ok:false}:{status:200,ok:true,headers:{get:()=>null},arrayBuffer:async()=>new Uint8Array([1,2]).buffer}})
 assert.deepEqual(await request(`/media/${remoteId}/file`,{binary:true}),new Uint8Array([1,2]));assert.deepEqual(refresh,[false,true])
 await assert.rejects(request('https://evil.test/media'),/경로/);key='two';await assert.rejects(request('/media'),/로그인 상태/)
})

test('확정적으로 거절된 큰 이미지는 기기에 보관하고 뒤의 텍스트를 전송한다',async()=>{
 const f=fixture(),a=f.client(),engine=a.engine();await engine.restore([]);await engine.synchronize()
 const text={id:'80000000-0000-4000-8000-000000000001',type:'text',x:1,y:1,w:20,h:20,text:'keep'}
 await engine.enqueue({id:'photo',pageId,before:[],after:[photo]})
 await engine.enqueue({id:'text',pageId,before:[photo],after:[photo,text]})
 f.fail(Object.assign(Error('too large'),{status:413,code:'MEDIA_FILE_TOO_LARGE'}))
 const result=await engine.synchronize();assert.equal(result.rejectedCount,1)
 assert.equal(f.rows().length,1);assert.equal(f.rows()[0].elementType,'TEXT')
 assert.equal(engine.snapshot().rejectedEdits[0].after[0].mediaFileId,localId)
})

test('느린 이미지 다운로드는 상대 텍스트와 캔버스 동기화를 막지 않는다',async()=>{
 const f=fixture(),a=f.client(),first=a.engine();await first.restore([]);await first.synchronize()
 await first.enqueue({id:'add',pageId,before:[],after:[photo]});await first.synchronize()
 f.delay();const b=f.client(),second=b.engine();await second.restore([])
 try{
  const result=await Promise.race([second.synchronize(),new Promise((_,reject)=>setTimeout(()=>reject(Error('image blocked canvas')),500))])
  assert.equal(result.objects[0].mediaFileId,remoteId)
 }finally{f.resume()}
})
