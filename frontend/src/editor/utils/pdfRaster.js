import UPNG from 'upng-js'
import { pdfError, PDF_LIMITS } from './pdfSnapshot.js'

/** RGBA PNG를 종이 배경에 합성한 무손실 RGB 픽셀(한 픽셀 3바이트). PDF 에는 이 픽셀을 다시 PNG 로 만들지 않고 바로 넣는다. */
export function opaquePdfRgb(bytes, page) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 33 || bytes.byteLength > PDF_LIMITS.bytes || ![137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n)) throw pdfError('EXPORT_PDF_RASTER_INVALID', '출력 PNG를 읽지 못했어요.')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const width = view.getUint32(16), height = view.getUint32(20)
  if (width !== page.pixelWidth || height !== page.pixelHeight || !width || !height || width > 4096 || height > 4096 || width * height > 8000000) throw pdfError('EXPORT_PDF_RASTER_INVALID', '출력 PNG의 크기를 확인해 주세요.')
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const decoded = UPNG.decode(buffer)
  if (decoded.frames?.length > 1) throw pdfError('EXPORT_PDF_RASTER_INVALID', '정지 PNG가 필요해요.')
  const rgba = new Uint8Array(UPNG.toRGBA8(decoded)[0])
  const bg = /^#[0-9a-f]{6}$/i.test(page.background) ? [1,3,5].map((i) => parseInt(page.background.slice(i, i + 2), 16)) : [255,255,255]
  const rgb = new Uint8Array(width * height * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    const alpha = rgba[i + 3]
    // 불투명 픽셀(대부분)은 그대로 옮긴다
    if (alpha === 255) { rgb[j] = rgba[i]; rgb[j + 1] = rgba[i + 1]; rgb[j + 2] = rgba[i + 2]; continue }
    const a = alpha / 255
    for (let c = 0; c < 3; c++) rgb[j + c] = Math.round(rgba[i + c] * a + bg[c] * (1 - a))
  }
  return { rgb, width, height }
}

/** RGBA PNG를 종이 배경에 합성하고 알파 없는 무손실 RGB PNG로 만든다. */
export function opaquePdfPng(bytes, page) {
  const { rgb, width, height } = opaquePdfRgb(bytes, page)
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0, j = 0; j < rgb.length; i += 4, j += 3) { rgba[i] = rgb[j]; rgba[i + 1] = rgb[j + 1]; rgba[i + 2] = rgb[j + 2]; rgba[i + 3] = 255 }
  // 팔레트 금지 + 불투명 픽셀: UPNG 2.1의 RGB color type 2 경로를 사용한다.
  const result = new Uint8Array(UPNG.encode([rgba.buffer], width, height, 0, undefined, true))
  if (result[25] !== 2) throw pdfError('EXPORT_PDF_RASTER_INVALID', 'RGB PNG를 만들지 못했어요.')
  return result
}
