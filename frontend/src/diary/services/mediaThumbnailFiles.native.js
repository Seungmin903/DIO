import {Directory,File,Paths} from 'expo-file-system'
import {THUMBNAIL_TTL_MS,THUMBNAIL_CACHE_LIMIT,THUMBNAIL_MAX_BYTES} from './mediaThumbnailCache.js'

let generation=0,operations=Promise.resolve()
const pins=new Map(),overfull=new Set()
const enqueue=task=>{const next=operations.then(task);operations=next.catch(()=>{});return next}
const root=()=>new Directory(Paths.cache,'dio-media-thumbnails-v1')
export function clearMediaThumbnailFiles(){
  generation++
  pins.clear()
  overfull.clear()
  return enqueue(async()=>{const directory=root();if(directory.exists)await directory.delete()})
}
export function createMediaThumbnailFiles(scope) {
  const epoch=generation
  const check=()=>{if(epoch!==generation)throw Error('썸네일 캐시 세션이 종료됐어요.')}
  const run=task=>enqueue(async()=>{check();const result=await task();check();return result})
  const directory=new Directory(Paths.cache,'dio-media-thumbnails-v1',encodeURIComponent(scope))
  const file=id=>new File(directory,`${id}.png`)
  const stamp=id=>new File(directory,`${id}.saved-at`)
  const firstSeen=new Map()
  const saveTime=async(id,time)=>{const target=stamp(id);target.create({overwrite:true});await target.write(String(time))}
  const remove=id=>{for(const cached of [file(id),stamp(id)])if(cached.exists)cached.delete();firstSeen.delete(id)}
  const trim=async keep=>{
    if(!directory.exists){overfull.delete(directory.uri);return}
    const images=directory.list().filter(item=>item instanceof File&&item.uri.endsWith('.png'))
    const excess=images.length-THUMBNAIL_CACHE_LIMIT
    if(excess<=0){overfull.delete(directory.uri);return}
    overfull.add(directory.uri)
    const nameOf=item=>item.uri.split('/').pop().slice(0,-4)
    const savedTimeOf=async item=>{
      try{const saved=Number(await stamp(nameOf(item)).text());if(Number.isFinite(saved)&&saved>0)return saved}catch{}
      const modified=item.modificationTime
      return Number.isFinite(modified)&&modified>0?modified:0
    }
    const candidates=images.filter(item=>item.uri!==keep&&!pins.has(item.uri))
    const dated=await Promise.all(candidates.map(async item=>({item,savedAt:await savedTimeOf(item)})))
    dated.sort((a,b)=>a.savedAt-b.savedAt)
    let removed=0
    for(const {item} of dated.slice(0,excess))try{remove(nameOf(item));removed++}catch{}
    if(removed>=excess)overfull.delete(directory.uri)
  }
  return {
    retain(id){
      check()
      const uri=file(id).uri
      pins.set(uri,(pins.get(uri)??0)+1)
      let held=true
      return()=>{
        if(!held)return
        held=false;if(epoch!==generation)return
        const count=pins.get(uri)??0
        if(count<=1)pins.delete(uri);else pins.set(uri,count-1)
        // A temporary excess caused by visible rows is trimmed as their final leases end.
        if(overfull.has(directory.uri))run(()=>trim()).catch(()=>{})
      }
    },
    read:id=>run(async()=>{
      const cached=file(id)
      if(!cached.exists)return null
      let savedAt
      try{savedAt=Number(await stamp(id).text())}catch{}
      if(!Number.isFinite(savedAt)||savedAt<=0)savedAt=cached.modificationTime
      if(!Number.isFinite(savedAt)||savedAt<=0){
        savedAt=firstSeen.get(id)??Date.now();firstSeen.set(id,savedAt)
        try{await saveTime(id,savedAt)}catch{} // Legacy cache: start TTL at first observation.
      }
      if(!cached.size||cached.size>THUMBNAIL_MAX_BYTES||Date.now()-savedAt>THUMBNAIL_TTL_MS){remove(id);return null}
      return cached.uri
    }),
    write:(id,bytes)=>run(async()=>{
      directory.create({intermediates:true,idempotent:true})
      const target=file(id);target.create({overwrite:true});await target.write(bytes)
      if(target.size!==bytes.length){target.delete();throw Error('썸네일을 저장하지 못했어요.')}
      const savedAt=Date.now();firstSeen.set(id,savedAt)
      try{await saveTime(id,savedAt)}catch{}
      await trim(target.uri)
      return target.uri
    }),
    remove:id=>run(async()=>remove(id)),
  }
}
