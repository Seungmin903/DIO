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

export const OPTIONS_TYPING_HEIGHT = 168 // 글자를 적는 동안 옵션 창 높이: 칸 제목 + 입력칸 + 위아래 한 줄씩
export const OPTIONS_TYPING_MIN_HEIGHT = 76 // 적는 칸 하나(칸 제목 + 입력칸 + 여백)는 늘 보이는 높이 (적는 동안 창 제목 · 탭은 접는다)

/**
 * 옵션 창의 입력칸(디데이 이름 · 티켓 글자 등)에 글자를 적는 동안의 자리.
 * 키보드가 창을 가리면 창을 키보드 바로 위로 내려 낮게 줄인다(적고 있는 칸만 보이는 막대처럼). 창 위쪽은 캔버스가 보이게 비워 둔다.
 * keyboardTop 은 화면 y, 나머지는 작업창 기준. 키보드가 작업창을 줄이는 환경도 작업창 아래 끝까지만 쓴다.
 * 폰 가로처럼 작업창이 낮아 minTop 아래로는 적는 칸 하나도 안 들어가면, minTop 을 넘어 작업창 위(도구 막대 쪽, 화면 위 끝까지)로
 * 올려서라도 최소 높이를 지킨다. 적는 칸이 사라지는 것보다 위 막대를 잠깐 가리는 편이 낫다.
 */
export function typingOptionsPlacement(base, { stageTop, stageHeight, keyboardTop, height = OPTIONS_TYPING_HEIGHT, minHeight = OPTIONS_TYPING_MIN_HEIGHT, minTop = OPTIONS_TOP }) {
  if (keyboardTop == null || !Number.isFinite(stageHeight)) return base
  const bottom = Math.min(stageHeight, keyboardTop - stageTop) - 8
  if (base.top + base.height <= bottom) return base // 이미 키보드 위에 다 보인다
  const top = Math.max(-(stageTop || 0), Math.min(Math.max(minTop, bottom - height), bottom - minHeight))
  return { left: base.left, top, height: Math.max(0, bottom - top) }
}

/**
 * 적는 동안의 옵션 창이 작업창 위 끝을 넘어 올라갔는지(낮은 작업창에서 최소 높이를 지키느라). 이때만 작업창이 창을 자르지 않게 한다.
 * 캔버스(Viewport)는 따로 잘리므로 페이지가 밖으로 그려지지는 않지만, 작업창을 덮는 층(선택 바)·둥근 모서리는 작업창이 잘라 주므로
 * 필요할 때만 푼다.
 */
export function typingOverflowsStage(place) {
  return Boolean(place) && place.top < 0
}

/**
 * 옵션 창에 적기 시작할 때 고른 요소가 보이게 화면을 올릴 양(작업창 px, 0이면 올리지 않는다).
 * 요소가 내려온 옵션 창과 가로로 겹치면 창 위 끝, 아니면 키보드 위 끝보다 gap 위로 요소 아래 끝을 올린다.
 * 요소 위 끝이 작업창 위 끝(gap)보다 올라가지는 않게 한다. 좌표는 모두 작업창 기준.
 */
export function typingRevealDy({ element, place, keyboardLine, panelWidth = OPTIONS_WIDTH, gap = 8 }) {
  if (!element || !place || !Number.isFinite(keyboardLine)) return 0
  const coversX = element.right > place.left && element.left < place.left + panelWidth
  const limit = (coversX ? Math.min(place.top, keyboardLine) : keyboardLine) - gap
  return Math.max(0, Math.min(element.bottom - limit, element.top - gap))
}

/**
 * 적기를 마쳤을 때 되돌릴 보기. 적기 시작할 때 올린 보기(saved.after)가 그대로면 올리기 전(saved.before)으로 되돌리고,
 * 적는 동안 사용자가 직접 옮기거나 확대했으면 그 보기를 존중해 되돌리지 않는다(null).
 */
export function typingViewRestore(saved, view) {
  if (!saved || !view) return null
  const same = (a, b) => (a == null && b == null) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.5)
  const untouched = Math.abs((view.scale ?? 1) - (saved.after.scale ?? 1)) < 1e-6 && same(view.x, saved.after.x) && same(view.y, saved.after.y)
  return untouched ? saved.before : null
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
