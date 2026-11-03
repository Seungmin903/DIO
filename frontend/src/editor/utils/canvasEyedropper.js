import UPNG from 'upng-js'
import { pngDimensions } from './capturePixels.js'

export function eyedropperDimensions(width, height) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0)) throw Error('캔버스 크기를 확인해 주세요.')
  const scale = Math.min(1, 2048 / Math.max(width, height))
  return { pixelWidth: Math.max(1, Math.floor(width * scale)), pixelHeight: Math.max(1, Math.floor(height * scale)) }
}
export function decodeEyedropper(bytes) {
  const { width, height } = pngDimensions(bytes)
  if (width > 2048 || height > 2048 || bytes.byteLength > 32 * 1024 * 1024) throw Error('스포이트 이미지가 너무 커요.')
  const png = UPNG.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
  if (png.frames?.length > 1) throw Error('정지 이미지가 필요해요.')
  const rgba = new Uint8Array(UPNG.toRGBA8(png)[0])
  if (rgba.length !== width * height * 4) throw Error('스포이트 이미지를 읽지 못했어요.')
  return { width, height, rgba }
}
// Both pointer and frame are overlay-local logical coordinates. Only the
// visible intersection of the page and viewport is eligible for sampling.
export function eyedropperSample(pixels, point, frame, viewport) {
  if (!pixels || !point || ![point.x, point.y].every(Number.isFinite)) return null
  for (const rect of [frame, viewport]) if (point.x < rect.x || point.y < rect.y || point.x >= rect.x + rect.width || point.y >= rect.y + rect.height) return null
  const x = Math.min(pixels.width - 1, Math.floor((point.x - frame.x) / frame.width * pixels.width))
  const y = Math.min(pixels.height - 1, Math.floor((point.y - frame.y) / frame.height * pixels.height))
  const at = (y * pixels.width + x) * 4
  if (pixels.rgba[at + 3] !== 255) return null // capture has an opaque paper background
  const color = '#' + [...pixels.rgba.subarray(at, at + 3)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  return { color, x, y, point }
}
export function eyedropperLens(point, width, height, top = 8) {
  const w = Math.min(144, width - 16, height - 42), h = w + 26
  return { x: Math.max(8, Math.min(width - w - 8, point.x - w / 2)), y: Math.max(Math.min(top, height - h - 8), Math.min(height - h - 8, point.y - h - 28)), width: w, height: h }
}
