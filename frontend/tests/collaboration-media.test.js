import test from 'node:test'
import assert from 'node:assert/strict'
import {createCanvasMedia,createMediaRequest} from '../src/collaboration/canvasMedia.js'
import {createCanvasApi} from '../src/collaboration/canvasApi.js'
import {createCanvasSession} from '../src/collaboration/canvasSession.js'
const pageId='10000000-0000-4000-8000-000000000001',diaryId='10000000-0000-4000-8000-000000000002'
const localId='20000000-0000-4000-8000-000000000001',remoteId='30000000-0000-4000-8000-000000000001'
const photo={id:'40000000-0000-4000-8000-000000000001',type:'photo',x:1,y:2,w:30,h:30,mediaFileId:localId,src:`media:${localId}`}
function fixture(){
 const categories=[]
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
  const media=createCanvasMedia({storage,key:'media',files:{upload:async (id,category)=>{if(failPrepare)throw failPrepare instanceof Error?failPrepare:Error('offline');return {id,category}},cached:async id=>saved.has(id),save:async id=>saved.add(id)},request:async(path,options)=>{
   if(path==='/media'){uploads++;categories.push(options.body.category);assert.equal(options.body.id,localId);return {mediaFileId:remoteId}}
   assert.equal(path,`/media/${remoteId}/file`);downloads++;if(pause)await new Promise(resolve=>release=resolve);return new Uint8Array([1])
  }})
  const api=createCanvasApi(transport,media)
  let n=0;const engine=()=>createCanvasSession({api,storage,key:'journal',pageId,diaryId,createId:()=>`client-${++n}`})
  return {engine,storage,media,saved}
 }
 return {categories,delay:()=>pause=true,resume:()=>{pause=false;release?.()},client,rows:()=>rows,counts:()=>({uploads,downloads}),requests,lose:()=>lost=true,fail:flag=>failPrepare=flag}
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
test('공유 페이지의 사진 테이프는 멤버 기기에서 이미지와 자른 위치를 복원한다', async () => {
 const f=fixture(), owner=f.client().engine(), member=f.client()
 const tape={...photo,type:'tape',crop:{fx:0.25,fy:0.5,zoom:2},pieceRatio:3}
 await owner.restore([])
 await owner.synchronize()
 await owner.enqueue({id:'place-tape',pageId,before:[],after:[tape]})
 await owner.synchronize()
 assert.deepEqual(f.categories,['TAPE'])
 const reader=member.engine()
 await reader.restore([])
 const {objects}=await reader.synchronize()
 assert.equal(objects[0].type,'tape')
 assert.equal(objects[0].src,`media:${remoteId}`)
 assert.deepEqual(objects[0].crop,tape.crop)
 assert.equal(objects[0].pieceRatio,3)
 assert.ok(member.saved.has(remoteId))
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


function failingDownloads(error){
 let time=0,attempts=0,failed=0,broken=true;const media='a0000000-0000-4000-8000-000000000001',good='a0000000-0000-4000-8000-000000000002',saved=[]
 const instance=createCanvasMedia({now:()=>time,storage:{},key:'retry',files:{cached:async()=>false,save:async(id)=>{if(id===media&&error.code==='MEDIA_DECODE_FAILED'&&broken)throw error;saved.push(id)},fail:()=>failed++},request:async path=>{
  if(path.includes(media)){attempts++;if(broken&&error.code!=='MEDIA_DECODE_FAILED')throw error}return new Uint8Array([1])
 }})
 const rows=[{mediaFileId:media},{mediaFileId:good}]
 return {instance,media,rows,saved,counts:()=>({attempts,failed}),advance:n=>time+=n,recover:()=>broken=false}
}
test('일시 다운로드 실패는 5초·15초·60초 백오프 후 자동 시도를 중단한다',async()=>{
 const f=failingDownloads(Object.assign(Error('network'),{status:503}));await f.instance.hydrate(f.rows)
 assert.equal(f.counts().attempts,1);assert.equal(f.saved.length,1)
 for(let n=0;n<20;n++)await f.instance.hydrate(f.rows);assert.equal(f.counts().attempts,1)
 for(const delay of [5000,15000,60000]){f.advance(delay-1);await f.instance.hydrate(f.rows);const before=f.counts().attempts;f.advance(1);await f.instance.hydrate(f.rows);assert.equal(f.counts().attempts,before+1)}
 f.advance(86400000);await f.instance.hydrate(f.rows);assert.equal(f.counts().attempts,4)
 f.recover();await f.instance.retry(f.media);assert.ok(f.saved.includes(f.media));f.instance.dispose()
})
for(const error of [Object.assign(Error('missing'),{status:404}),Object.assign(Error('decode'),{code:'MEDIA_DECODE_FAILED'})])test(`영구 오류 ${error.status??error.code}는 매 응답마다 다운로드하지 않고 수동 재조회만 허용한다`,async()=>{
 const f=failingDownloads(error);await f.instance.hydrate(f.rows)
 f.advance(86400000);for(let n=0;n<20;n++)await f.instance.hydrate(f.rows)
 assert.equal(f.counts().attempts,1);assert.equal(f.saved.length,1);assert.equal(f.counts().failed,1)
 f.recover();await f.instance.retry(f.media);assert.equal(f.counts().attempts,2);assert.ok(f.saved.includes(f.media));f.instance.dispose()
})
test('기존 이미지 다시 조회 연결은 세션 종료 시 해제된다',async()=>{
 const {registerRemoteMediaRetry,retryRemoteMedia}=await import('../src/editor/services/mediaRetry.js')
 let calls=0,ok=false
 const instance=createCanvasMedia({storage:{},key:'registered',request:async()=>{calls++;if(!ok)throw Object.assign(Error('missing'),{status:404});return new Uint8Array([1])},files:{cached:async()=>false,save:async()=>{},fail(){},registerRetry:registerRemoteMediaRetry}})
 await instance.hydrate([{mediaFileId:remoteId}]);ok=true
 assert.equal(await retryRemoteMedia(remoteId),true);assert.equal(calls,2)
 instance.dispose();assert.equal(await retryRemoteMedia(remoteId),false);await assert.rejects(instance.retry(remoteId),/세션/)
})

const MiB=1024*1024
const gifRequest=(size,{header=true}={})=>createMediaRequest({auth:{getSessionKey:()=>'one',getAccessToken:async()=>'token',getConnectionOptions:()=>({getAuthHeaders:()=>({})})},accountId:'1',sessionKey:'one',baseUrl:'https://dio.test/api/v1',fetchImpl:async()=>({status:200,ok:true,headers:{get:()=>header?String(size):null},arrayBuffer:async()=>new ArrayBuffer(size)})})
test('GIF 다운로드: 5MiB 를 넘고 15MiB 이하인 파일은 받는다',async()=>{
 assert.equal((await gifRequest(6*MiB)(`/media/${remoteId}/file`,{binary:true})).length,6*MiB)
 assert.equal((await gifRequest(15*MiB)(`/media/${remoteId}/file`,{binary:true})).length,15*MiB)
})
test('GIF 다운로드: 15MiB 를 넘으면 content-length 가 있든 없든 거절한다',async()=>{
 for(const header of [true,false])await assert.rejects(gifRequest(15*MiB+1,{header})(`/media/${remoteId}/file`,{binary:true}),error=>error.code==='INVALID_SERVER_MEDIA')
})
test('다운로드와 업로드는 시간 제한을 120초로 요청한다',async()=>{
 const calls=[]
 const media=createCanvasMedia({storage:{getItem:async()=>null,setItem:async()=>{}},key:'timeout',files:{upload:async (id,category)=>({id}),cached:async()=>false,save:async()=>{}},request:async(path,options)=>{calls.push(options);return options.binary?new Uint8Array([1]):{mediaFileId:remoteId}}})
 await media.prepare({changes:{creates:[{elementType:'PHOTO',mediaFileId:localId}]}});await media.hydrate([{mediaFileId:'90000000-0000-4000-8000-000000000009'}])
 assert.equal(calls.length,2);assert.ok(calls.every(options=>options.timeoutMs===120000))
})

test('받는 중인 공유 사진은 끝나는 시점을 먼저 알리고 동시에 3장까지 받으며 실패는 그 오류로 알린다',async()=>{
 const ids=Array.from({length:5},(_,i)=>`5000000${i}-0000-4000-8000-000000000001`)
 const pending=new Map(),waiters=[];let running=0,peak=0
 const media=createCanvasMedia({storage:{getItem:async()=>null,setItem:async()=>{}},key:'m',
  files:{cached:async()=>false,save:async()=>{},pending:(id,job)=>pending.set(id,job)},
  request:async path=>{running++;peak=Math.max(peak,running);await new Promise(resolve=>waiters.push(resolve));running--;if(path.includes(ids[4]))throw Object.assign(Error('서버 끊김'),{status:503});return new Uint8Array([1])}})
 const job=media.hydrate(ids.map(mediaFileId=>({mediaFileId})))
 assert.deepEqual([...pending.keys()],ids)
 let done=false;job.finally(()=>{done=true})
 while(!done){await new Promise(resolve=>setImmediate(resolve));waiters.splice(0).forEach(resolve=>resolve())}
 await job
 assert.equal(peak,3)
 await Promise.all(ids.slice(0,4).map(id=>pending.get(id)))
 await assert.rejects(pending.get(ids[4]),/서버 끊김/)
})

test('다시 받기를 기다리는 동안 건너뛴 사진도 지난 실패 이유로 끝난다',async()=>{
 const id='60000000-0000-4000-8000-000000000001',pending=[]
 const media=createCanvasMedia({storage:{getItem:async()=>null,setItem:async()=>{}},key:'m',now:()=>0,
  files:{cached:async()=>false,save:async()=>{},pending:(_,job)=>pending.push(job)},
  request:async()=>{throw Object.assign(Error('서버 끊김'),{status:503})}})
 await media.hydrate([{mediaFileId:id}])
 await assert.rejects(pending[0],/서버 끊김/)
 await media.hydrate([{mediaFileId:id}])
 await assert.rejects(pending[1],/서버 끊김/)
})
