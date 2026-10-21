export const MEDIA_POLICY = Object.freeze({
  maxBytes: 50 * 1024 * 1024, maxDimension: 12000, maxPixels: 64000000,
  // GIF 파일 크기는 사진과 같이 50MiB까지. 가로·세로는 내보내기(첫 장면 PNG)가 4096px 까지라 그대로 둔다.
  gifMaxBytes: 50 * 1024 * 1024, gifMaxDimension: 4096,
  // 사진 표시본은 태블릿 화면(2560px)을 꽉 채워도 흐려지지 않게 긴 변 3072px. 캔버스는 이 표시본을 줄이지 않고 그대로 푼다(ObjectView).
  displayMaxDimension: { photo: 3072, sticker: 512, tape: 1400 },
})
export const MEDIA_FORMATS = 'JPEG · PNG · WebP · HEIC · GIF'

export class MediaError extends Error {
  constructor(code, message, cause) {
    super(message)
    this.name = 'MediaError'
    this.code = code
    this.cause = cause
  }
}

export function checkSize(size, format) {
  if (!Number.isSafeInteger(size) || size <= 0) throw new MediaError('INVALID_MEDIA', '비어 있거나 읽을 수 없는 파일이에요.')
  const limit = format?.extension === 'gif' ? MEDIA_POLICY.gifMaxBytes : MEDIA_POLICY.maxBytes
  if (size > limit) throw new MediaError('FILE_TOO_LARGE', format?.extension === 'gif' ? 'GIF는 한 장에 50MiB까지 가져올 수 있어요.' : '이미지는 한 장에 50MiB까지 가져올 수 있어요.')
}

export function checkDimensions({ width, height }, format) {
  if (![width, height].every((v) => Number.isInteger(v) && v > 0)) throw new MediaError('MEDIA_DECODE_FAILED', '이미지의 크기를 읽지 못했어요.')
  const limit = format?.extension === 'gif' ? MEDIA_POLICY.gifMaxDimension : MEDIA_POLICY.maxDimension
  if (Math.max(width, height) > limit || width * height > MEDIA_POLICY.maxPixels) throw new MediaError('IMAGE_TOO_LARGE', format?.extension === 'gif' ? 'GIF의 가로·세로는 각각 4,096px까지 가져올 수 있어요.' : '이미지는 6,400만 화소, 가로·세로 각각 12,000px까지 가져올 수 있어요.')
}

export function displayDimensions({ width, height }, usage = 'photo') {
  const limit = MEDIA_POLICY.displayMaxDimension[usage] ?? MEDIA_POLICY.displayMaxDimension.photo
  const scale = Math.min(1, limit / Math.max(width, height))
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

/** 확장자나 picker MIME을 신뢰하지 않고 실제 파일을 검사한다. 디코딩도 별도로 확인한다. */
export function detectMediaType(header) {
  const bytes = header instanceof Uint8Array ? header : new Uint8Array(header)
  const starts = (values) => values.every((v, i) => bytes[i] === v)
  const text = (from, to) => String.fromCharCode(...bytes.slice(from, to))
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: 'image/png', extension: 'png' }
  if (starts([0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', extension: 'jpg' }
  if (['GIF87a', 'GIF89a'].includes(text(0, 6))) return { mimeType: 'image/gif', extension: 'gif' }
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return { mimeType: 'image/webp', extension: 'webp' }
  if (text(4, 8) === 'ftyp') {
    const brands = [text(8, 12)]
    const size = bytes.length >= 4 ? new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) : 0
    for (let offset = 16; offset + 4 <= Math.min(size, bytes.length); offset += 4) brands.push(text(offset, offset + 4))
    if (brands.some((brand) => ['heic', 'heix', 'heim', 'heis'].includes(brand))) return { mimeType: 'image/heic', extension: 'heic' }
  }
  throw new MediaError('UNSUPPORTED_MEDIA_TYPE', 'JPEG, PNG, WebP, HEIC, GIF 파일을 선택해 주세요.')
}

export function storageError(error, code = 'STORAGE_WRITE_FAILED') {
  if (error instanceof MediaError) return error
  const full = error?.name === 'QuotaExceededError' || /ENOSPC|no space|disk.*full/i.test(error?.message ?? '')
  return new MediaError(full ? 'STORAGE_FULL' : code,
    full ? '기기 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.' : '이미지를 저장하거나 불러오지 못했어요. 다시 시도해 주세요.', error)
}
