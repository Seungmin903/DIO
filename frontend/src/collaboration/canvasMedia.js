import {sharedGifMaxBytes} from '../shared/mediaLimits.js'
import { checkStorageLimit } from '../shared/freeTierLimits.js'
// Existing /media API adapter. All platform file I/O is injected for testing.
const uuid=id=>typeof id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
const clone=v=>JSON.parse(JSON.stringify(v))
const pendingPhotoStores = new WeakMap()
function pendingPhotoStore(storage, accountId, photoEntries) {
 accountId = String(accountId)
 let accounts = storage && pendingPhotoStores.get(storage)
 if (storage && !accounts) pendingPhotoStores.set(storage, accounts = new Map())
 if (accounts?.has(accountId)) {
  const store = accounts.get(accountId)
  if (photoEntries) store.photoEntries = photoEntries
  return store
 }
 const key = `dio:member:pending-photos:${accountId}`
 let ids, loading, writes = Promise.resolve()
 const completed = new Set()
 const read = async () => {
  if (!ids) {
   loading ??= (async () => {
    const raw = await storage?.getItem(key)
    let saved
    try {
     saved = raw ? JSON.parse(raw) : []
     if (!Array.isArray(saved) || saved.some(id => typeof id !== 'string')) throw Error('Invalid pending photos')
    } catch {
     throw Object.assign(Error(`사진 동기화 대기 기록이 손상됐어요. 사진 원본은 유지돼요. 문제 기록 ID: ${key}. 이 ID와 함께 문의해 주세요.`), { code: 'MEMBER_PHOTO_INDEX_DAMAGED', storageKey: key })
    }
    ids = new Set(saved)
   })().catch(error => { loading = null; throw error })
   await loading
  }
  return new Set(ids)
 }
 const store = { quota: { count: null, countAt: 0, request: null }, uploads: Promise.resolve(), photoEntries,
  async get() {
   await writes.catch(() => {})
   if (completed.size) await store.complete()
   const pending = await read()
   for (const id of completed) pending.delete(id)
   return pending
  },
  async complete(id) {
   if (id) completed.add(id)
   const removing = [...completed]
   if (!removing.length) return
   try {
    await store.update(ids => { for (const id of removing) ids.delete(id); return ids })
    for (const id of removing) completed.delete(id)
   } catch { /* 업로드 결과는 유지하고 다음 집계에서 정리를 다시 시도한다. */ }
  },
  update(change) {
   const write = writes.catch(() => {}).then(async () => {
    const next = change(await read())
    await storage?.setItem(key, JSON.stringify([...next]))
    ids = next
   })
   writes = write
   return write
  },
 }
 accounts?.set(accountId, store)
 return store
}
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
   if(saved&&uuid(saved)){if(category==='PHOTO')await request.completePhoto?.(id);remote.add(saved);return saved}
   const input=await files.upload(id,category);active()
   const body=await request('/media',{method:'POST',body:input,timeoutMs:120000,category,localPhotoId:id});active()
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
 const tracked=new Map(),track=(id,job)=>{tracked.set(id,job);files.pending?.(id,job)}
 let saving=Promise.resolve()
 const oneAtATime=task=>{const run=saving.then(task,task);saving=run.catch(()=>{});return run}
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
    // 받기는 동시에 여러 장 하되, 디코딩·표시본을 만드는 저장(save)은 한 장씩 해서 큰 사진이 한꺼번에 풀리지 않게 한다.
    if(!await files.cached(id,{verify:force})){active();const bytes=await request(`/media/${id}/file`,{binary:true,maxBytes:sharedGifMaxBytes,timeoutMs:120000});active();await oneAtATime(()=>{active();return files.save(id,bytes)})}
    active();downloaded.add(id);failures.delete(id)
   }catch(error){
    // 세션이 끝나 못 받은 것은 실패로 남기지 않는다(대기 기록을 비운다). 남기면 나중에 '편집 세션이 종료됐어요'가 보인다.
    if(closed||!isActive())track(id,Promise.resolve())
    active()
    const attempts=(failure?.attempts??0)+1,delays=[5000,15000,60000]
    failures.set(id,{attempts,error,retryAt:permanent(error)||attempts>=4?Infinity:now()+delays[attempts-1]})
    files.fail?.(id,error);throw error
   }
  })().finally(()=>downloads.delete(id))
  downloads.set(id,job)
  // 받는 동안(다시 조회 포함) 화면이 읽으면 이 받기를 기다린다. 성공하면 대기 기록이 지워지고, 실패하면 이번 실패 이유가 남는다.
  track(id,job)
  return job
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
   ids.forEach(id=>track(id,waits.get(id).promise))
   // 한 장씩만 받으면 사진이 많은 페이지가 오래 걸린다. 메모리를 생각해 동시에 3장까지만 받는다. 실패한 ID는 대기 시간 동안 바로 건너뛴다.
   let next=0
   const worker=async()=>{
    while(next<ids.length){
     const id=ids[next++],{settle}=waits.get(id)
     try{active();await download(id);settle.ok()}catch(error){if(closed||!isActive())return;settle.no(error)}
    }
   }
   // 세션이 끝나 받지 못한 사진은 실패로 남기지 않는다. 성공처럼 풀어 주면 기다리던 쪽이 다시 읽고,
   // '편집 세션이 종료됐어요' 같은 엉뚱한 이유 대신 실제 상태(아직 기기에 없음)를 보인다. 남은 대기 기록도 지워진다.
   try{await Promise.all(Array.from({length:Math.min(3,ids.length)},worker))}
   finally{waits.forEach(({settle})=>settle.ok())}
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
  // 이 세션이 남긴 대기 기록(실패 이유 포함)을 지운다. 다른 세션이 그 뒤에 같은 사진을 등록했다면 그 기록은 건드리지 않는다.
  dispose(){closed=true;tracked.forEach((job,id)=>files.forget?.(id,job));tracked.clear();for(const unregister of registrations.values())unregister?.();registrations.clear();failures.clear()},
 }
}

