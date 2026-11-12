import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaLibraryApi, mergeMediaPages, mediaLibraryError, canSelectMediaPhoto, sharedGifMaxBytes } from '../src/diary/services/mediaLibraryApi.js'
const id='10000000-0000-4000-8000-000000000001',second='10000000-0000-4000-8000-000000000002'
const row=(mediaFileId=id)=>({mediaFileId,mediaType:'IMAGE',libraryCategory:'PHOTO',originalFilename:'사진.png',mimeType:'image/png',fileSize:100,createdAt:'2026-11-02T00:00:00Z'})

test('목록·상세·파일은 실제 계약 경로와 응답을 사용한다',async()=>{
 const calls=[],files=[]
 const api=createMediaLibraryApi({transport:async r=>{calls.push(r);return r.path==='/media'?{mediaFiles:[row()],nextCursor:'opaque'}:row()},fileRequest:async(path,options)=>{files.push({path,options});return new Uint8Array([1])}})
 assert.equal((await api.list({cursor:'previous'})).nextCursor,'opaque')
 assert.deepEqual(calls[0].query,{limit:30,cursor:'previous'})
 await api.get(id);await api.file(id);await api.thumbnail(id)
 assert.equal(calls[1].path,`/media/${id}`)
 assert.equal(files[0].path,`/media/${id}/file`);assert.equal(files[0].options.binary,true)
 assert.equal(files[1].path,`/media/${id}/thumbnail`);assert.equal(files[1].options.binary,true);assert.equal(files[1].options.maxBytes,512*1024)
})
test('잘못된 목록·중복 ID·반복 커서·다른 상세 ID를 성공으로 표시하지 않는다',async()=>{
 for(const body of [{},{mediaFiles:[row(),row()],nextCursor:null},{mediaFiles:[row()],nextCursor:3},{mediaFiles:[row()],nextCursor:'same'},{mediaFiles:[{...row(),fileSize:-1}],nextCursor:null}]){
  const api=createMediaLibraryApi({transport:async()=>body})
  await assert.rejects(api.list({cursor:'same'}),{code:'INVALID_MEDIA_RESPONSE'})
 }
 await assert.rejects(createMediaLibraryApi({transport:async()=>row(second)}).get(id),{code:'INVALID_MEDIA_RESPONSE'})
})
test('이미지 외 오디오·폰트·문서도 목록에 유지하고 겹친 커서 페이지를 ID로 병합한다',async()=>{
 for(const type of ['AUDIO','FONT','DOCUMENT']){
  const result=await createMediaLibraryApi({transport:async()=>({mediaFiles:[{...row(),mediaType:type}],nextCursor:null})}).list()
  assert.equal(result.items[0].mediaType,type)
 }
 assert.deepEqual(mergeMediaPages([row()],[row(),row(second)]).map(r=>r.mediaFileId),[id,second])
})
test('권한·파일 없음·업로드 제한의 사용자 안내를 구분한다',()=>{
 for(const status of [401,403,404,413,415])assert.ok(mediaLibraryError({status}).length)
 assert.equal(mediaLibraryError({message:'secret token'}).includes('secret'),false)
})
test('GIF만 공유 한도인 15MiB까지 선택한다',()=>{
 assert.equal(canSelectMediaPhoto({...row(),mimeType:'image/gif',fileSize:sharedGifMaxBytes}),true)
 assert.equal(canSelectMediaPhoto({...row(),mimeType:'image/gif',fileSize:sharedGifMaxBytes+1}),false)
 assert.equal(canSelectMediaPhoto({...row(),mimeType:'image/png',fileSize:5*1024*1024+1}),false)
})

test('새 미디어 유형이 섞여도 사진과 다음 커서를 유지하며 사진 선택 대상에서는 제외한다',async()=>{
 const video={...row(second),mediaType:'VIDEO',mimeType:'video/mp4'}
 const api=createMediaLibraryApi({transport:async()=>({mediaFiles:[video,row()],nextCursor:'next'})})
 const result=await api.list();assert.equal(result.nextCursor,'next');assert.deepEqual(result.items.filter(canSelectMediaPhoto).map(item=>item.mediaFileId),[id]);assert.equal(result.items[0].mediaType,'VIDEO')
 const onlyVideo=await createMediaLibraryApi({transport:async()=>({mediaFiles:[video],nextCursor:'next'})}).list()
 assert.equal(onlyVideo.items.filter(canSelectMediaPhoto).length,0);assert.equal(onlyVideo.nextCursor,'next')
 for(const mediaType of ['',null,7])await assert.rejects(createMediaLibraryApi({transport:async()=>({mediaFiles:[{...row(),mediaType}],nextCursor:null})}).list(),{code:'INVALID_MEDIA_RESPONSE'})
})

test('비이미지의 누락·비정상 부가 정보는 사진 목록과 다음 페이지를 막지 않는다',async()=>{
 for(const mediaType of ['AUDIO','FONT','DOCUMENT','VIDEO'])for(const metadata of [{},{mimeType:'',fileSize:0},{mimeType:null,fileSize:-1},{mimeType:7,fileSize:'unknown',originalFilename:{}}]){
  const ignored={mediaFileId:second,mediaType,...metadata}
  const api=createMediaLibraryApi({transport:async({query})=>query?.cursor?{mediaFiles:[row()],nextCursor:null}:{mediaFiles:[ignored,row()],nextCursor:'next'}})
  const first=await api.list();assert.deepEqual(first.items.filter(canSelectMediaPhoto).map(item=>item.mediaFileId),[id]);assert.equal(first.nextCursor,'next')
  assert.deepEqual(first.items[0],{mediaFileId:second,mediaType});assert.equal((await api.list({cursor:first.nextCursor})).nextCursor,null)
 }
})
test('사진 부가 정보와 비이미지의 ID·유형·중복 검증은 유지한다',async()=>{
 for(const bad of [{...row(),mimeType:''},{...row(),fileSize:0},{...row(),fileSize:-1},{...row(),fileSize:'100'},{mediaFileId:'bad',mediaType:'VIDEO'},{mediaFileId:second,mediaType:null}]){
  await assert.rejects(createMediaLibraryApi({transport:async()=>({mediaFiles:[bad],nextCursor:null})}).list(),{code:'INVALID_MEDIA_RESPONSE'})
 }
 await assert.rejects(createMediaLibraryApi({transport:async()=>({mediaFiles:[{mediaFileId:id,mediaType:'VIDEO'},row()],nextCursor:null})}).list(),{code:'INVALID_MEDIA_RESPONSE'})
})
