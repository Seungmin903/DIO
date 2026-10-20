export const STRAIGHT_HOLD_MS = 600
const HOLD_TOLERANCE_PX = 6
const MIN_LINE_PX = 16

// 화면 픽셀 기준으로 정지 여부를 판단해 확대 배율에 따라 감도가 달라지지 않게 한다.
export function createHighlighterHold({ start, zoom, onStraight, schedule = setTimeout, unschedule = clearTimeout }) {
  let timer = null, anchor = null, last = start, straight = false, cancelled = false
  const clear = () => { if (timer !== null) unschedule(timer); timer = null }
  return {
    move(point) {
      if (cancelled) return
      last = { ...point }
      if (straight) { onStraight([{ ...start }, last]); return }
      if (Math.hypot(last.x - start.x, last.y - start.y) * zoom < MIN_LINE_PX) {
        clear(); anchor = null; return
      }
      if (anchor && Math.hypot(last.x - anchor.x, last.y - anchor.y) * zoom <= HOLD_TOLERANCE_PX) return
      clear()
      anchor = last
      timer = schedule(() => {
        timer = null
        if (cancelled) return
        straight = true
        onStraight([{ ...start }, { ...last }])
      }, STRAIGHT_HOLD_MS)
    },
    cancel() { cancelled = true; clear() },
  }
}
