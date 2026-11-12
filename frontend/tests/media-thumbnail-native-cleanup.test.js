import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {THUMBNAIL_TTL_MS} from '../src/diary/services/mediaThumbnailCache.js'

test('네이티브 캐시 삭제는 진행 중 파일 저장을 기다려 지우고 원본 저장소는 보존한다',async t=>{
 const entries=new Map([['file:///cache/original/photo.png',new Uint8Array([9])]])
 let finishWrite,missingTime=false
 class Directory {
  constructor(...parts){this.uri=parts.map(part=>part.uri??part).join('/')}
  get exists(){return [...entries.keys()].some(key=>key.startsWith(`${this.uri}/`))}
  create(){}
  delete(){for(const key of entries.keys())if(key.startsWith(`${this.uri}/`))entries.delete(key)}
  list(){return [...entries.keys()].filter(key=>key.startsWith(`${this.uri}/`)).map(key=>new File(key))}
 }
 class File extends Directory {
  get exists(){return entries.has(this.uri)}
  get size(){return entries.get(this.uri)?.length??0}
  get modificationTime(){return missingTime?undefined:Date.now()}
  create(){}
  async write(bytes){if(typeof bytes!=='string')await new Promise(resolve=>{finishWrite=resolve});entries.set(this.uri,bytes)}
  async text(){if(!entries.has(this.uri))throw Error('missing');return String(entries.get(this.uri))}
  delete(){entries.delete(this.uri)}
 }
 globalThis.__thumbnailNativeIo={Directory,File,Paths:{cache:'file:///cache'}}
 const hooks=registerHooks({
  resolve:(name,context,next)=>name==='expo-file-system'?{url:'thumbnail-native:test',shortCircuit:true}:next(name,context),
  load:(url,context,next)=>url==='thumbnail-native:test'?{format:'module',source:'export const {Directory,File,Paths}=globalThis.__thumbnailNativeIo',shortCircuit:true}:next(url,context),
 })
 t.after(()=>{hooks.deregister();delete globalThis.__thumbnailNativeIo})
 const {createMediaThumbnailFiles,clearMediaThumbnailFiles}=await import('../src/diary/services/mediaThumbnailFiles.native.js')
 const files=createMediaThumbnailFiles('account'),bytes=new Uint8Array([1,2])
 const pending=files.write('late',bytes);await new Promise(resolve=>setImmediate(resolve))
 const rejected=assert.rejects(pending),clear=clearMediaThumbnailFiles()
 finishWrite();await rejected;await clear
 assert.deepEqual([...entries.keys()],['file:///cache/original/photo.png'])
 await assert.rejects(files.write('old-session',bytes))
 const fresh=createMediaThumbnailFiles('account'),saved=fresh.write('new-session',bytes)
 await new Promise(resolve=>setImmediate(resolve));finishWrite();await saved
 assert.ok(await fresh.read('new-session'));await clearMediaThumbnailFiles()
 assert.equal(await createMediaThumbnailFiles('account').read('new-session'),null)
 // A device may omit modificationTime. The sidecar preserves TTL across a new adapter.
 missingTime=true
 const noTime=createMediaThumbnailFiles('no-time'),write=noTime.write('photo',bytes)
 await new Promise(resolve=>setImmediate(resolve));finishWrite();await write
 assert.ok(await createMediaThumbnailFiles('no-time').read('photo'))
 const originalNow=Date.now
 try{Date.now=()=>originalNow()+THUMBNAIL_TTL_MS+1;assert.equal(await createMediaThumbnailFiles('no-time').read('photo'),null)}finally{Date.now=originalNow}
 // Legacy files with neither mtime nor a sidecar start their TTL at first read.
 entries.set('file:///cache/dio-media-thumbnails-v1/legacy/photo.png',bytes)
 assert.ok(await createMediaThumbnailFiles('legacy').read('photo'))
 assert.ok(entries.has('file:///cache/dio-media-thumbnails-v1/legacy/photo.saved-at'))
 await clearMediaThumbnailFiles()
})
