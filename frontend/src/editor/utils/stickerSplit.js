// Pixel work lives in the optional native module. These helpers are platform independent.
export const SPLIT_API_VERSION = 3
export const MAX_SPLIT_PIXELS = 32_000_000
export const FULL_CROP = Object.freeze({ x: 0, y: 0, width: 1, height: 1 })

// Fresco reports the decoded/downsampled bitmap, not necessarily the PNG's
// original pixel dimensions. Only a changed aspect ratio indicates a mismatch.
export function previewLoadMatches(source, decoded) {
  if (!source.previewWidth || !source.previewHeight || decoded?.width == null || decoded?.height == null) return true
  if (![decoded.width, decoded.height].every(value => Number.isFinite(value) && value > 0)) return false
  const difference = Math.abs(decoded.width * source.previewHeight - decoded.height * source.previewWidth)
  const rounding = source.previewWidth + source.previewHeight
  return difference <= rounding + 0.01 * decoded.height * source.previewWidth
}

export function splitAvailable({ platform, module, disabled = false }) {
  return !disabled && ['android', 'ios'].includes(platform) && module?.apiVersion === SPLIT_API_VERSION &&
    ['analyze', 'merge', 'cancel', 'cleanup'].every(key => typeof module[key] === 'function')
}
export function imagePoint(x, y, frame, image, view = { zoom: 1, x: 0, y: 0 }, clamp = false) {
  const scale = Math.min(frame.width / image.width, frame.height / image.height) * view.zoom
  if (!Number.isFinite(scale) || scale <= 0) return null
  const left = (frame.width - image.width * scale) / 2 + view.x, top = (frame.height - image.height * scale) / 2 + view.y
  const px = (x - left) / (image.width * scale), py = (y - top) / (image.height * scale)
  if (clamp) return { x: Math.max(0, Math.min(1, px)), y: Math.max(0, Math.min(1, py)) }
  return px >= 0 && px <= 1 && py >= 0 && py <= 1 ? { x: px, y: py } : null
}
export function cropBetween(a, b) {
  const width = Math.abs(a.x - b.x), height = Math.abs(a.y - b.y)
  if (width < 0.005 || height < 0.005) throw new Error('서로 떨어진 두 모서리를 선택해 주세요.')
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width, height }
}
export function validateSplitOptions({ crop, backgroundX, backgroundY, tolerance, autoBackground = false }) {
  if (!crop || ![crop.x, crop.y, crop.width, crop.height, tolerance].every(Number.isFinite) ||
    crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001 ||
    (!autoBackground && (![backgroundX, backgroundY].every(Number.isFinite) || backgroundX < 0 || backgroundX > 1 || backgroundY < 0 || backgroundY > 1)) || tolerance < 0 || tolerance > 150) throw new Error('배경과 자르기 영역을 다시 지정해 주세요.')
}
export function splitError(error) {
  const message = String(error?.message ?? error)
  if (message.includes('SVG_SPLIT_UNSUPPORTED')) return 'SVG는 자동 분리를 지원하지 않아요. PNG로 변환한 뒤 선택해 주세요.'
  if (message.includes('ANIMATED_SPLIT_IMAGE')) return 'GIF·APNG·움직이는 WebP는 자동 분리를 지원하지 않아요. 정지 PNG·JPEG·WebP를 선택해 주세요.'
  if (message.includes('UNSUPPORTED_SPLIT_FORMAT')) return '자동 분리는 정지 PNG·JPEG(JPG)·WebP만 지원해요. 파일을 변환한 뒤 선택해 주세요.'
  if (message.includes('INVALID_SPLIT_IMAGE') || message.includes('DECODE_FAILED')) return '이미지가 손상됐거나 읽을 수 없어요. 다른 파일로 다시 선택해 주세요.'
  if (message.includes('SPLIT_FILE_TOO_LARGE')) return '자동 분리 이미지는 50MiB까지 선택할 수 있어요.'
  if (message.includes('CANCELLED')) return '분리를 취소했어요.'
  if (message.includes('STICKER_TOO_LARGE')) return '한 스티커는 800만 화소까지 저장할 수 있어요. 사용 영역을 줄여 주세요.'
  if (message.includes('INSUFFICIENT_SCRATCH_SPACE')) return '분리 작업용 저장 공간이 부족해요. 여유 공간을 확보하거나 사용 영역을 줄여 주세요.'
  if (message.includes('OUTPUT_TOO_LARGE')) return '분리 결과의 총 이미지 크기가 너무 커요. 사용 영역을 줄여 주세요.'
  if (message.includes('TILED_DECODE_UNSUPPORTED')) return '이 이미지 형식은 나눠 읽을 수 없어요. PNG나 JPEG 파일로 다시 선택해 주세요.'
  if (message.includes('IMAGE_TOO_LARGE')) return 'Android는 3,200만 화소, iOS는 800만 화소 이하 이미지를 지원해요. 이미지를 줄인 뒤 다시 선택해 주세요.'
  if (message.includes('TOO_MANY_PARTS')) return '조각이 4,096개를 넘었어요. 사용할 영역을 줄이거나 배경 허용 범위를 조정해 주세요.'
  return '처리하지 못했어요. 기기 저장 공간과 이미지를 확인하고 다시 시도해 주세요.'
}
