import { requireOptionalNativeModule } from 'expo-modules-core'
import { File } from 'expo-file-system'
import { pdfSourceUri } from './pdfSourceStore.native.js'
import { canRenderPdfDetail } from './pdfPageRaster.native.js'

// 영역 그리기는 modules/dio-pdf-render 의 renderRegion. 이 기능이 들어가기 전 개발 빌드에는 없어서 그때는 영역을 그리지 않는다(기본 그림 그대로).
let native = null
try { native = requireOptionalNativeModule('DioPdfRender') } catch { /* Expo Go */ }

export const pdfRegionAvailable = canRenderPdfDetail

/**
 * rect = 쪽 전체 대비 0~1 비율 { x, y, width, height }. 반환: { uri } (쓰고 나면 releasePdfRegion).
 */
export async function renderPdfRegion({ sourceId, pageIndex, rect, outWidth, outHeight }) {
  if (!pdfRegionAvailable()) throw new Error('PDF_REGION_UNAVAILABLE')
  const uri = pdfSourceUri(sourceId)
  if (!uri) throw new Error('PDF_SOURCE_MISSING')
  const { uri: rendered } = await native.renderRegion(uri, pageIndex, rect.x, rect.y, rect.width, rect.height, outWidth, outHeight)
  return { uri: rendered }
}

export function releasePdfRegion(uri) {
  try { const file = new File(uri); if (file.exists) file.delete() } catch { /* 캐시 폴더 정리에 맡긴다. */ }
}
