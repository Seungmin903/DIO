import * as repository from '../utils/mediaRepository.web.js'
import {registerRemoteMediaRetry} from './mediaRetry.js'
import {mediaRegistry} from './mediaStore'
import {detectMediaType,checkDimensions} from '../utils/mediaPolicy.js'
export const canvasMediaFiles={
 registerRetry:registerRemoteMediaRetry,
 fail(id,error){mediaRegistry.fail(id,error)},
 async upload(id,category){
  const stored=await repository.get(id)
  const converted=stored.displayBlob&&(stored.media.extension==='heic'||stored.media.fileSize>5*1024*1024)
  const media=converted?{...stored.media,...stored.media.display}:stored.media
  const blob=converted?stored.displayBlob:stored.blob
  if(media.fileSize>5*1024*1024)throw Object.assign(Error('공유 이미지는 기존 에셋 API 기준으로 5MB 이하만 사용할 수 있어요.'),{status:413,code:'MEDIA_FILE_TOO_LARGE'})
  if(!['jpg','jpeg','png','webp','gif'].includes(media.extension))throw Object.assign(Error('공유 이미지는 JPEG·PNG·WebP·GIF로 선택해 주세요.'),{status:415,code:'UNSUPPORTED_MEDIA_TYPE'})
  const body=new FormData();body.append('file',blob,`image.${media.extension}`);body.append('libraryCategory',category);return body
 },
 async cached(id){
  try{
   const {media,blob,displayBlob}=await repository.get(id),source=displayBlob??blob
   await repository.verifyDisplay(source)
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
  }finally{await repository.dispose?.(input);}
 },
}
