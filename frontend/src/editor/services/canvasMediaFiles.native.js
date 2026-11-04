import { File, Paths } from 'expo-file-system'
import * as repository from '../utils/mediaRepository.native.js'
import {registerRemoteMediaRetry} from './mediaRetry.js'
import {mediaRegistry} from './mediaStore'
import {detectMediaType,checkDimensions} from '../utils/mediaPolicy.js'
import {needsShareJpeg,SHARE_MAX_BYTES} from '../utils/shareImagePlan.js'
import {toShareJpeg} from '../utils/shareImage'
import {pdfSourceUri,savePdfSourceBytes} from '../../diary/utils/pdfSourceStore.native.js'
import {PDF_SHARE_MAX_BYTES} from '../../diary/utils/pdfSource.js'
import {mediaShareSizeMessage,sharedGifMaxBytes,sharedImageMaxBytes} from '../../shared/mediaLimits.js'
// 업로드는 expo/fetch 로 보낸다. expo/fetch 는 RN FormData 의 {uri} 파일 칸을 못 읽고 보내기 전에 실패한다(NETWORK_ERROR 로 보임).
// 그래서 bytes() 를 같이 붙여 expo/fetch 가 파일 내용을 읽게 하고, uri 는 RN 기본 fetch 용으로 남긴다.
const filePart=(uri,type,name)=>({uri,type,name,bytes:()=>new File(uri).bytes()})
export const canvasMediaFiles={
 registerRetry:registerRemoteMediaRetry,
 fail(id,error){mediaRegistry.fail(id,error)},
 async upload(id,category){
  if(category==='DOCUMENT'){
   const uri=pdfSourceUri(id)
   if(!uri)throw Object.assign(Error('PDF 원본이 이 기기에 없어요.'),{code:'PDF_SOURCE_MISSING'})
   if(new File(uri).size>PDF_SHARE_MAX_BYTES)throw Object.assign(Error('PDF 원본은 25MB 이하만 올릴 수 있어요.'),{status:413,code:'MEDIA_FILE_TOO_LARGE'})
   const body=new FormData();body.append('file',filePart(uri,'application/pdf','document.pdf'));body.append('libraryCategory','DOCUMENT');return body
  }
  const stored=await repository.get(id)
  const converted=stored.displayBlob&&(stored.media.extension==='heic'||stored.media.fileSize>5*1024*1024)
  let media=converted?{...stored.media,...stored.media.display}:stored.media
  let blob=converted?stored.displayBlob:stored.blob
  // PDF 쪽처럼 5MB 를 넘는 불투명 PNG 는 올리는 순간에만 JPEG 로 낮춘다(기기 원본은 그대로)
  if(needsShareJpeg(media)){const jpeg=await toShareJpeg(blob.uri,{width:media.width,height:media.height,maxBytes:SHARE_MAX_BYTES});media={...media,extension:'jpg',mimeType:'image/jpeg',fileSize:jpeg.size};blob={uri:jpeg.uri}}
  const maxBytes=media.extension==='gif'?sharedGifMaxBytes:sharedImageMaxBytes
  if(media.fileSize>maxBytes)throw Object.assign(Error(mediaShareSizeMessage(media.extension)),{status:413,code:'MEDIA_FILE_TOO_LARGE'})
  if(!['jpg','jpeg','png','webp','gif'].includes(media.extension))throw Object.assign(Error('공유 이미지는 JPEG·PNG·WebP·GIF로 선택해 주세요.'),{status:415,code:'UNSUPPORTED_MEDIA_TYPE'})
  const body=new FormData();body.append('file',filePart(blob.uri,media.mimeType,`image.${media.extension}`));body.append('libraryCategory',category);return body
 },
 async hasDocument(id){return pdfSourceUri(id)!==null},
 async saveDocument(id,bytes){await savePdfSourceBytes(id,bytes)},
 async cached(id){
  try{
   const {media,blob,displayBlob}=await repository.get(id),source=displayBlob??blob
   await repository.verifyDisplay(source)
   mediaRegistry.seed(id,{media,uri:source.uri});return true
  }catch{return false}
 },
 async save(id,bytes){
  const format=detectMediaType(bytes.slice(0,64))
  const source=new File(Paths.cache,`dio-shared-${id}.${format.extension}`)
   source.create({overwrite:true});source.write(bytes)
  const input={source,size:bytes.length,header:bytes.slice(0,64)}
  try{
   const dimensions=await repository.decode(input,format);checkDimensions(dimensions,format)
   const display=format.extension==='gif'?null:await repository.createDisplay(input,format,dimensions,'photo')
   const metadata={mediaFileId:id,...format,...dimensions,fileSize:bytes.length,originalName:`shared.${format.extension}`,createdAt:new Date().toISOString(),...(display?{display:display.metadata}:{})}
   const uri=await repository.save(source,metadata,display)
   mediaRegistry.seed(id,{media:metadata,uri})
  }finally{await repository.dispose?.(input);try{source.delete()}catch{}}
 },
}
