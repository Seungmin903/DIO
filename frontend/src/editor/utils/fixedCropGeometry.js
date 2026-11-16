import { clamp } from './common.js'
import { freeZoom } from './photoCropGeometry.js'

export function fixedCropFrame(width, height, padding = 18) {
  const side = Math.max(1, Math.min(width, height) - padding * 2)
  return { left: (width - side) / 2, top: (height - side) / 2, width: side, height: side }
}

export function fixedCropImage(rect, frame) {
  const width = frame.width / (rect.u1 - rect.u0)
  const height = frame.height / (rect.v1 - rect.v0)
  return { left: frame.left - rect.u0 * width, top: frame.top - rect.v0 * height, width, height }
}

// 원은 고정하고 사진을 이동한다. 확대의 기준은 처음 두 손가락이 닿은 위치다.
export function transformFixedCrop(rect, frame, zoom, dx = 0, dy = 0, anchor = { x: 0.5, y: 0.5 }) {
  const factor = freeZoom(rect) / Math.max(1, zoom)
  const oldWidth = rect.u1 - rect.u0, oldHeight = rect.v1 - rect.v0
  const width = Math.min(1, oldWidth * factor), height = Math.min(1, oldHeight * factor)
  const u0 = clamp(rect.u0 + anchor.x * (oldWidth - width) - dx / frame.width * width, 0, 1 - width)
  const v0 = clamp(rect.v0 + anchor.y * (oldHeight - height) - dy / frame.height * height, 0, 1 - height)
  return { u0, v0, u1: u0 + width, v1: v0 + height }
}

/** 전체 자르기 무대가 responder를 소유해 원 밖에서도 이동을 계속 받는다. */
export function createFixedCropGesture(read) {
  let start = null
  function sample(event) {
    const native = event.nativeEvent
    const touches = native.touches?.length ? Array.from(native.touches) : []
    if (!touches.length) return null
    const used = touches.slice(0, 2)
    const center = used.reduce((c, t) => ({ x: c.x + t.pageX / used.length, y: c.y + t.pageY / used.length }), { x: 0, y: 0 })
    return { count: touches.length, center, distance: used.length === 2 ? Math.hypot(used[0].pageX - used[1].pageX, used[0].pageY - used[1].pageY) : 0 }
  }
  function rebase(event) {
    const point = sample(event)
    if (!point) { finish(); return }
    const { rect, frame, onInteraction } = read()
    // nativeEvent의 첫 터치 좌표로 무대의 화면상 원점을 구한다.
    const n = event.nativeEvent
    const origin = { x: n.pageX - n.locationX, y: n.pageY - n.locationY }
    start = { ...point, rect, frame, anchor: {
      x: clamp((point.center.x - origin.x - frame.left) / frame.width, 0, 1),
      y: clamp((point.center.y - origin.y - frame.top) / frame.height, 0, 1),
    } }
    onInteraction?.(true)
  }
  function finish() { start = null; read().onInteraction?.(false) }
  return {
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: rebase,
    onResponderStart: rebase,
    onResponderEnd: rebase,
    onResponderMove(event) {
      const point = sample(event)
      if (!point) return
      if (!start || point.count !== start.count) { rebase(event); return }
      const { onChange, maxZoom } = read()
      const zoom = clamp(freeZoom(start.rect) * (start.distance > 0 ? point.distance / start.distance : 1), 1, maxZoom)
      onChange(transformFixedCrop(start.rect, start.frame, zoom, point.center.x - start.center.x, point.center.y - start.center.y, start.anchor))
    },
    onResponderRelease: finish,
    onResponderTerminate: finish,
  }
}
