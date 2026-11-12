import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {createMediaThumbnailCache,THUMBNAIL_CACHE_LIMIT} from '../src/diary/services/mediaThumbnailCache.js'
import {createMediaThumbnailFiles} from '../src/diary/services/mediaThumbnailFiles.web.js'
import {createMediaThumbnailPreview} from '../src/diary/services/mediaThumbnailPreview.js'
const png=new Uint8Array([137,80,78,71,13,10,26,10])

test('150장 뒤에도 두 행이 사용하는 Blob은 마지막 행이 떠날 때까지 유효하다',async()=>{
 const cache=createMediaThumbnailCache({files:createMediaThumbnailFiles('retained-150'),active:()=>{},request:async()=>png})
 const first=cache.retain('first'),second=cache.retain('first'),uri=await cache.load('first')
 first();first()
 for(let i=0;i<150;i++)await cache.load(`other-${i}`)
 assert.deepEqual(new Uint8Array(await(await fetch(uri)).arrayBuffer()),png)
 assert.equal(await cache.load('first'),uri)
 // Touch other entries again so the held URI becomes oldest without changing its reference count.
 for(let i=50;i<150;i++)await cache.load(`other-${i}`)
 assert.ok(await fetch(uri))
 second();await cache.load('after-release');await assert.rejects(fetch(uri))
 cache.dispose()
})

test('표시 항목이 100개를 넘는 동안만 임시 초과를 허용하고 해제 후 즉시 상한을 복구한다',async()=>{
 const released=new Set(),cache=createMediaThumbnailCache({active:()=>{},request:async()=>png,files:{read:async()=>null,write:async id=>`uri:${id}`,release:uri=>released.add(uri)}})
 const leases=[]
 for(let i=0;i<=THUMBNAIL_CACHE_LIMIT;i++){leases.push(cache.retain(String(i)));await cache.load(String(i))}
 assert.equal(released.size,0)
 leases[0]();assert.deepEqual([...released],['uri:0'])
 for(let i=1;i<leases.length;i++)assert.equal(released.has(`uri:${i}`),false)
 cache.dispose();assert.equal(released.size,THUMBNAIL_CACHE_LIMIT+1)
 leases.forEach(release=>release());assert.equal(released.size,THUMBNAIL_CACHE_LIMIT+1)
})

test('한 번 다시 읽을 때 디스크를 지우지 않고 이전 URI 오류가 새 URI를 무효화하지 않는다',async()=>{
 const files=createMediaThumbnailFiles('refresh-lifetime');let downloads=0,removals=0
 const remove=files.remove;files.remove=id=>{removals++;return remove(id)}
 const cache=createMediaThumbnailCache({files,active:()=>{},request:async()=>{downloads++;return png}})
 const release=cache.retain('photo'),old=await cache.load('photo')
 URL.revokeObjectURL(old)
 const fresh=await cache.refresh('photo',old)
 assert.notEqual(fresh,old);assert.equal(downloads,1);assert.ok(await fetch(fresh))
 await cache.invalidate('photo',old);assert.equal(removals,0);assert.equal(await cache.load('photo'),fresh)
 assert.equal(await cache.refresh('photo',old),fresh)
 release();cache.dispose();await assert.rejects(fetch(fresh))
})

test('재조회 전 URI도 다른 행이 참조하는 동안 해제하지 않는다',async()=>{
 const cache=createMediaThumbnailCache({files:createMediaThumbnailFiles('refresh-other-row'),active:()=>{},request:async()=>png})
 const a=cache.retain('photo'),b=cache.retain('photo'),old=await cache.load('photo'),fresh=await cache.refresh('photo',old)
 assert.notEqual(old,fresh);assert.ok(await fetch(old));assert.ok(await fetch(fresh))
 a();assert.ok(await fetch(old));b();await assert.rejects(fetch(old));assert.ok(await fetch(fresh));cache.dispose()
})

