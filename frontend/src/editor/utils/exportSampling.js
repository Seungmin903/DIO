import { PageExportError } from './pageExport.js'

/** cover·자르기 확대까지 고려한 원본 전체의 필요 픽셀 크기. 여백을 포함해 보수적으로 계산한다. */
export function exportRasterSize(objects, snapshot, dimensions) {
  const { width, height } = dimensions
  if (!(width > 0 && height > 0)) return null
  const outputScale = Math.max(snapshot.pixelWidth / snapshot.width, snapshot.pixelHeight / snapshot.height)
  const scale = Math.min(1, Math.max(...objects.map((o) => Math.max(o.w / width, o.h / height) * Math.max(1, o.crop?.zoom ?? 1) * outputScale)))
  return { width: Math.ceil(width * scale), height: Math.ceil(height * scale) }
}

export function selectExportRaster(record, objects, snapshot) {
  const media = record.media ?? { width: objects[0].imageWidth, height: objects[0].imageHeight }
  const size = exportRasterSize(objects, snapshot, media)
  if (media.mimeType === 'image/gif' || media.extension === 'gif') return { blob: record.blob, media, size, selected: 'original' }
  const display = media.display
  if (size && record.displayBlob && display?.width >= size.width && display?.height >= size.height) {
    return { blob: record.displayBlob, media: display, size, selected: 'display' }
  }
  // 큰 원본을 무조건 디코딩하지 않는다. 타일 디코딩 지원 전에는 안전하게 중단한다.
  if (media.width * media.height > 8000000) throw new PageExportError('EXPORT_RASTER_TOO_LARGE', '확대된 부분에 필요한 이미지가 너무 커요. 자르기 확대나 출력 배율을 줄여 주세요.')
  return { blob: record.blob, media, size, selected: 'original' }
}

export function parseImageDataUri(uri) {
  const match = /^data:(image\/(?:png|jpeg|webp|gif|heic));base64,([A-Za-z0-9+/]*={0,2})$/i.exec(uri)
  if (!match || !match[2] || match[2].length % 4 !== 0 || match[2].length > 50 * 1024 * 1024 * 4 / 3 + 4) throw new PageExportError('EXPORT_DATA_URI_INVALID', '이전 이미지 데이터를 읽지 못했어요. 이미지를 다시 선택해 주세요.')
  return { mimeType: match[1].toLowerCase(), base64: match[2], extension: match[1].split('/')[1].toLowerCase() }
}
