import { authenticationErrorMessage } from '../../auth/sessionExpiry.js'
import { sharedGifMaxBytes, sharedImageMaxBytes } from '../../shared/mediaLimits.js'
export { sharedGifMaxBytes }
export const MEDIA_LIBRARY_IMAGE_MAX_BYTES = sharedImageMaxBytes
export const mediaLibraryMaxBytes = row => row?.mimeType === 'image/gif' ? sharedGifMaxBytes : MEDIA_LIBRARY_IMAGE_MAX_BYTES
export const canSelectMediaPhoto = row => row?.mediaType === 'IMAGE' && Number.isSafeInteger(row.fileSize) && row.fileSize > 0 && row.fileSize <= mediaLibraryMaxBytes(row)
import { isUuid } from '../../collaboration/canvasElements.js'

const invalid = () => { throw Object.assign(Error('미디어 정보를 확인하지 못했어요. 다시 불러와 주세요.'), { code:'INVALID_MEDIA_RESPONSE' }) }
const path = id => { if (!isUuid(id)) invalid(); return `/media/${id}` }
export function readMedia(row, expectedId) {
  if (!row || !isUuid(row.mediaFileId) || (expectedId && row.mediaFileId !== expectedId)
    || typeof row.mediaType !== 'string' || !row.mediaType.trim()) invalid()
  // 사진 선택 화면에서 쓰지 않는 항목의 부가 정보는 해석하지 않는다.
  if (row.mediaType !== 'IMAGE') return { mediaFileId:row.mediaFileId, mediaType:row.mediaType }
  if (typeof row.mimeType !== 'string' || !row.mimeType || !Number.isSafeInteger(row.fileSize) || row.fileSize <= 0
    || (row.originalFilename != null && typeof row.originalFilename !== 'string')) invalid()
  return { mediaFileId:row.mediaFileId, mediaType:row.mediaType, libraryCategory:row.libraryCategory,
    originalFilename:row.originalFilename || '이름 없는 파일', mimeType:row.mimeType, fileSize:row.fileSize,
    createdAt:row.createdAt, sourceType:row.sourceType }
}
export function createMediaLibraryApi({ transport, fileRequest }) {
  return {
    async list({cursor,signal}={}) {
      const body=await transport({path:'/media',query:{limit:30,...(cursor?{cursor}:{})},signal})
      if (!Array.isArray(body?.mediaFiles) || (body.nextCursor != null && (typeof body.nextCursor !== 'string' || !body.nextCursor.trim()))) invalid()
      const items=body.mediaFiles.map(row=>readMedia(row))
      if(new Set(items.map(row=>row.mediaFileId)).size!==items.length || (cursor && body.nextCursor===cursor)) invalid()
      return {items,nextCursor:body.nextCursor??null}
    },
    async get(id) { return readMedia(await transport({path:path(id)}),id) },
    file(id,options) { path(id);return fileRequest(`/media/${id}/file`,{...options,binary:true}) },
  }
}

// Cursor pages may overlap when new uploads arrive. Preserve order and dedupe by ID.
export function mergeMediaPages(previous, incoming) {
  const rows=new Map(previous.map(row=>[row.mediaFileId,row]))
  for(const row of incoming)rows.set(row.mediaFileId,row)
  return [...rows.values()]
}
export function mediaLibraryError(error) {
  if(error?.status===401)return authenticationErrorMessage(error)
  if(error?.status===403)return '이 파일에 접근할 권한이 없어요.'
  if(error?.status===404)return '파일을 찾을 수 없어요. 목록을 새로고침해 주세요.'
  if(error?.status===413)return '사진은 5MB 이하, GIF는 15MB 이하만 선택할 수 있어요.'
  if(error?.status===415)return '서버에서 지원하지 않는 파일 형식이에요.'
  return '미디어를 처리하지 못했어요. 연결을 확인하고 다시 시도해 주세요.'
}
