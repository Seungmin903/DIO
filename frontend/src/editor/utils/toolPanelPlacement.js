import { clamp, unionBounds } from './common.js'

export const OPTIONS_WIDTH = 300
const OPTIONS_GAP = 16
export const OPTIONS_TOP = 8 // 태블릿: 작업창 위 끝부터
export const OPTIONS_TOP_PHONE = 76
const OPTIONS_MARGIN = 12
const OPTIONS_BOTTOM = 64 // 아래쪽 되돌리기 바 위까지
const CONTEXT_BAR_HALF = 180 // 요소 아래·위에 뜨는 편집 바 폭의 절반 (바도 가리지 않게)
const POPOVER_INSET = 8

/**
 * 옵션 패널 자리: 고른 요소의 화면 상자 오른쪽에 자리가 있으면 오른쪽, 없으면 왼쪽,
 * 둘 다 모자라면 더 넓은 쪽 가장자리에 붙인다. 위쪽은 요소 위 끝에 맞추되 화면 안으로.
 */
export function optionsPlacement(objects, zoom, offset, stage, optionsTop = OPTIONS_TOP) {
  const b = unionBounds(objects)
  const cx = offset.x + b.cx * zoom
  // 요소와 그 아래·위의 편집 바를 함께 피한다
  const rect = {
    left: Math.min(offset.x + b.left * zoom, cx - CONTEXT_BAR_HALF),
    right: Math.max(offset.x + b.right * zoom, cx + CONTEXT_BAR_HALF),
    top: offset.y + b.top * zoom,
  }
  const roomRight = stage.width - OPTIONS_MARGIN - rect.right
  const roomLeft = rect.left - OPTIONS_MARGIN
  const need = OPTIONS_WIDTH + OPTIONS_GAP
  let left
  if (roomRight >= need) left = rect.right + OPTIONS_GAP
  else if (roomLeft >= need) left = rect.left - need
  else left = roomRight >= roomLeft ? stage.width - OPTIONS_MARGIN - OPTIONS_WIDTH : OPTIONS_MARGIN
  left = clamp(left, OPTIONS_MARGIN, Math.max(OPTIONS_MARGIN, stage.width - OPTIONS_MARGIN - OPTIONS_WIDTH))
  const minHeight = Math.min(420, stage.height - optionsTop - OPTIONS_BOTTOM)
  const top = clamp(rect.top, optionsTop, Math.max(optionsTop, stage.height - OPTIONS_BOTTOM - minHeight))
  return { left, top, height: stage.height - OPTIONS_BOTTOM - top }
}

/**
 * 태블릿 도구 설정 창 자리: 누른 도구 가운데에 맞추되 작업창 좌우 8 안으로.
 * 도구 줄이 작업창 바로 위에 있어 작업창 위 끝에 붙이면 도구 아래에 뜬다.
 */
export function tabletToolPopover({ width = 320, anchor, stageOrigin, stageWidth = 600 }) {
  const center = (anchor?.x ?? stageOrigin.x + stageWidth / 2) - stageOrigin.x + (anchor?.width ?? 0) / 2
  const left = Math.max(POPOVER_INSET, Math.min(center - width / 2, stageWidth - width - POPOVER_INSET))
  return { left, right: POPOVER_INSET, top: POPOVER_INSET, bottom: OPTIONS_BOTTOM, alignItems: 'flex-start' }
}
