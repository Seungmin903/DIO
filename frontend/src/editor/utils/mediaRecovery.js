import { detectMediaType, MediaError } from './mediaPolicy.js'

export function validateStoredOriginal(header, size, metadata) {
  try {
    const format = detectMediaType(header)
    if (!size || (metadata?.fileSize != null && metadata.fileSize !== size) ||
      (metadata?.mimeType && metadata.mimeType !== format.mimeType)) throw new Error('Original metadata mismatch')
  } catch (error) {
    throw new MediaError('MEDIA_CORRUPT', '저장된 이미지가 손상되었어요. 원본 파일을 다시 선택해 주세요.', error)
  }
}

export function mediaFailureMessage(error) {
  switch (error?.code) {
    case 'MEDIA_NOT_FOUND': return '저장된 원본을 찾을 수 없어요. 기존 요소는 유지돼요. 원본 파일을 다시 선택해 주세요.'
    case 'MEDIA_CORRUPT':
    case 'MEDIA_DECODE_FAILED': return '이미지가 손상되었거나 표시할 수 없어요. 원본 파일을 다시 선택해 주세요.'
    case 'STORAGE_FULL': return '저장 공간이 부족해요. 공간을 확보한 뒤 다시 선택해 주세요. 기존 페이지는 유지돼요.'
    default: return error?.message || '이미지를 불러오지 못했어요. 다시 시도해 주세요.'
  }
}
