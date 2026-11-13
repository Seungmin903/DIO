import {sharedGifMaxBytes} from '../shared/mediaLimits.js'
// Existing /media API adapter. All platform file I/O is injected for testing.
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const clone=v=>JSON.parse(JSON.stringify(v))
export const mediaIds=row=>[row.mediaFileId,row.propertiesJson?.mediaFileId,...(row.propertiesJson?.cells??[]).map(cell=>cell?.mediaFileId)].filter(Boolean)
// 요소에 붙은 원본 PDF(properties.pdfSource): 이미지가 아니라 따로 올리고 내려받는다. 쓰는 쪽에서 파일 이름으로 쓰므로 sourceId 모양을 제한한다.
const PDF_ID=/^[A-Za-z0-9_-]{1,64}$/
const PDF_DOCUMENT_BYTES=25*1024*1024
const hasPdfHeader=bytes=>{const head=bytes.slice(0,1024);for(let i=0;i+5<=head.length;i++)if(head[i]===0x25&&head[i+1]===0x50&&head[i+2]===0x44&&head[i+3]===0x46&&head[i+4]===0x2d)return true;return false}
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
   const body=await request('/media',{method:'POST',body:input,timeoutMs:120000});active()
   if(!uuid(body?.mediaFileId))throw Error('이미지 업로드 응답을 확인하지 못했어요.')
   await storage.setItem(`${key}:${id}`,body.mediaFileId);active()
   remote.add(body.mediaFileId);return body.mediaFileId
  })()
  uploads.set(id,job)
  try{return await job}finally{uploads.delete(id)}
 }
 const resolveDocument=async sourceId=>{
  const slot=`doc:${sourceId}`
  if(uploads.has(slot))return uploads.get(slot)
  const job=(async()=>{
   const saved=await storage.getItem(`${key}:${slot}`);active()
   if(saved&&uuid(saved)){remote.add(saved);return saved}
   const input=await files.upload(sourceId,'DOCUMENT');active()
   const body=await request('/media',{method:'POST',body:input,timeoutMs:120000});active()
   if(!uuid(body?.mediaFileId))throw Error('PDF 원본 업로드 응답을 확인하지 못했어요.')
   await storage.setItem(`${key}:${slot}`,body.mediaFileId);active()
   remote.add(body.mediaFileId);return body.mediaFileId
  })()
  uploads.set(slot,job)
  try{return await job}finally{uploads.delete(slot)}
 }
 const permanent=error=>{
  const status=error.status??0
  return status>=400&&status<500&&![408,429].includes(status)
    ||['MEDIA_DECODE_FAILED','MEDIA_CORRUPT','UNSUPPORTED_MEDIA_TYPE','INVALID_MEDIA','IMAGE_TOO_LARGE','INVALID_SERVER_MEDIA','STORAGE_FULL','PDF_SOURCE_MISSING'].includes(error.code)
 }
 const download=(id,force=false)=>{
  active()
  if(downloads.has(id))return downloads.get(id)
  if(force){failures.delete(id);downloaded.delete(id)}
  const failure=failures.get(id)
  if(downloaded.has(id))return Promise.resolve()
  // 다시 받기를 기다리는 동안 건너뛴 사진도 지난 실패 이유를 그대로 돌려준다. 성공처럼 끝내면 화면이 '찾을 수 없어요'를 보였다.
  if(failure&&now()<failure.retryAt)return Promise.reject(failure.error)
  const job=(async()=>{
   try{
    // 평소엔 헤더만 보고 넘어간다(전체 디코딩은 사진마다 느리다). 다시 조회(force)일 때만 끝까지 확인해 깨진 파일을 다시 받는다.
    if(!await files.cached(id,{verify:force})){active();const bytes=await request(`/media/${id}/file`,{binary:true,maxBytes:sharedGifMaxBytes,timeoutMs:120000});active();await files.save(id,bytes)}
    active();downloaded.add(id);failures.delete(id)
   }catch(error){
    active()
    const attempts=(failure?.attempts??0)+1,delays=[5000,15000,60000]
    failures.set(id,{attempts,error,retryAt:permanent(error)||attempts>=4?Infinity:now()+delays[attempts-1]})
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
    const pdf=row.propertiesJson?.pdfSource
    if(pdf&&typeof pdf==='object'&&!(uuid(pdf.mediaFileId)&&remote.has(pdf.mediaFileId))){
     delete pdf.mediaFileId
     if(typeof pdf.sourceId==='string'&&PDF_ID.test(pdf.sourceId)){
      // 이 기기의 원본을 올려 서버 id 를 단다. 원본이 없거나 너무 크면 원본 없이 올려(친구 화면은 기본 그림) 편집은 막지 않는다.
      try{pdf.mediaFileId=await resolveDocument(pdf.sourceId)}catch(error){active();if(!permanent(error))throw error}
     }
    }
   }
   active();return result
  },
  async hydrate(rows){
   const ids=[...new Set(rows.flatMap(mediaIds))]
   for(const row of rows){const id=row.propertiesJson?.pdfSource?.mediaFileId;if(uuid(id))remote.add(id)}
   ids.forEach(id=>{
    if(!uuid(id))throw Error('서버 이미지 참조를 확인하지 못했어요.')
    remote.add(id)
    if(!registrations.has(id))registrations.set(id,files.registerRetry?.(id,()=>download(id,true)))
   })
   // 화면은 받기를 기다리지 않고 먼저 그린다. 받는 중인 사진은 '찾을 수 없음'이 아니라 '불러오는 중'으로 보이도록
   // 사진마다 끝나는 시점을 미리 알려 둔다(files.pending). 세션이 끝나도 기다리는 쪽이 멈추지 않게 마지막에 모두 풀어 준다.
   const waits=new Map(ids.map(id=>{let settle;const promise=new Promise((ok,no)=>{settle={ok,no}});promise.catch(()=>{});return [id,{promise,settle}]}))
   ids.forEach(id=>files.pending?.(id,waits.get(id).promise))
   // 한 장씩만 받으면 사진이 많은 페이지가 오래 걸린다. 메모리를 생각해 동시에 3장까지만 받는다. 실패한 ID는 대기 시간 동안 바로 건너뛴다.
   let next=0
   const worker=async()=>{
    while(next<ids.length){
     const id=ids[next++],{settle}=waits.get(id)
     try{active();await download(id);settle.ok()}catch(error){settle.no(error);if(closed||!isActive())return}
    }
   }
   try{await Promise.all(Array.from({length:Math.min(3,ids.length)},worker))}
   finally{const stop=Error('편집 세션이 종료됐어요.');waits.forEach(({settle})=>settle.no(stop))}
   active();return rows
  },
  // 친구 기기: 원본 PDF 를 받아 sourceId 로 보관한다. 이미 있으면 받지 않는다.
  async fetchDocument(sourceId,mediaFileId){
   active()
   if(typeof sourceId!=='string'||!PDF_ID.test(sourceId)||!uuid(mediaFileId))throw Error('PDF 원본 참조를 확인해 주세요.')
   if(await files.hasDocument(sourceId))return
   const bytes=await request(`/media/${mediaFileId}/file`,{binary:true,maxBytes:PDF_DOCUMENT_BYTES,timeoutMs:120000});active()
   if(!hasPdfHeader(bytes))throw Object.assign(Error('서버 PDF 원본을 확인하지 못했어요.'),{code:'INVALID_SERVER_MEDIA'})
   await files.saveDocument(sourceId,bytes);active()
  },
  async retry(id){active();if(!remote.has(id))throw Error('공유 이미지 참조를 확인해 주세요.');await download(id,true)},
  dispose(){closed=true;for(const unregister of registrations.values())unregister?.();registrations.clear();failures.clear()},
 }
}

