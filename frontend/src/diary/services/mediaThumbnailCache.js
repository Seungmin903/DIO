export const THUMBNAIL_MAX_BYTES = 512 * 1024
export const THUMBNAIL_TTL_MS = 24 * 60 * 60 * 1000
export const THUMBNAIL_CACHE_LIMIT = 100

// A thumbnail has its own store and URI. It must never seed the original media registry.
export function createMediaThumbnailCache({files,request,active,concurrency=2,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
  const pending=new Map(),ready=new Map(),waiting=[],references=new Map(),leases=new Set(),retired=new Map()
  let running=0,closed=false
  const check=()=>{active();if(closed)throw Error('사진 패널이 닫혔어요.')}
  const fetchThumbnail=async id=>{
    const delays=[400,1000,2000]
    for(let attempt=0;;attempt++){
      check()
      try{const bytes=await request(id);check();return bytes}
      catch(error){
        check()
        if(![429,503].includes(error?.status)||attempt>=delays.length)throw error
        await sleep(delays[attempt]+Math.floor(Math.random()*100));check()
      }
    }
  }
  const limited=async task=>{
    if(running>=concurrency)await new Promise(resolve=>waiting.push(resolve))
    else running++
    try{check();return await task()}finally{const next=waiting.shift();if(next)next();else running--}
  }
  const releaseRetired=id=>{for(const uri of retired.get(id)??[])if(ready.get(id)!==uri)files.release?.(uri);retired.delete(id)}
  const retire=(id,uri)=>{
    if(!references.has(id)){files.release?.(uri);return}
    if(!retired.has(id))retired.set(id,new Set())
    retired.get(id).add(uri)
  }
  const trim=()=>{
    for(const [id,uri] of ready){
      if(ready.size<=THUMBNAIL_CACHE_LIMIT)break
      if(references.has(id))continue
      ready.delete(id);files.release?.(uri)
    }
  }
  const remember=(id,uri)=>{
    const previous=ready.get(id)
    if(previous&&previous!==uri)retire(id,previous)
    ready.delete(id);ready.set(id,uri)
    trim()
    return uri
  }
  return {
    retain(id){
      check()
      const releaseFile=files.retain?.(id)
      references.set(id,(references.get(id)??0)+1)
      let held=true
      const release=()=>{
        if(!held)return
        held=false;leases.delete(release)
        const count=references.get(id)??0
        if(count<=1){references.delete(id);releaseRetired(id)}else references.set(id,count-1)
        releaseFile?.();trim()
      }
      leases.add(release);return release
    },
    load(id){
      check()
      if(ready.has(id))return Promise.resolve(remember(id,ready.get(id)))
      if(pending.has(id))return pending.get(id)
      const job=limited(async()=>{
        let uri
        try {
          uri=await files.read(id).catch(()=>null);check()
          if(!uri){
            const bytes=await fetchThumbnail(id);check()
            if(!(bytes instanceof Uint8Array)||bytes.length>THUMBNAIL_MAX_BYTES||bytes.length<8||![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))throw Error('썸네일을 확인하지 못했어요.')
            uri=await files.write(id,bytes);check()
          }
          return remember(id,uri)
        }catch(error){if(uri)files.release?.(uri);throw error}
      }).finally(()=>pending.delete(id))
      pending.set(id,job);return job
    },
    refresh(id,expectedUri){
      check()
      const uri=ready.get(id)
      // A delayed error from an older image must not evict its replacement.
      if(uri&&expectedUri!==undefined&&uri!==expectedUri)return this.load(id)
      ready.delete(id);if(uri)retire(id,uri)
      return this.load(id)
    },
    async invalidate(id,expectedUri){
      check()
      const uri=ready.get(id)
      if(uri&&expectedUri!==undefined&&uri!==expectedUri)return
      ready.delete(id);if(uri)retire(id,uri)
      await files.remove(id)
    },
    dispose(){closed=true;for(const release of [...leases])release();for(const uri of ready.values())files.release?.(uri);ready.clear()},
  }
}
