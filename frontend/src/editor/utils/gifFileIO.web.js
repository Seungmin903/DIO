import UPNG from 'upng-js'
import { saveWebFile } from './saveWebFile.js'

// 페이지 GIF 만들기의 웹 입출력: 장면 PNG 주소, 찍은 페이지 픽셀 읽기, 완성 GIF 저장

/** 웹에는 네이티브 GIF 묶기가 없다(V8 에서는 JS 로 충분히 빠르다) */
export const createNativeGifAssembler = () => null

export async function readBytes(blob) {
  return typeof blob.bytes === 'function' ? await blob.bytes() : new Uint8Array(await blob.arrayBuffer())
}

export function pngResource(rgba, width, height) {
  const uri = URL.createObjectURL(new Blob([UPNG.encode([rgba.slice().buffer], width, height, 0)], { type: 'image/png' }))
  return { uri, dispose: () => URL.revokeObjectURL(uri) }
}

/** 찍은 페이지(PNG)를 RGBA 픽셀로 */
export async function captureRgba(result) {
  const bitmap = await createImageBitmap(result.blob)
  const canvas = document.createElement('canvas')
  try {
    canvas.width = result.width; canvas.height = result.height
    const context = canvas.getContext('2d', { willReadFrequently: true })
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return new Uint8Array(context.getImageData(0, 0, canvas.width, canvas.height).data.buffer)
  } finally { bitmap.close?.(); canvas.width = canvas.height = 0 }
}

export function gifResult(bytes) {
  const blob = new Blob([bytes], { type: 'image/gif' })
  const uri = URL.createObjectURL(blob)
  return { uri, blob, size: bytes.length, dispose: () => URL.revokeObjectURL(uri) }
}

export const saveGifFile = (result, fileName, options) => saveWebFile(result, fileName, { mimeType: 'image/gif', extension: '.gif', description: 'GIF 이미지', ...options })