export function createMediaRequest({auth,accountId,sessionKey,baseUrl,fetchImpl,photoStorage,photoEntries}){
 const pendingPhotos = pendingPhotoStore(photoStorage, accountId, photoEntries)
 const active=()=>{if(auth.getSessionKey()!==sessionKey)throw Error('로그인 상태가 변경됐어요.')}
 const sendRequest=async(path,{method='GET',body,binary=false,maxBytes=sharedGifMaxBytes,timeoutMs=30000,query}={})=>{
  // 미디어 업로드 · 파일과 공유 다이어리 폰트 파일(collaboration/diaryFonts.js)만 받는다
  if(!/^\/media(?:\/[0-9a-f-]+\/(?:file|thumbnail))?$/i.test(path)&&!/^\/diaries\/[0-9a-f-]{36}\/fonts\/[0-9a-f-]{36}\/file$/i.test(path))throw Error('미디어 API 경로를 확인해 주세요.')
  const url=baseUrl.replace(/\/$/,'')+path+(query ? `?${query}` : '')
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
 // 대기 사진·업로드 큐는 계정 단위, 네트워크 집계와 캐시는 로그인 세션 단위다.
 if (pendingPhotos.quota.sessionKey !== sessionKey) pendingPhotos.quota = { sessionKey, count: null, countAt: 0, request: null }
 const quota = pendingPhotos.quota
 const checkPhotoCapacity = async (adding = 1, photos, uploadingId) => {
  active()
  if (typeof photoStorage?.getItem !== 'function' || typeof photoStorage?.setItem !== 'function') {
   throw Object.assign(Error('사진 보관함 연결을 확인한 뒤 다시 시도해 주세요.'), { code: 'PHOTO_LIBRARY_NOT_READY' })
  }
  const check = async counted => {
   let pending
   try { pending = await pendingPhotos.get() }
   catch (error) {
    // 이미 문서에 배치된 사진은 손상 기록을 덮지 않고 서버 개수로 동기화를 이어 간다.
    if (error.code !== 'MEMBER_PHOTO_INDEX_DAMAGED' || !uploadingId || photos?.length) throw error
    pending = new Set()
   }
   if (pending.size && pendingPhotos.photoEntries) {
    const available = new Set((await pendingPhotos.photoEntries({ idsOnly: true })).map(entry => entry.id))
    const missing = [...pending].filter(id => !available.has(id))
    if (missing.length) {
     for (const id of missing) pending.delete(id)
     await pendingPhotos.update(ids => { for (const id of missing) ids.delete(id); return ids })
    }
   }
   active()
   if (uploadingId) pending.delete(uploadingId)
   for (const photo of photos ?? []) pending.add(photo.mediaFileId)
   checkStorageLimit('photo', Math.max(counted, quota.count ?? counted) + pending.size + adding)
   if (photos?.length) await pendingPhotos.update(ids => {
    for (const photo of photos) ids.add(photo.mediaFileId)
    checkStorageLimit('photo', Math.max(counted, quota.count ?? counted) + ids.size + adding)
    return ids
   })
  }
  if (quota.count !== null && Date.now() - quota.countAt < 30000) {
   return check(quota.count)
  }
  if (quota.request) {
   const counted = await quota.request
   active()
   return check(quota.count ?? counted)
  }
  quota.request = (async () => {
   const photoIds = new Set(), cursors = new Set()
   let cursor
   do {
    const query = new URLSearchParams({ limit: '100' })
    if (cursor) query.set('cursor', cursor)
    const page = await sendRequest('/media', { query })
    if (!Array.isArray(page?.mediaFiles)) throw Error('사진 보관함을 확인하지 못했어요.')
    for (const item of page.mediaFiles) {
     if (item.libraryCategory === 'PHOTO') photoIds.add(item.mediaFileId)
    }
    cursor = page.nextCursor
    if (cursor && cursors.has(cursor)) throw Error('사진 보관함을 확인하지 못했어요.')
    cursors.add(cursor)
   } while (cursor)
   quota.count = photoIds.size
   quota.countAt = Date.now()
   return quota.count
  })()
  let counted
  try { counted = await quota.request } finally { quota.request = null }
  active()
  return check(quota.count ?? counted)
 }
 const request = (path, options) => {
  if (path !== '/media' || options?.method !== 'POST' || options.category !== 'PHOTO') return sendRequest(path, options)
  const upload = pendingPhotos.uploads.then(async () => {
   await checkPhotoCapacity(1, undefined, options.localPhotoId)
   let result
   try { result = await sendRequest(path, options) }
   catch (error) {
    quota.count = null
    quota.countAt = 0
    throw error
   }
   if (quota.count !== null) quota.count++
   else quota.countAt = 0
   if (options.localPhotoId) await pendingPhotos.complete(options.localPhotoId)
   return result
  })
  pendingPhotos.uploads = upload.catch(() => {})
  return upload
 }
 request.checkPhotoCapacity = checkPhotoCapacity
 request.completePhoto = id => pendingPhotos.complete(id)
 return request
}
