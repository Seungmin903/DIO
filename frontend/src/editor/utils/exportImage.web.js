import { detectMediaType } from './mediaPolicy.js'
import { PageExportError } from './pageExport.js'

export async function exportImage({ blob }) {
  const format = detectMediaType(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))
  if (format.extension === 'gif') throw new PageExportError('EXPORT_GIF_PENDING', 'GIF의 첫 프레임 내보내기는 준비 중이에요. GIF를 숨긴 뒤 다시 시도해 주세요.')
  let source = blob
  if (format.extension === 'heic') {
    const { heicTo } = await import('heic-to/csp')
    source = await heicTo({ blob, type: 'image/jpeg', quality: 1 })
  }
  const uri = URL.createObjectURL(source)
  try {
    await new Promise((resolve, reject) => { const image = new Image(); image.onload = resolve; image.onerror = reject; image.src = uri })
    return { uri, dispose: () => URL.revokeObjectURL(uri) }
  } catch (error) { URL.revokeObjectURL(uri); throw error }
}

export async function readLegacyExportImage(uri) {
  const response = await fetch(uri)
  if (!response.ok) throw new Error('Image read failed')
  return { blob: await response.blob() }
}
