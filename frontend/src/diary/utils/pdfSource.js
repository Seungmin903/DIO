// PDF 쪽 그림(3000px)은 확대하면 흐려지므로, 원본 PDF 를 앱에 보관해 두고 확대한 영역만 원본에서 다시 그린다(PdfDetail).
// 여기는 플랫폼과 상관없는 순수 계산만 둔다. 영역 그리기는 pdfRegion.*, 원본 보관은 pdfSourceStore.*.

// 보이는 영역 둘레에 더 그려 두는 여백(보이는 폭 · 높이 대비). pdf.js detail view 는 1배(화면의 9배 픽셀)지만
// 안드로이드 비트맵 메모리를 생각해 0.25배로 시작하고, 아래 픽셀 예산으로 한 번 더 제한한다.
export const DETAIL_MARGIN = 0.25
// 영역 그림 한 장의 최대 화소(약 36MB 비트맵). 이 안에서 화면 해상도까지 올린다.
export const DETAIL_PIXEL_BUDGET = 9_000_000
export const DETAIL_MAX_EDGE = 4096
// 보이는 영역이 그려 둔 영역 가장자리에서 이만큼(보이는 크기 대비) 안쪽까지 다가오면 새로 그린다.
export const DETAIL_REFRESH_MARGIN = 0.1
// 손을 떼고(움직임이 멈추고) 이 시간 뒤에 그린다.
export const DETAIL_SETTLE_MS = 150
// 확대할 때는 기본 그림보다 이 배 이상 선명해질 때만 그린다.
export const DETAIL_MIN_GAIN = 1.1
// 반대로 기본 그림을 이 배 넘게 줄여서 보면(한 쪽을 화면에 맞춰 볼 때) 얇은 선(달력 줄 등)이 뭉개지거나 사라지므로,
// 그 화면 해상도로 원본에서 바로 다시 그린다. PDF 그리기는 얇은 선도 최소 1픽셀로 그려 준다.
export const DETAIL_DOWNSCALE_LIMIT = 1.25

// 서버가 PDF 원본으로 받는 최대 크기(25MiB). 넘으면 원본은 올리지 않고 기기에만 둔다(친구 화면은 기본 그림 그대로).
export const PDF_SHARE_MAX_BYTES = 25 * 1024 * 1024

const finite = value => Number.isFinite(value)

/** 저장 · 문서에서 읽은 pdfSource 를 정리한다. 맞지 않으면 null. */
export function normalizePdfSource(value) {
  if (!value || typeof value !== 'object') return null
  const { sourceId, pageIndex, edge } = value
  // 파일 이름으로 쓰므로 공유 문서에서 와도 경로를 벗어나지 못하게 문자를 제한한다.
  if (typeof sourceId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(sourceId.trim())) return null
  if (!Number.isInteger(pageIndex) || pageIndex < 0) return null
  return { sourceId: sourceId.trim(), pageIndex, edge: finite(edge) && edge > 0 ? Math.round(edge) : null }
}

const intersect = (a, b) => {
  const left = Math.max(a.x, b.x), top = Math.max(a.y, b.y)
  const right = Math.min(a.x + a.width, b.x + b.width), bottom = Math.min(a.y + a.height, b.y + b.height)
  return right > left && bottom > top ? { x: left, y: top, width: right - left, height: bottom - top } : null
}

/**
 * 이 PDF 쪽에 영역 그림이 필요한지, 필요하면 어느 영역을 몇 픽셀로 그릴지 정한다.
 * - object: 페이지 위 PDF 쪽 그림(논리 좌표 x y w h, pdfSource.edge = 기본 그림의 긴 변 픽셀)
 * - visible: 화면에 보이는 페이지 범위(논리 좌표). zoom: 논리 1 당 화면 dp. pixelRatio: dp 당 기기 픽셀.
 * - current: 지금 얹혀 있는 영역 그림 { rect(쪽 전체 대비 0~1 비율), density(논리 1 당 픽셀) }
 * 반환: null(기본 그림으로 충분) | { keep: true }(지금 영역 그림 그대로) | { rect, outWidth, outHeight, density }
 */
export function planPdfDetail({ object, visible, zoom, pixelRatio = 1, current = null, budget = DETAIL_PIXEL_BUDGET }) {
  const source = normalizePdfSource(object?.pdfSource)
  if (!source || !visible || !finite(zoom) || zoom <= 0 || object.rotation || object.flipX || object.flipY) return null
  if (![object.x, object.y, object.w, object.h].every(finite) || object.w <= 0 || object.h <= 0) return null
  const baseDensity = (source.edge ?? 3000) / Math.max(object.w, object.h)
  const needed = zoom * Math.max(1, pixelRatio)
  const upscaled = needed > baseDensity, downscaled = needed * DETAIL_DOWNSCALE_LIMIT < baseDensity
  if (!upscaled && !downscaled) return null
  const box = { x: object.x, y: object.y, width: object.w, height: object.h }
  const shown = intersect(visible, box)
  if (!shown) return null

  const marginX = visible.width * DETAIL_MARGIN, marginY = visible.height * DETAIL_MARGIN
  const left = Math.max(box.x, shown.x - marginX), top = Math.max(box.y, shown.y - marginY)
  const right = Math.min(box.x + box.width, shown.x + shown.width + marginX), bottom = Math.min(box.y + box.height, shown.y + shown.height + marginY)
  const width = right - left, height = bottom - top
  let density = Math.min(needed, Math.sqrt(budget / (width * height)), DETAIL_MAX_EDGE / Math.max(width, height))
  if (upscaled && density < baseDensity * DETAIL_MIN_GAIN) return null
  density = Math.floor(density * 100) / 100
  // 지금 얹힌 영역 그림이 (가장자리 여유를 두고) 보이는 곳을 덮고 충분히 선명하면 그대로 둔다.
  if (current && covers(current.rect, object, box, shown, visible) && current.density >= density * 0.9 && current.density <= density * 1.3) return { keep: true }
  return {
    rect: { x: (left - box.x) / object.w, y: (top - box.y) / object.h, width: width / object.w, height: height / object.h },
    outWidth: Math.max(1, Math.round(width * density)), outHeight: Math.max(1, Math.round(height * density)), density,
  }
}

function covers(r, object, box, shown, visible) {
  const slackX = visible.width * DETAIL_REFRESH_MARGIN, slackY = visible.height * DETAIL_REFRESH_MARGIN
  const left = Math.max(box.x, shown.x - slackX), top = Math.max(box.y, shown.y - slackY)
  const right = Math.min(box.x + box.width, shown.x + shown.width + slackX), bottom = Math.min(box.y + box.height, shown.y + shown.height + slackY)
  const eps = 1e-6
  return box.x + r.x * object.w <= left + eps && box.y + r.y * object.h <= top + eps
    && box.x + (r.x + r.width) * object.w >= right - eps && box.y + (r.y + r.height) * object.h >= bottom - eps
}

/** 문서 · 보관함 값 안에 들어 있는 원본 PDF id(`pdfSource.sourceId`)를 모두 모은다. */
export function collectPdfSourceIds(value) {
  const ids = new Set()
  const visit = item => {
    if (!item || typeof item !== 'object') return
    if (Array.isArray(item)) { item.forEach(visit); return }
    const source = normalizePdfSource(item.pdfSource)
    if (source) ids.add(source.sourceId)
    Object.values(item).forEach(visit)
  }
  visit(value)
  return [...ids]
}
