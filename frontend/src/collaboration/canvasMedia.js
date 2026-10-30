// Existing /media API adapter. All platform file I/O is injected for testing.
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const clone=v=>JSON.parse(JSON.stringify(v))
export const mediaIds=row=>[row.mediaFileId,row.propertiesJson?.mediaFileId,...(row.propertiesJson?.cells??[]).map(cell=>cell?.mediaFileId)].filter(Boolean)
export function createCanvasMedia({request,files,storage,key,isActive=()=>true,now=Date.now}){
 const remote=new Set(),downloaded=new Set(),uploads=new Map(),downloads=new Map(),failures=new Map(),registrations=new Map()
 let closed=false
 const active=()=>{if(closed||!isActive())throw Error('편집 세션이 종료됐어요.')}
 const resolve=async(id,category)=>{
  if(!uuid(id))throw Error('이미지 참조를 확인해 주세요.')
  if(remote.has(id))return id
  if(uploads.has(id))return uploads.get(id)
  const job=(async()=>{
   const saved=await storage.getItem(`${key}:${id}`);active()
   if(saved&&uuid(saved)){remote.add(saved);return saved}
   const input=await files.upload(id,category);active()
   const body=await request('/media',{method:'POST',body:input});active()
   if(!uuid(body?.mediaFileId))throw Error('이미지 업로드 응답을 확인하지 못했어요.')
   await storage.setItem(`${key}:${id}`,body.mediaFileId);active()
   remote.add(body.mediaFileId);return body.mediaFileId
  })()
  uploads.set(id,job)
  try{return await job}finally{uploads.delete(id)}
 }
 const permanent=error=>{
  const status=error.status??0
  return status>=400&&status<500&&![408,429].includes(status)
    ||['MEDIA_DECODE_FAILED','MEDIA_CORRUPT','UNSUPPORTED_MEDIA_TYPE','INVALID_MEDIA','IMAGE_TOO_LARGE','INVALID_SERVER_MEDIA','STORAGE_FULL'].includes(error.code)
 }
 const download=(id,force=false)=>{
  active()
  if(downloads.has(id))return downloads.get(id)
  if(force){failures.delete(id);downloaded.delete(id)}
  const failure=failures.get(id)
  if(downloaded.has(id)||failure&&now()<failure.retryAt)return Promise.resolve()
  const job=(async()=>{
   try{
    if(!await files.cached(id)){active();const bytes=await request(`/media/${id}/file`,{binary:true});active();await files.save(id,bytes)}
    active();downloaded.add(id);failures.delete(id)
   }catch(error){
    active()
    const attempts=(failure?.attempts??0)+1,delays=[5000,15000,60000]
    failures.set(id,{attempts,retryAt:permanent(error)||attempts>=4?Infinity:now()+delays[attempts-1]})
    files.fail?.(id,error);throw error
   }
  })().finally(()=>downloads.delete(id))
  downloads.set(id,job);return job
 }
 return {
  async prepare(body){
   const result=clone(body)
   for(const row of [...(result.changes?.creates??[]),...(result.changes?.updates??[])]){
    const category=row.elementType==='TAPE'?'TAPE':row.elementType==='STICKER'?'STICKER':'PHOTO'
    if(row.mediaFileId)row.mediaFileId=await resolve(row.mediaFileId,category)
    if(row.propertiesJson?.mediaFileId)row.propertiesJson.mediaFileId=await resolve(row.propertiesJson.mediaFileId,category)
    for(const cell of row.propertiesJson?.cells??[])if(cell?.mediaFileId)cell.mediaFileId=await resolve(cell.mediaFileId,'PHOTO')
   }
   active();return result
  },
  async hydrate(rows){
   const ids=[...new Set(rows.flatMap(mediaIds))]
   ids.forEach(id=>{
    if(!uuid(id))throw Error('서버 이미지 참조를 확인하지 못했어요.')
    remote.add(id)
    if(!registrations.has(id))registrations.set(id,files.registerRetry?.(id,()=>download(id,true)))
   })
   // Backoff skips failed IDs immediately; only one full-size image is decoded at a time.
   for(const id of ids){active();try{await download(id)}catch{active()}}
   active();return rows
  },
  async retry(id){active();if(!remote.has(id))throw Error('공유 이미지 참조를 확인해 주세요.');await download(id,true)},
  dispose(){closed=true;for(const unregister of registrations.values())unregister?.();registrations.clear();failures.clear()},
 }
}

export function createMediaRequest({auth,accountId,sessionKey,baseUrl,fetchImpl}){
 const active=()=>{if(auth.getSessionKey()!==sessionKey)throw Error('로그인 상태가 변경됐어요.')}
 return async(path,{method='GET',body,binary=false}={})=>{
  if(!/^\/media(?:\/[0-9a-f-]+\/file)?$/i.test(path))throw Error('미디어 API 경로를 확인해 주세요.')
  const url=baseUrl.replace(/\/$/,'')+path
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000)
  try{
  const send=async(forceRefresh=false)=>{
   active();const token=await auth.getAccessToken({userId:accountId,sessionKey,forceRefresh});active()
   const headers=auth.getConnectionOptions().getAuthHeaders(url,token)
   let response
   try{response=await fetchImpl(url,{method,body,headers,signal:controller.signal,credentials:'omit',redirect:'error'})}
   catch{throw Object.assign(Error('이미지 서버에 연결하지 못했어요. 기기 원본은 유지돼요.'),{code:'NETWORK_ERROR',status:0})}
   active();return response
  }
  let response=await send()
  if(response.status===401)response=await send(true)
  if(!response.ok){let error;try{error=await response.json()}catch{}
   throw Object.assign(Error(error?.detail||'이미지 파일을 처리하지 못했어요. 기기 원본은 유지돼요.'),{status:response.status,code:error?.code})}
  if(!binary){const result=await response.json();active();return result}
  if(Number(response.headers?.get('content-length'))>5*1024*1024)throw Object.assign(Error('서버 이미지 크기 제한을 초과했어요.'),{code:'INVALID_SERVER_MEDIA'})
  const bytes=new Uint8Array(await response.arrayBuffer());active()
  if(!bytes.length||bytes.length>5*1024*1024)throw Object.assign(Error('서버 이미지 크기를 확인해 주세요.'),{code:'INVALID_SERVER_MEDIA'})
  return bytes
  }finally{clearTimeout(timer)}
 }
}
