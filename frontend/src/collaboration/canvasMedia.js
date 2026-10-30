// Existing /media API adapter. All platform file I/O is injected for testing.
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const clone=v=>JSON.parse(JSON.stringify(v))
export const mediaIds=row=>[row.mediaFileId,row.propertiesJson?.mediaFileId,...(row.propertiesJson?.cells??[]).map(cell=>cell?.mediaFileId)].filter(Boolean)
export function createCanvasMedia({request,files,storage,key,isActive=()=>true}){
 const remote=new Set(),downloaded=new Set(),uploads=new Map(),downloads=new Map()
 const active=()=>{if(!isActive())throw Error('편집 세션이 종료됐어요.')}
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
   ids.forEach(id=>{if(!uuid(id))throw Error('서버 이미지 참조를 확인하지 못했어요.');remote.add(id)})
   // Sequential downloads avoid decoding many full-size photos at once.
   for(const id of ids){
    active();if(downloaded.has(id))continue
    if(!downloads.has(id))downloads.set(id,(async()=>{
     if(!await files.cached(id)){active();const bytes=await request(`/media/${id}/file`,{binary:true});active();await files.save(id,bytes)}
     active();downloaded.add(id)
    })().finally(()=>downloads.delete(id)))
    try{await downloads.get(id)}catch(error){active();files.fail?.(id,error)}
   }
   active();return rows
  },
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
  if(Number(response.headers?.get('content-length'))>5*1024*1024)throw Error('서버 이미지 크기 제한을 초과했어요.')
  const bytes=new Uint8Array(await response.arrayBuffer());active()
  if(!bytes.length||bytes.length>5*1024*1024)throw Error('서버 이미지 크기를 확인해 주세요.')
  return bytes
  }finally{clearTimeout(timer)}
 }
}