export function createMediaRequest({auth,accountId,sessionKey,baseUrl,fetchImpl}){
 const active=()=>{if(auth.getSessionKey()!==sessionKey)throw Error('로그인 상태가 변경됐어요.')}
 return async(path,{method='GET',body,binary=false,maxBytes=sharedGifMaxBytes,timeoutMs=30000}={})=>{
  // 미디어 업로드 · 원본 · 썸네일과 공유 다이어리 폰트 파일만 받는다.
  if(!/^\/media(?:\/[0-9a-f-]+\/(?:file|thumbnail))?$/i.test(path)&&!/^\/diaries\/[0-9a-f-]{36}\/fonts\/[0-9a-f-]{36}\/file$/i.test(path))throw Error('미디어 API 경로를 확인해 주세요.')
  const url=baseUrl.replace(/\/$/,'')+path
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs)
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
  if(Number(response.headers?.get('content-length'))>maxBytes)throw Object.assign(Error('서버 이미지 크기 제한을 초과했어요.'),{code:'INVALID_SERVER_MEDIA'})
  const bytes=new Uint8Array(await response.arrayBuffer());active()
  if(!bytes.length||bytes.length>maxBytes)throw Object.assign(Error('서버 이미지 크기를 확인해 주세요.'),{code:'INVALID_SERVER_MEDIA'})
  return bytes
  }finally{clearTimeout(timer)}
 }
}
