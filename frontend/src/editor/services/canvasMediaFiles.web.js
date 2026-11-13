import * as repository from '../utils/mediaRepository.web.js'
import {registerRemoteMediaRetry} from './mediaRetry.js'
import {mediaRegistry,trackRemoteMedia} from './mediaStore'
import {detectMediaType,checkDimensions} from '../utils/mediaPolicy.js'
import {needsShareJpeg,needsSharePng,SHARE_MAX_BYTES} from '../utils/shareImagePlan.js'
import {toShareJpeg,toSharePng} from '../utils/shareImage'
import {readPdfSource,savePdfSourceBytes} from '../../diary/utils/pdfSourceStore.web.js'
import {PDF_SHARE_MAX_BYTES} from '../../diary/utils/pdfSource.js'
import {mediaShareSizeMessage,sharedGifMaxBytes,sharedImageMaxBytes} from '../../shared/mediaLimits.js'
export const canvasMediaFiles={
 registerRetry:registerRemoteMediaRetry,
 pending:trackRemoteMedia,
 fail(id,error){mediaRegistry.fail(id,error)},
 async upload(id,category){
  if(category==='DOCUMENT'){
   const blob=await readPdfSource(id)
   if(!blob)throw Object.assign(Error('PDF 원본이 이 기기에 없어요.'),{code:'PDF_SOURCE_MISSING'})
   if(blob.size>PDF_SHARE_MAX_BYTES)throw Object.assign(Error('PDF 원본은 25MB 이하만 올릴 수 있어요.'),{status:413,code:'MEDIA_FILE_TOO_LARGE'})
   const body=new FormData();body.append('file',blob,'document.pdf');body.append('libraryCategory','DOCUMENT');return body
  }
  const stored=await repository.get(id)
  const converted=stored.displayBlob&&(stored.media.extension==='heic'||stored.media.fileSize>5*1024*1024)
  let media=converted?{...stored.media,...stored.media.display}:stored.media
  let blob=converted?stored.displayBlob:stored.blob
  // PDF 쪽처럼 5MB 를 넘는 불투명 PNG 는 올리는 순간에만 JPEG 로 낮춘다(기기 원본은 그대로)
  if(needsShareJpeg(media)){const jpeg=await toShareJpeg(blob,{width:media.width,height:media.height,maxBytes:SHARE_MAX_BYTES});media={...media,extension:'jpg',mimeType:'image/jpeg',fileSize:jpeg.size};blob=jpeg.blob}
  // 투명할 수 있는 큰 PNG(화면 캡처 등)는 PNG 그대로 크기만 줄인다
  else if(needsSharePng(media)){const png=await toSharePng(blob,{width:media.width,height:media.height,maxBytes:SHARE_MAX_BYTES});media={...media,extension:'png',mimeType:'image/png',fileSize:png.size,width:png.width,height:png.height};blob=png.blob}
  const maxBytes=media.extension==='gif'?sharedGifMaxBytes:sharedImageMaxBytes
  if(media.fileSize>maxBytes)throw Object.assign(Error(mediaShareSizeMessage(media.extension)),{status:413,code:'MEDIA_FILE_TOO_LARGE'})
  if(!['jpg','jpeg','png','webp','gif'].includes(media.extension))throw Object.assign(Error('공유 이미지는 JPEG·PNG·WebP·GIF로 선택해 주세요.'),{status:415,code:'UNSUPPORTED_MEDIA_TYPE'})
  const body=new FormData();body.append('file',blob,`image.${media.extension}`);body.append('libraryCategory',category);return body
 },
 async hasDocument(id){return (await readPdfSource(id).catch(()=>null))!==null},
 async saveDocument(id,bytes){await savePdfSourceBytes(id,bytes)},
 // repository.get 이 헤더·크기를 메타데이터와 맞춰 보므로 받다 끊긴 파일은 여기서 걸러져 다시 받는다.
 // 전체 디코딩(verifyDisplay)은 다시 조회 때만 한다. 그리다 깨지면 ObjectView onError → 오류 알림의 다시 조회 → download(id,true) 로 다시 받는다.
 async cached(id,{verify=false}={}){
  try{
   const {media,blob,displayBlob}=await repository.get(id),source=displayBlob??blob
   if(verify)await repository.verifyDisplay(source)
   mediaRegistry.seed(id,{media,uri:URL.createObjectURL(source)});return true
  }catch{return false}
 },
 async save(id,bytes){
  const format=detectMediaType(bytes.slice(0,64))
  const source=new Blob([bytes],{type:format.mimeType})
  const input={source,size:bytes.length,header:bytes.slice(0,64)}
  try{
   const dimensions=await repository.decode(input,format);checkDimensions(dimensions,format)
   const display=format.extension==='gif'?null:await repository.createDisplay(input,format,dimensions,'photo')
   const metadata={mediaFileId:id,...format,...dimensions,fileSize:bytes.length,originalName:`shared.${format.extension}`,createdAt:new Date().toISOString(),...(display?{display:display.metadata}:{})}
   const uri=await repository.save(source,metadata,display)
   mediaRegistry.seed(id,{media:metadata,uri})
   return metadata
  }finally{await repository.dispose?.(input);}
 },
}
