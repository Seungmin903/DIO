export const STRAIGHT_HOLD_MS = 600
const HOLD_TOLERANCE_PX = 6
const MIN_LINE_PX = 16
// 직선이 된 뒤 끝점을 돌리다 수평·수직(0·90·180·270°) 근처에 오면 그 방향에 붙인다 (GoodNotes 처럼)
export const STRAIGHT_SNAP_DEG = 5

/** 시작점 기준으로 끝점이 수평·수직에서 STRAIGHT_SNAP_DEG 안이면 길이는 그대로 두고 그 축 위로 옮긴다 */
export function snapStraightEnd(start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy)
  if (!length) return end
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const axis = Math.round(angle / 90) * 90
  if (Math.abs(angle - axis) > STRAIGHT_SNAP_DEG) return end
  const rad = (axis * Math.PI) / 180
  return { ...end, x: start.x + Math.round(Math.cos(rad)) * length, y: start.y + Math.round(Math.sin(rad)) * length }
}

// 화면 픽셀 기준으로 정지 여부를 판단해 확대 배율에 따라 감도가 달라지지 않게 한다.
export function createHighlighterHold({ start, zoom, onStraight, schedule = setTimeout, unschedule = clearTimeout, now = Date.now }) {
  let timer = null, anchor = null, last = start, straight = false, cancelled = false
  const clear = () => { if (timer !== null) unschedule(timer); timer = null }
  const arm = () => {
    const scheduledAt = now()
    timer = schedule(() => {
      timer = null
      if (cancelled) return
      // JS 정체·앱 배경으로 늦게 도착한 타이머를 손의 정지로 오인하지 않는다.
      // 밀린 이동 이벤트가 처리될 시간을 준 뒤 정상적인 600ms 유지를 다시 확인한다.
      if (now() - scheduledAt > STRAIGHT_HOLD_MS + 150) { arm(); return }
      straight = true
      onStraight([{ ...start }, snapStraightEnd(start, last)])
    }, STRAIGHT_HOLD_MS)
  }
  return {
    move(point) {
      if (cancelled) return
      last = { ...point }
      if (straight) { onStraight([{ ...start }, snapStraightEnd(start, last)]); return }
      if (Math.hypot(last.x - start.x, last.y - start.y) * zoom < MIN_LINE_PX) {
        clear(); anchor = null; return
      }
      if (anchor && Math.hypot(last.x - anchor.x, last.y - anchor.y) * zoom <= HOLD_TOLERANCE_PX) return
      clear()
      anchor = last
      arm()
    },
    cancel() { cancelled = true; clear() },
  }
}
