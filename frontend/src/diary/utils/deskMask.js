// 책상 창빛 마스크의 자리 계산과, 화면 안 책상 · 표지 위치를 나눠 쓰는 작은 저장소.
// 표지가 같은 마스크를 자기 위에 비춰 십자 창살 자리에는 빛이 들지 않게 하려면 책상 창빛과 같은 자리 계산이 필요하다.
import { useSyncExternalStore } from 'react'

export const LIGHT_ASPECT = 0.6357 // 창빛 그림의 세로 / 가로 (웹에는 Image.resolveAssetSource 가 없어 직접 적는다)
export const WINDOW_WIDTH = { tablet: 0.85, phone: 1.5 } // 책상 폭에 대한 창빛 폭
export const APEX_X = (1 - WINDOW_WIDTH.tablet) / 2 // 창빛이 가장 높을 때 책상 가운데에 오는 왼쪽 자리(책상 폭 비율)

/** 책상 크기(size)와 변형(patch)으로 창빛 마스크가 책상 위에 놓이는 자리(px) · 변형. */
export function maskFrame(patch, size, compact) {
  const lightWidth = size.width * (compact ? WINDOW_WIDTH.phone : WINDOW_WIDTH.tablet)
  const x = APEX_X + patch.x
  return {
    width: lightWidth,
    height: lightWidth * LIGHT_ASPECT,
    left: size.width * (compact ? x - 0.45 : x),
    top: size.height * (compact ? 0.1 + patch.y : patch.y),
    transform: [{ scaleX: patch.scaleX }, { scaleY: patch.scaleY }, { skewX: `${patch.skewX}deg` }, { rotate: `${patch.rotate}deg` }],
  }
}

// 화면(window) 안 책상의 자리 · 크기: { x, y, width, height, compact }. 책상이 없으면 null.
let desk = null
// 카드가 옮겨 다닌 뒤 표지가 자리를 다시 재도록 알리는 숫자
let tick = 0
const listeners = new Set()
const emit = () => listeners.forEach(listener => listener())
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

export function setDeskGeometry(next) {
  if (next && desk && next.x === desk.x && next.y === desk.y && next.width === desk.width && next.height === desk.height && next.compact === desk.compact) return
  desk = next
  emit()
}
export function bumpDeskLayout() { tick += 1; emit() }
export const useDeskGeometry = () => useSyncExternalStore(subscribe, () => desk, () => null)
export const useDeskLayoutTick = () => useSyncExternalStore(subscribe, () => tick, () => 0)
