// 안내 전용 좌표. 문서·지우개·선택 상태를 읽거나 변경하지 않는다.
export const GUIDE_CYCLE_MS = 3600
export const GUIDE_LABELS = {
  stroke: '획 지우기 예시. 지우개가 닿은 획 전체가 사라져요.',
  area: '영역 지우기 예시. 지우개가 지나간 부분만 지워져요.',
  rectangle: '네모형 올가미 예시. 사각 영역에 겹치는 세 요소를 선택해요.',
  freeform: '자유형 올가미 예시. 별을 피해 파란 두 요소를 감싸서 선택해요.',
}
const clamp = value => Math.max(0, Math.min(1, value))
const wave = (x, y) => ({ x, y: y + Math.sin((x - 40) * Math.PI / 80) * 8 })
export const GUIDE_STROKES = [48, 80, 112].map(y =>
  Array.from({ length: 121 }, (_, i) => wave(40 + i * 2, y)))
export const pointsPath = points => points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
export const GUIDE_STROKE_PATHS = GUIDE_STROKES.map(pointsPath)
const freePoints = []
const curves = [
  [[46, 78], [43, 44], [90, 40], [127, 51]],
  [[127, 51], [146, 57], [169, 52], [189, 67]],
  [[189, 67], [219, 93], [199, 128], [167, 125]],
  [[167, 125], [140, 123], [132, 112], [109, 115]],
  [[109, 115], [72, 121], [42, 105], [46, 78]],
]
for (const [a, b, c, d] of curves) {
  for (let i = 0; i < 24; i++) {
    const t = i / 24, u = 1 - t
    freePoints.push({ x: u ** 3 * a[0] + 3 * u * u * t * b[0] + 3 * u * t * t * c[0] + t ** 3 * d[0],
      y: u ** 3 * a[1] + 3 * u * u * t * b[1] + 3 * u * t * t * c[1] + t ** 3 * d[1] })
  }
}
freePoints.push(freePoints[0])
export function toolGuideFrame(mode, elapsed, reducedMotion = false) {
  const time = reducedMotion ? 2500 : Math.max(0, elapsed) % GUIDE_CYCLE_MS
  const t = clamp((time - 450) / 1550), progress = t * t * (3 - 2 * t)
  const done = time >= 2000, eraserY = 20 + 120 * progress
  const index = Math.floor(progress * (freePoints.length - 1))
  const cursor = mode === 'rectangle' ? { x: 40 + 235 * progress, y: 22 + 112 * progress }
    : mode === 'freeform' ? freePoints[index] : { x: 160, y: eraserY }
  return {
    cursor, cursorVisible: time >= 250 && !done, done,
    // 지름24 + 획 반지름3. 지우개의 원형 접촉과 같은 시점에 획을 지운다.
    hiddenStrokes: GUIDE_STROKES.map(points => mode === 'stroke' && points.some(p => Math.hypot(p.x - 160, Math.max(0, p.y - eraserY)) <= 15)),
    cut: mode === 'area' && progress > 0 ? `M160 20 L160 ${eraserY}` : '',
    selection: progress <= 0 ? '' : mode === 'rectangle'
      ? `M40 22 H${cursor.x} V${cursor.y} H40 Z`
      : `${pointsPath(freePoints.slice(0, index + 1))}${done ? ' Z' : ''}`,
  }
}
