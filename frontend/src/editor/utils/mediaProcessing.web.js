import { displayDimensions, MediaError } from './mediaPolicy.js'

async function withImage(source, work) {
  const url = URL.createObjectURL(source)
  const image = new Image()
  try {
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url })
    return await work(image)
  } finally { image.src = ''; URL.revokeObjectURL(url) }
}

export async function decode(input, format) {
  if (format.extension === 'heic') {
    try {
      // 이 모듈은 웹 HEIC 선택 시에만 로드한다. 원본 Blob은 변경하지 않는다.
      const { heicTo } = await import('heic-to/csp')
      input.decodedSource = await heicTo({ blob: input.source, type: 'image/jpeg', quality: 1 })
    } catch (error) {
      throw new MediaError('HEIC_CONVERSION_FAILED', '이 HEIC 사진을 변환하지 못했어요. JPEG로 저장한 사진을 선택해 주세요.', error)
    }
  }
  return withImage(input.decodedSource ?? input.source, (image) => ({ width: image.naturalWidth, height: image.naturalHeight }))
}

export async function createDisplay(input, format, dimensions, usage) {
  const size = displayDimensions(dimensions, usage)
  if (!input.decodedSource && size.width === dimensions.width && size.height === dimensions.height) return null
  return withImage(input.decodedSource ?? input.source, async (image) => {
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    try {
      // PNG/WebP 소재는 투명도를 보존한다. JPEG/HEIC 사진만 JPEG로 출력한다.
      const jpeg = ['jpg', 'heic'].includes(format.extension)
      const mimeType = jpeg ? 'image/jpeg' : 'image/png'
      const ctx = canvas.getContext('2d')
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(image, 0, 0, size.width, size.height)
      const source = await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Empty preview')), mimeType, 0.92))
      return { source, metadata: { ...size, mimeType, extension: jpeg ? 'jpg' : 'png', fileSize: source.size } }
    } finally { canvas.width = canvas.height = 0 }
  })
}

export function dispose(input) { input.decodedSource = null }
