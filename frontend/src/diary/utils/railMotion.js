// 사이드 메뉴가 열리고 닫히는 동안인지 알리는 작은 저장소.
// 그동안 칸 폭이 프레임마다 바뀌는데, 표지(Cover)가 매번 크기를 다시 재서 다시 그리면 목록이 끊긴다.
// 표지는 움직이는 동안 재측정을 미루고, 멈춘 뒤 마지막 크기로 한 번만 맞춘다.
import { useSyncExternalStore } from 'react'

let moving = false
let timer = null
const listeners = new Set()
const emit = () => listeners.forEach(listener => listener())
const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener) }

function set(next) {
  if (moving === next) return
  moving = next
  emit()
}

/** 메뉴가 움직이기 시작할 때 부른다. ms 뒤(애니메이션이 끝난 뒤)에 멈춘 것으로 본다. */
export function markRailMoving(ms) {
  clearTimeout(timer)
  set(true)
  timer = setTimeout(() => set(false), ms)
}

export const useRailMoving = () => useSyncExternalStore(subscribe, () => moving, () => false)
