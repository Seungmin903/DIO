// 캔버스 위에 떠 있는 메뉴(선택 바 · 링크 카드 · 빈 곳 메뉴 · 속지 색 말풍선)의 자리 규칙 (docs/design-guide.md 11장)
// 1) 대상(선택 상자 + 회전 손잡이, 또는 누른 자리)을 피할 영역으로 잡는다.
// 2) 피할 영역의 위에 먼저, 자리가 없으면 아래에 GAP 만큼 띄운다. (펜을 쥔 손이 아래쪽을 가려서 위가 먼저)
// 3) 위·아래 모두 자리가 없으면 영역 안으로 밀어 넣되, 회전 손잡이의 반대쪽에 붙인다.
// 4) 가로는 대상 가운데에 맞추고 영역 안(EDGE)으로 민다.
// 영역은 페이지, 또는 선택 바처럼 작업창 위에 뜨는 메뉴는 보이는 작업 영역(툴바·패널 제외)이다.
import { clamp, rotateVector } from './common.js'
import { TEXT_FRAME_PAD } from './text.js'

export const POPOVER_GAP = 16 // 피할 영역과 메뉴 사이
export const POPOVER_EDGE = 8 // 페이지 가장자리와 메뉴 사이
export const ROTATE_OFFSET = 34 // 선택 테두리에서 회전 손잡이 가운데까지 (화면 px, 배율과 무관)
export const ROTATE_HANDLE = 18 // 회전 손잡이 지름

/**
 * 피할 영역 (화면 px). bounds 는 논리 좌표의 축 정렬 경계(회전 반영), handleOf 는 회전 손잡이가 보이는 요소 하나.
 * 반환값의 handleY 는 회전 손잡이 가운데의 y (없으면 null).
 */
export function keepOutBox(bounds, zoom, handleOf = null) {
  const pad = handleOf?.type === 'text' ? TEXT_FRAME_PAD : 0 // 텍스트 선택 테두리는 글자에서 이만큼 바깥
  let left = bounds.left * zoom, right = bounds.right * zoom, top = bounds.top * zoom, bottom = bounds.bottom * zoom
  let handleY = null
  if (handleOf) {
    // 꼭짓점·변 손잡이는 테두리에 반쯤 걸쳐 있다
    const r0 = ROTATE_HANDLE / 2 + pad
    left -= r0; right += r0; top -= r0; bottom += r0
    // 손잡이는 요소 위쪽 가운데에서 바깥으로 ROTATE_OFFSET. 요소와 함께 돈다.
    const cx = (handleOf.x + handleOf.w / 2) * zoom, cy = (handleOf.y + handleOf.h / 2) * zoom
    const at = rotateVector(0, -(handleOf.h * zoom / 2 + pad + ROTATE_OFFSET), handleOf.rotation ?? 0)
    const hx = cx + at.x, hy = cy + at.y, r = ROTATE_HANDLE / 2
    left = Math.min(left, hx - r); right = Math.max(right, hx + r); top = Math.min(top, hy - r); bottom = Math.max(bottom, hy + r)
    handleY = hy
  }
  return { left, right, top, bottom, cx: (left + right) / 2, handleY }
}

// area: 메뉴를 둘 영역. 숫자면 0~area (페이지), 객체면 { top, bottom } · { left, right } (보이는 작업 영역)
const span = (area, from, to) => (typeof area === 'number' ? [0, area] : [area[from], area[to]])

/** 세로 자리: 위 먼저 → 아래 → (둘 다 안 되면) 손잡이 반대쪽에 붙여 영역 안으로 */
export function placeVertical(box, height, area, { gap = POPOVER_GAP, edge = POPOVER_EDGE, prefer = 'above' } = {}) {
  const [areaTop, areaBottom] = span(area, 'top', 'bottom')
  const above = box.top - gap - height, below = box.bottom + gap
  const fits = { above: above >= areaTop + edge, below: below + height <= areaBottom - edge }
  const order = prefer === 'above' ? ['above', 'below'] : ['below', 'above']
  const side = order.find((s) => fits[s])
    // 둘 다 안 되면: 손잡이가 위쪽 반에 있으면 아래, 아래쪽 반에 있으면 위. 손잡이가 없으면 넉넉한 쪽
    ?? (box.handleY != null ? (box.handleY < (box.top + box.bottom) / 2 ? 'below' : 'above') : (box.top - areaTop >= areaBottom - box.bottom ? 'above' : 'below'))
  const min = areaTop + edge, max = Math.max(min, areaBottom - height - edge)
  return { top: clamp(side === 'above' ? above : below, min, max), side, fits: Boolean(fits[side]) }
}

/** 가로 자리: 대상 가운데에 맞추고 영역 안으로 */
export const placeHorizontal = (centerX, width, area, edge = POPOVER_EDGE) => {
  const [areaLeft, areaRight] = span(area, 'left', 'right')
  return clamp(centerX - width / 2, areaLeft + edge, Math.max(areaLeft + edge, areaRight - width - edge))
}

/** 속지와 작업창이 겹치는 영역에 속지 설정을 배치한다. 좌표와 크기는 화면 픽셀이다. */
export function paperPanelPlacement({ at, zoom, pageWidth, pageHeight, visible, height }) {
  const area = visible ? {
    left: Math.max(0, visible.x * zoom),
    top: Math.max(0, visible.y * zoom),
    right: Math.min(pageWidth * zoom, (visible.x + visible.width) * zoom),
    bottom: Math.min(pageHeight * zoom, (visible.y + visible.height) * zoom),
  } : { left: 0, top: 0, right: pageWidth * zoom, bottom: pageHeight * zoom }
  const width = Math.max(0, Math.min(300, area.right - area.left - POPOVER_EDGE * 2))
  const maxHeight = Math.max(0, area.bottom - area.top - POPOVER_EDGE * 2)
  const panelHeight = Math.min(height, maxHeight)
  const point = { top: at.y * zoom, bottom: at.y * zoom, handleY: null }
  return {
    position: 'absolute', zIndex: 6, width, maxHeight,
    left: placeHorizontal(at.x * zoom, width, area),
    top: placeVertical(point, panelHeight, area).top,
  }
}
