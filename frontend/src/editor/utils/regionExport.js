import { createExportSnapshot, PageExportError } from './pageExport.js'
import { REGION_PRESETS, validRegion, regionOutput } from './regionGeometry.js'
import { pngFileName } from './pngFileSave.js'

/** 선택 UI 값과 별개로 확정 시 좌표·비율·품질 한도를 재검증한다. */
export function createRegionExportSnapshot(page, {
  pageWidth, pageHeight, region, preset = 'free',
  title, pageNumber = 1, now = new Date(), upscaleConfirmed = false,
} = {}) {
  const fail = (code, message) => { throw new PageExportError(code, message) }
  if (![pageWidth, pageHeight].every(n => Number.isFinite(n) && n > 0) ||
      !validRegion(region, { width: pageWidth, height: pageHeight })) {
    fail('EXPORT_REGION_INVALID', '페이지 안에서 가로·세로 32 이상으로 선택해 주세요.')
  }
  if (!Object.hasOwn(REGION_PRESETS, preset) || !validRegion(region, { width: pageWidth, height: pageHeight }, REGION_PRESETS[preset]?.ratio)) {
    fail('EXPORT_REGION_RATIO_INVALID', '선택 영역과 프리셋 비율을 확인해 주세요.')
  }
  // 경계의 부동소수 오차만 정규화한다. 그 외 잘못된 입력은 위에서 거부한다.
  const normalized = { ...region, width: Math.min(region.width, pageWidth - region.x), height: Math.min(region.height, pageHeight - region.y) }
  const output = regionOutput(normalized, preset)
  if (output.blocked) fail('EXPORT_REGION_UPSCALE_LIMIT', '확대가 6배를 넘어요. 더 넓게 선택해 주세요.')
  if (output.needsConfirmation && upscaleConfirmed !== true) fail('EXPORT_REGION_UPSCALE_CONFIRM_REQUIRED', '확대 화질 안내를 확인한 뒤 계속해 주세요.')
  const snapshot = createExportSnapshot(page, { width: pageWidth, height: pageHeight })
  return {
    ...snapshot, pageWidth, pageHeight, region: normalized, preset,
    width: normalized.width, height: normalized.height,
    pixelWidth: output.width, pixelHeight: output.height,
    fileName: pngFileName(title, pageNumber, now).replace(/(_\d{8}_\d{6}_\d{3}\.png)$/, `_region_${preset}$1`),
  }
}

/** 크롭은 합성 surface에서 한다. 객체 크기·회전 중심·크롭은 원래 좌표계로 유지한다. */
export function exportObjectPosition(object, snapshot, scale = 1) {
  return { left: (object.x - (snapshot.region?.x ?? 0)) * scale, top: (object.y - (snapshot.region?.y ?? 0)) * scale }
}
