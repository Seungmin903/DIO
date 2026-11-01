import { File } from 'expo-file-system'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { SHARE_MAX_BYTES, shareJpegAttempts } from './shareImagePlan.js'

/** uri 의 그림을 5MiB 안의 JPEG 로 만든다. 반환: { uri, size }. 끝내 안 되면 413 오류. */
export async function toShareJpeg(uri, { width, height, maxBytes = SHARE_MAX_BYTES }) {
  for (const { scale, qualities } of shareJpegAttempts()) {
    const context = ImageManipulator.manipulate(uri)
    let rendered
    try {
      if (scale < 1) context.resize({ width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) })
      rendered = await context.renderAsync()
      for (const compress of qualities) {
        const result = await rendered.saveAsync({ format: SaveFormat.JPEG, compress })
        const size = new File(result.uri).size
        if (size <= maxBytes) return { uri: result.uri, size }
        try { new File(result.uri).delete() } catch { /* 캐시 폴더 정리에 맡긴다. */ }
      }
    } finally { rendered?.release?.(); context.release?.() }
  }
  throw Object.assign(Error('공유 이미지는 기존 에셋 API 기준으로 5MB 이하만 사용할 수 있어요.'), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })
}
