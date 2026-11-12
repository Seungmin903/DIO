import { detectMediaType } from './mediaPolicy.js'
import { PageExportError } from './pageExport.js'
import { loadHeicDecoder } from './heicDecoder.web.js'

export async function exportImage({ blob, media, size }) {
  const format = detectMediaType(new Uint8Array(await blob.slice(0, 64).arrayBuffer()))
  if (format.extension === 'gif') {
    const { gifFirstFramePngFromHead } = await import('./gifFirstFrame.js')
    const { png } = await gifFirstFramePngFromHead(async (length) => new Uint8Array(await blob.slice(0, length).arrayBuffer()), blob.size, { size })
    const uri = URL.createObjectURL(new Blob([png], { type: 'image/png' }))
    return { uri, dispose: () => URL.revokeObjectURL(uri) }
  }
  let source = blob
  if (format.extension === 'heic') {
    if (media?.width * media?.height > 8000000) throw new PageExportError('EXPORT_RASTER_TOO_LARGE', '이 HEIC 원본은 너무 커요. 확대나 출력 배율을 줄여 주세요.')
    const { heicTo } = await loadHeicDecoder()
    source = await heicTo({ blob, type: 'image/jpeg', quality: 1 })
  }
  const uri = URL.createObjectURL(source)
  try {
    const image = new Image()
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = uri })
    if (size && (image.naturalWidth > size.width || image.naturalHeight > size.height)) {
      const scale = Math.min(1, size.width / image.naturalWidth, size.height / image.naturalHeight)
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.ceil(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.ceil(image.naturalHeight * scale))
      try {
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height)
        const result = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Empty export raster')), format.extension === 'jpg' || format.extension === 'heic' ? 'image/jpeg' : 'image/png', 0.95))
        URL.revokeObjectURL(uri)
        const resized = URL.createObjectURL(result)
        return { uri: resized, dispose: () => URL.revokeObjectURL(resized) }
      } finally { canvas.width = canvas.height = 0 }
    }
    return { uri, dispose: () => URL.revokeObjectURL(uri) }
  } catch (error) { URL.revokeObjectURL(uri); throw error }
}

export async function readLegacyExportImage(uri) {
  const response = await fetch(uri)
  if (!response.ok) throw new Error('Image read failed')
  return { blob: await response.blob() }
}
