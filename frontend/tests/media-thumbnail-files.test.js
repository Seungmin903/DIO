import test from 'node:test'
import assert from 'node:assert/strict'
import 'fake-indexeddb/auto'
import {createMediaThumbnailFiles,clearMediaThumbnailFiles} from '../src/diary/services/mediaThumbnailFiles.web.js'
import {THUMBNAIL_TTL_MS,createMediaThumbnailCache} from '../src/diary/services/mediaThumbnailCache.js'

test('썸네일 전용 영속 저장소는 계정·서버를 격리하고 만료 후 원본 없이 다시 받게 한다',async()=>{
 const account=createMediaThumbnailFiles('https://api.test|1'),other=createMediaThumbnailFiles('https://api.test|2'),server=createMediaThumbnailFiles('https://else.test|1')
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10])
 const written=await account.write('id',bytes);URL.revokeObjectURL(written)
 const restored=createMediaThumbnailFiles('https://api.test|1'),uri=await restored.read('id')
 assert.ok(uri.startsWith('blob:'));assert.deepEqual(new Uint8Array(await (await fetch(uri)).arrayBuffer()),bytes);restored.release(uri)
 assert.equal(await other.read('id'),null);assert.equal(await server.read('id'),null)
 const now=Date.now;Date.now=()=>now()+THUMBNAIL_TTL_MS+1
 try{assert.equal(await restored.read('id'),null)}finally{Date.now=now}
 assert.equal(await restored.read('id'),null)
})
test('IndexedDB 차단·할당량 초과에서도 정상 썸네일은 메모리에서 표시하고 종료 시 URL을 해제한다',async()=>{
 const original=IDBDatabase.prototype.transaction
 const png=new Uint8Array([137,80,78,71,13,10,26,10])
 for(const name of ['SecurityError','QuotaExceededError']){
  const files=createMediaThumbnailFiles(`memory-${name}`)
  IDBDatabase.prototype.transaction=function(){throw new DOMException('blocked',name)}
  try{
   const cache=createMediaThumbnailCache({files,active:()=>{},request:async()=>png})
   const uri=await cache.load('photo')
   assert.deepEqual(new Uint8Array(await (await fetch(uri)).arrayBuffer()),png)
   cache.dispose();await assert.rejects(fetch(uri))
  }finally{IDBDatabase.prototype.transaction=original}
 }
})
test('저장 실패와 동시에 세션이 끝나면 메모리 폴백도 이전 이미지를 표시하지 않는다',async()=>{
 const files=createMediaThumbnailFiles('invalid-fallback'),original=IDBDatabase.prototype.transaction
 let cleanup
 IDBDatabase.prototype.transaction=function(){
  IDBDatabase.prototype.transaction=original
  cleanup=clearMediaThumbnailFiles()
  throw new DOMException('quota','QuotaExceededError')
 }
 try{await assert.rejects(files.write('photo',new Uint8Array([1,2])));await cleanup}
 finally{IDBDatabase.prototype.transaction=original}
 assert.equal(await createMediaThumbnailFiles('invalid-fallback').read('photo'),null)
})
test('처음부터 IndexedDB를 열 수 없어도 다운로드한 썸네일을 표시한다',async()=>{
 const blocked=await import('../src/diary/services/mediaThumbnailFiles.web.js?blocked-at-open')
 const original=globalThis.indexedDB,png=new Uint8Array([137,80,78,71,13,10,26,10])
 globalThis.indexedDB={open(){throw new DOMException('blocked','SecurityError')}}
 try{
  const files=blocked.createMediaThumbnailFiles('blocked-open'),cache=createMediaThumbnailCache({files,active:()=>{},request:async()=>png})
  const uri=await cache.load('photo');assert.deepEqual(new Uint8Array(await (await fetch(uri)).arrayBuffer()),png)
  await assert.rejects(blocked.clearMediaThumbnailFiles());await assert.rejects(fetch(uri))
 }finally{globalThis.indexedDB=original}
})
test('캐시 삭제는 모든 계정의 Blob·표시 URL을 지우고 늦은 쓰기와 이전 세션의 재저장을 막는다',async()=>{
 const bytes=new Uint8Array([137,80,78,71,13,10,26,10])
 const first=createMediaThumbnailFiles('first'),second=createMediaThumbnailFiles('second')
 const uri=await first.write('photo',bytes);second.release(await second.write('photo',bytes))
 // Start a write and clear in the same turn, while opening/transaction work is still pending.
 const late=first.write('late',bytes)
 const rejected=assert.rejects(late)
 await clearMediaThumbnailFiles();await rejected
 await assert.rejects(fetch(uri))
 await assert.rejects(first.write('after-logout',bytes));await assert.rejects(first.read('photo'))
 for(const scope of ['first','second']){
  const fresh=createMediaThumbnailFiles(scope)
  for(const id of ['photo','late','after-logout'])assert.equal(await fresh.read(id),null)
 }
 const fresh=createMediaThumbnailFiles('first'),newUri=await fresh.write('new-login',bytes)
 assert.ok(await fresh.read('new-login'));fresh.release(newUri)
 await clearMediaThumbnailFiles()
})
test('이미 시작된 IndexedDB 쓰기가 커밋되더라도 로그아웃 삭제가 그 뒤 데이터를 지운다',async()=>{
 const files=createMediaThumbnailFiles('committing'),original=IDBObjectStore.prototype.put
 let cleared
 IDBObjectStore.prototype.put=function(...args){
  const request=original.apply(this,args)
  if(this.name==='thumbnails')request.addEventListener('success',()=>{cleared=clearMediaThumbnailFiles()},{once:true})
  return request
 }
 try{
  await assert.rejects(files.write('in-flight',new Uint8Array([1,2])))
  assert.ok(cleared);await cleared
  assert.equal(await createMediaThumbnailFiles('committing').read('in-flight'),null)
 }finally{IDBObjectStore.prototype.put=original}
})
