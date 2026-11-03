// 펜을 뗄 때 생기는 끝 갈고리(디후킹, 코덱스 2026-11-02). 손글씨 인식 전처리의 표준 단계로, 획의 마지막 구간이
// 짧고 급하게 꺾였으면 꺾인 점에서 자른다. 길이는 화면 px 기준이라 zoom 으로 페이지 단위로 바꾼다.
// 작은 점 · 받침 · 일부러 꺾은 ㄱ · ㄴ 은 길이 · 비율 · 시간 조건으로 거른다. 시작 갈고리는 붓펜 머리와 겹쳐 손대지 않는다.
// 코덱스 검수(연필 렌더)로 7px · 60° → 4px · 45°: 더 짧은 갈고리만, 덜 꺾여도 자른다
const HOOK_PX = 4, HOOK_SHARE = 0.18, MIN_STROKE_PX = 20, MIN_TURN = Math.PI / 4
const WINDOW_PX = 10, MIN_WINDOW_PX = 8, HOOK_MS = 100, PAUSE_MS = 45
// 이만큼 길면 전체 길이를 더 재지 않아도 결과가 같다(HOOK_SHARE 비율이 HOOK_PX 보다 커진다)
const ENOUGH_PX = Math.max(MIN_STROKE_PX, HOOK_PX / HOOK_SHARE)

const length = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)

// 갈고리를 뺀 점 개수. 쓰는 중에도 프레임마다 부르므로 끝에서 필요한 만큼만 걷는다. tip: 끝점 좌표를 대신 볼 값(PenInput 의 펜 끝)
export function endHookLength(points, zoom = 1, tip = points.at(-1)) {
  const count = points.length
  if (count < 4) return count
  const scale = 1 / Math.max(0.01, zoom), at = i => i === count - 1 ? tip : points[i]
  let total = 0
  for (let i = count - 1; i > 0 && total < ENOUGH_PX * scale; i--) total += length(at(i - 1), at(i))
  if (total < MIN_STROKE_PX * scale) return count
  const last = tip, maxHook = Math.min(HOOK_PX * scale, HOOK_SHARE * total)
  let best = null, tail = 0
  // 끝에서 거꾸로 걸으며 꺾인 점 후보 c 를 본다. c 뒤(갈고리)는 maxHook 이하여야 한다.
  for (let c = count - 2; c >= 1; c--) {
    tail += length(at(c), at(c + 1))
    if (tail > maxHook) break
    // 시간 조건: 꺾임부터 뗄 때까지 100ms 이하, 그 사이 45ms 이상 멈춤 없음(천천히 꺾은 획은 의도)
    if (Number.isFinite(last.time) && Number.isFinite(points[c].time)) {
      if (last.time - points[c].time > HOOK_MS) break
      let paused = false
      for (let i = c + 1; i < count; i++) if (at(i).time - at(i - 1).time >= PAUSE_MS) paused = true
      if (paused) continue
    }
    // 꺾이기 전 10px 의 진행 방향
    let back = c, window = 0
    while (back > 0 && window < WINDOW_PX * scale) { window += length(points[back - 1], points[back]); back-- }
    if (window < MIN_WINDOW_PX * scale) continue
    const ax = points[c].x - points[back].x, ay = points[c].y - points[back].y
    const bx = last.x - points[c].x, by = last.y - points[c].y
    if (!Math.hypot(bx, by)) continue
    const turn = Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
    // 갈고리 길이 안에서 꺾인 곳이 여럿이면 가장 앞(획 몸통 쪽)에서 자른다
    if (turn >= MIN_TURN) best = c
  }
  return best == null ? count : best + 1
}

export function trimEndHook(points, zoom = 1) {
  const count = endHookLength(points, zoom)
  return count === points.length ? points : points.slice(0, count)
}
