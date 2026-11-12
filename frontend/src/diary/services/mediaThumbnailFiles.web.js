import {THUMBNAIL_TTL_MS,THUMBNAIL_CACHE_LIMIT} from './mediaThumbnailCache.js'

let opening,generation=0
const urls=new Set()
const invalidated=()=>{throw Error('썸네일 캐시 세션이 종료됐어요.')}
function database(){
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open('dio-media-thumbnails-v1',1)
    request.onupgradeneeded=()=>request.result.createObjectStore('thumbnails',{keyPath:'key'})
    request.onsuccess=()=>resolve(request.result)
    request.onerror=()=>{opening=null;reject(request.error)}
  })
  return opening
}
async function transaction(mode,work,expectedGeneration=generation){
  const db=await database()
  if(expectedGeneration!==generation)invalidated()
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('thumbnails',mode),request=work(tx.objectStore('thumbnails'))
    tx.oncomplete=()=>resolve(request?.result)
    tx.onabort=()=>reject(tx.error??Error('썸네일 저장소를 열지 못했어요.'))
    tx.onerror=()=>{}
  })
}
export function clearMediaThumbnailFiles(){
  generation++
  for(const uri of urls)URL.revokeObjectURL(uri)
  urls.clear()
  return transaction('readwrite',store=>store.clear())
}
export function createMediaThumbnailFiles(scope){
  const epoch=generation
  const check=()=>{if(epoch!==generation)invalidated()}
  const uriFor=blob=>{check();const uri=URL.createObjectURL(blob);urls.add(uri);return uri}
  const key=id=>`${scope}/${id}`
  return {
    async read(id){
      check()
      const row=await transaction('readonly',store=>store.get(key(id)),epoch)
      check()
      if(!row)return null
      if(Date.now()-row.savedAt>THUMBNAIL_TTL_MS){await this.remove(id);return null}
      return uriFor(row.blob)
    },
    async write(id,bytes){
      check()
      const blob=new Blob([bytes],{type:'image/png'})
      try{await transaction('readwrite',store=>{
        store.put({key:key(id),blob,savedAt:Date.now()})
        const all=store.getAll()
        all.onsuccess=()=>{for(const row of all.result.sort((a,b)=>b.savedAt-a.savedAt).slice(THUMBNAIL_CACHE_LIMIT))store.delete(row.key)}
        return all
      },epoch)}catch{check()} // Persistence is optional; session invalidation is not.
      return uriFor(blob)
    },
    remove:id=>transaction('readwrite',store=>store.delete(key(id)),epoch),
    release:uri=>{urls.delete(uri);URL.revokeObjectURL(uri)},
  }
}