function rowFixture({initial='uri',retry='uri'}={}){
 const states=[],invalidated=[];let held=0,reads=0,retries=0,releases=0
 const api={retainThumbnail:()=>{held++;return()=>{held--;releases++}},previewThumbnail:async()=>{reads++;return initial},retryThumbnail:async()=>{retries++;if(retry instanceof Error)throw retry;return retry},invalidateThumbnail:async(...args)=>invalidated.push(args)}
 const row={mediaFileId:'photo'},session=createMediaThumbnailPreview({api,row,onChange:state=>states.push(state)})
 return {session,states,invalidated,api,row,counts:()=>({held,reads,retries,releases})}
}
test('이미지 오류는 한 번만 다시 읽고 재시도 전의 늦은 오류를 무시한다(동일 네이티브 URI 포함)',async()=>{
 const f=rowFixture();await f.session.start();const first=f.states.at(-1)
 await first.onError();const fresh=f.states.at(-1)
 assert.equal(f.counts().retries,1);assert.equal(fresh.uri,'uri');assert.equal(fresh.attempt,1);assert.equal(f.invalidated.length,0)
 await first.onError();assert.equal(f.invalidated.length,0)
 await fresh.onError();assert.equal(f.invalidated.length,1);assert.equal(f.invalidated[0][1],'uri');assert.equal(f.states.at(-1).failed,true)
 f.session.dispose();f.session.dispose();assert.equal(f.counts().releases,1)
})
test('화면을 벗어난 뒤의 오류와 재조회 응답은 캐시나 새 행을 변경하지 않는다',async()=>{
 const f=rowFixture();await f.session.start();const stale=f.states.at(-1)
 f.session.dispose();const count=f.states.length;await stale.onError()
 assert.equal(f.states.length,count);assert.equal(f.counts().retries,0);assert.equal(f.invalidated.length,0)
 let resolve
 f.api.previewThumbnail=()=>new Promise(done=>{resolve=done})
 const states=[],next=createMediaThumbnailPreview({api:f.api,row:f.row,onChange:state=>states.push(state)})
 const pending=next.start();next.dispose();const before=states.length;resolve('late');await pending
 assert.equal(states.length,before);assert.equal(f.counts().held,0)
})
test('재조회 네트워크 오류는 정상 디스크를 삭제하지 않는다',async()=>{
 const f=rowFixture({retry:Object.assign(Error('offline'),{status:503})});await f.session.start();await f.states.at(-1).onError()
 assert.equal(f.states.at(-1).failed,true);assert.equal(f.invalidated.length,0);f.session.dispose()
})

test('180장 스크롤 후 첫 행 재진입은 새 URI를 받고 이전 행의 오류는 무시한다',async()=>{
 const files=createMediaThumbnailFiles('scroll-return');let downloads=0,removals=0
 const remove=files.remove;files.remove=id=>{removals++;return remove(id)}
 const cache=createMediaThumbnailCache({files,active:()=>{},request:async()=>{downloads++;return png}})
 const api={retainThumbnail:row=>cache.retain(row.mediaFileId),previewThumbnail:row=>cache.load(row.mediaFileId),retryThumbnail:(row,uri)=>cache.refresh(row.mediaFileId,uri),invalidateThumbnail:(row,uri)=>cache.invalidate(row.mediaFileId,uri)}
 const states=[],first=createMediaThumbnailPreview({api,row:{mediaFileId:'0'},onChange:state=>states.push(state)})
 await first.start();const stale=states.at(-1);first.dispose()
 for(let i=1;i<180;i++){
  const session=createMediaThumbnailPreview({api,row:{mediaFileId:String(i)},onChange:()=>{}})
  await session.start();session.dispose()
 }
 const returned=createMediaThumbnailPreview({api,row:{mediaFileId:'0'},onChange:state=>states.push(state)})
 await returned.start();const current=states.at(-1);await stale.onError()
 assert.ok(current.uri);assert.notEqual(current.uri,stale.uri);assert.equal(current.failed,false);assert.equal(removals,0)
 assert.deepEqual(new Uint8Array(await(await fetch(current.uri)).arrayBuffer()),png)
 assert.equal(downloads,181);returned.dispose();cache.dispose()
})
