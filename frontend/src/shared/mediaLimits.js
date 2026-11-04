export const sharedImageMaxBytes = 5 * 1024 * 1024
export const sharedGifMaxBytes = 15 * 1024 * 1024
const megabytes = bytes => bytes / 1024 / 1024
export const mediaLibrarySizeMessage = () => `사진은 ${megabytes(sharedImageMaxBytes)}MB 이하, GIF는 ${megabytes(sharedGifMaxBytes)}MB 이하만 선택할 수 있어요.`
export const mediaTooLargeLabel = mimeType => `${megabytes(mimeType === 'image/gif' ? sharedGifMaxBytes : sharedImageMaxBytes)}MB 초과`
export const mediaShareSizeMessage = extension => extension === 'gif'
  ? `GIF는 ${megabytes(sharedGifMaxBytes)}MB 이하만 공유할 수 있어요.`
  : `공유 이미지는 기존 에셋 API 기준으로 ${megabytes(sharedImageMaxBytes)}MB 이하만 사용할 수 있어요.`
