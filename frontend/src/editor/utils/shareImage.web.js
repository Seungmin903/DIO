import { SHARE_MAX_BYTES, shareJpegAttempts } from './shareImagePlan.js'

const toBlob = (canvas, quality) => new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg', quality))

/** blob 의 그림을 5MiB 안의 JPEG 로 만든다. 반환: { blob, size }. 끝내 안 되면 413 오류. */
export async function toShareJpeg(blob, { width, height, maxBytes = SHARE_MAX_BYTES }) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url })
    for (const { scale, qualities } of shareJpegAttempts()) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      context.fillStyle = '#FFFFFF'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      try {
        for (const quality of qualities) {
          const jpeg = await toBlob(canvas, quality)
          if (jpeg && jpeg.size <= maxBytes) return { blob: jpeg, size: jpeg.size }
        }
      } finally { canvas.width = canvas.height = 0 }
    }
  } finally { URL.revokeObjectURL(url) }
  throw Object.assign(Error('공유 이미지는 기존 에셋 API 기준으로 5MB 이하만 사용할 수 있어요.'), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })
}
