import test from 'node:test'
import assert from 'node:assert/strict'
import {registerHooks} from 'node:module'
import {THUMBNAIL_CACHE_LIMIT} from '../src/diary/services/mediaThumbnailCache.js'

test('네이티브 썸네일이 100장을 넘으면 modificationTime이 없어도 저장 시각이 오래된 것부터 지운다',async t=>{
 const entries=new Map(),dir='file:///cache/dio-media-thumbnails-v1/order'
 class Directory {
  constructor(...parts){this.uri=parts.map(part=>part.uri??part).join('/')}
  get exists(){return [...entries.keys()].some(key=>key.startsWith(`${this.uri}/`))}
  create(){}
  delete(){for(const key of entries.keys())if(key.startsWith(`${this.uri}/`))entries.delete(key)}
  // Newest files come last, so list order alone would remove the newest ones.
  list(){return [...entries.keys()].filter(key=>key.startsWith(`${this.uri}/`)).map(key=>new File(key))}
 }
 class File extends Directory {
  get exists(){return entries.has(this.uri)}
  get size(){return entries.get(this.uri)?.length??0}
  get modificationTime(){return undefined} // this device reports no modificationTime
  create(){}
  async write(bytes){entries.set(this.uri,bytes)}
  async text(){if(!entries.has(this.uri))throw Error('missing');return String(entries.get(this.uri))}
  delete(){entries.delete(this.uri)}
 }
 globalThis.__thumbnailOrderIo={Directory,File,Paths:{cache:'file:///cache'}}
 const hooks=registerHooks({
  resolve:(name,context,next)=>name==='expo-file-system'?{url:'thumbnail-native:order',shortCircuit:true}:next(name,context),
  load:(url,context,next)=>url==='thumbnail-native:order'?{format:'module',source:'export const {Directory,File,Paths}=globalThis.__thumbnailOrderIo',shortCircuit:true}:next(url,context),
 })
 t.after(()=>{hooks.deregister();delete globalThis.__thumbnailOrderIo})
 const {createMediaThumbnailFiles}=await import('../src/diary/services/mediaThumbnailFiles.native.js?order')
 const bytes=new Uint8Array([1,2]),now=Date.now()
 // A legacy thumbnail with neither mtime nor .saved-at, then 99 thumbnails saved oldest → newest.
 entries.set(`${dir}/legacy.png`,bytes)
 for(let i=1;i<THUMBNAIL_CACHE_LIMIT;i++){entries.set(`${dir}/old-${i}.png`,bytes);entries.set(`${dir}/old-${i}.saved-at`,String(now-100000+i))}
 const files=createMediaThumbnailFiles('order'),has=name=>entries.has(`${dir}/${name}.png`)
 await files.write('new-1',bytes)
 assert.equal(has('legacy'),false,'unknown saved time is removed first')
 assert.ok(has('new-1')&&has(`old-${THUMBNAIL_CACHE_LIMIT-1}`)&&has('old-1'))
 await files.write('new-2',bytes)
 assert.equal(has('old-1'),false,'oldest saved thumbnail is removed next')
 assert.equal(entries.has(`${dir}/old-1.saved-at`),false)
 assert.ok(has('new-1')&&has('new-2')&&has(`old-${THUMBNAIL_CACHE_LIMIT-1}`)&&has('old-2'))
 assert.equal([...entries.keys()].filter(key=>key.endsWith('.png')).length,THUMBNAIL_CACHE_LIMIT)
 // Two runtimes showing the same native file must both release it before eviction.
 const first=files.retain('old-2'),other=createMediaThumbnailFiles('order'),second=other.retain('old-2')
 for(let i=0;i<120;i++)await files.write(`scroll-${i}`,bytes)
 assert.equal(has('old-2'),true,'a visible file is not pruned after 100 other writes')
 first();await files.write('after-first-release',bytes);assert.equal(has('old-2'),true)
 second();await files.write('after-final-release',bytes);assert.equal(has('old-2'),false)
 // If every existing item is visible, permit a temporary excess and prune when a lease ends.
 const names=[...entries.keys()].filter(key=>key.endsWith('.png')).map(key=>key.split('/').pop().slice(0,-4))
 const releases=names.map(name=>files.retain(name))
 await files.write('all-pinned',bytes)
 assert.equal([...entries.keys()].filter(key=>key.endsWith('.png')).length,THUMBNAIL_CACHE_LIMIT+1)
 releases[0]();await files.read('all-pinned') // await the queued pruning operation
 assert.equal([...entries.keys()].filter(key=>key.endsWith('.png')).length,THUMBNAIL_CACHE_LIMIT)
 releases.forEach(release=>release())
})
