// 잉크병 **윤곽**을 앱이 쓸 수 있는 다각형으로 뽑는다. 실행: node scripts/generate-ink-record-bottles.mjs
//
// 왜 뽑아 두는가: 병 안을 칠했는지 보려면 앱에도 병 모양이 있어야 한다(사용자 2026-11-11:
// "네모 영역 말고 병 윤곽 따서 그 안이면 칠했다고 판정하자"). 그렇다고 그리는 코드를 앱으로
// 가져오면 두 벌이 되어 어긋나므로, **그리는 그 코드에서** 다각형을 뽑아 한 파일로 적어 둔다.
// (검사 tests/ink-record.test.js 가 적힌 값과 지금 뽑은 값이 같은지 지킨다.)
//
// 어떻게: 병은 조각(parts) 여러 개로 그려진다. 조각마다 끝을 이어 닫으면 **그 조각이 덮는 자리**가
// 되고, 그것들을 다 합치면 병이 덮는 자리다. 조각 하나하나를 닫는 것이라 조각이 늘어도 그대로 된다.
import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { square, circle, BASE } from './inkRecord/bottleShape.mjs'

const BUILDS = { round: P => circle(P, P.s * 98 / BASE.s), square: P => square(P) }
const SEG = 16   // 굽은 곳 한 번을 몇 조각으로 펼 것인가

const num = /[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g

/** 타원 위의 점. 각 t 는 라디안. */
const onEllipse = (cx, cy, rx, ry, t) => ({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) })

/** SVG 호(끝점 방식) → 가운데 방식. 기울기는 0 만 쓰므로 받지 않는다. */
function arcPoints(from, rx, ry, large, sweep, to) {
  rx = Math.abs(rx); ry = Math.abs(ry)
  if (!rx || !ry) return [to]
  const dx = (from.x - to.x) / 2, dy = (from.y - to.y) / 2
  const check = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)
  if (check > 1) { const k = Math.sqrt(check); rx *= k; ry *= k }
  const denom = rx * rx * dy * dy + ry * ry * dx * dx
  const top = rx * rx * ry * ry - denom
  const coef = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, top / denom))
  const cxp = coef * rx * dy / ry, cyp = -coef * ry * dx / rx
  const cx = cxp + (from.x + to.x) / 2, cy = cyp + (from.y + to.y) / 2
  const t0 = Math.atan2((dy - cyp) / ry, (dx - cxp) / rx)
  const t1 = Math.atan2((-dy - cyp) / ry, (-dx - cxp) / rx)
  let sweepAngle = t1 - t0
  if (sweep && sweepAngle < 0) sweepAngle += 2 * Math.PI
  if (!sweep && sweepAngle > 0) sweepAngle -= 2 * Math.PI
  return Array.from({ length: SEG }, (_, i) => onEllipse(cx, cy, rx, ry, t0 + sweepAngle * (i + 1) / SEG))
}

/** d 속성 한 줄 → 점들. 쓰는 명령은 M · L · Q · A 뿐이다(bottleShape.mjs). */
function flattenPath(d) {
  const tokens = d.match(/[MLQA][^MLQA]*/g) ?? []
  const points = []
  let at = { x: 0, y: 0 }
  for (const token of tokens) {
    const cmd = token[0]
    const v = (token.slice(1).match(num) ?? []).map(Number)
    if (cmd === 'M') { at = { x: v[0], y: v[1] }; points.push(at) }
    else if (cmd === 'L') { at = { x: v[0], y: v[1] }; points.push(at) }
    else if (cmd === 'Q') {
      const c = { x: v[0], y: v[1] }, to = { x: v[2], y: v[3] }
      for (let i = 1; i <= SEG; i++) {
        const t = i / SEG, u = 1 - t
        points.push({ x: u * u * at.x + 2 * u * t * c.x + t * t * to.x, y: u * u * at.y + 2 * u * t * c.y + t * t * to.y })
      }
      at = to
    } else if (cmd === 'A') {
      const to = { x: v[5], y: v[6] }
      points.push(...arcPoints(at, v[0], v[1], v[3], v[4], to))
      at = to
    }
  }
  return points
}

/** <ellipse …/> → 점들 */
const flattenEllipse = (tag) => {
  const [cx, cy, rx, ry] = ['cx', 'cy', 'rx', 'ry'].map(k => Number(tag.match(new RegExp(`${k}="(${num.source})"`))[1]))
  return Array.from({ length: SEG * 2 }, (_, i) => onEllipse(cx, cy, rx, ry, 2 * Math.PI * i / (SEG * 2)))
}

const flattenPart = (tag) => tag.startsWith('<ellipse')
  ? flattenEllipse(tag)
  : flattenPath(tag.match(/ d="([^"]*)"/)[1])

const r4 = v => Number(v.toFixed(4))

function shapeOutline(build) {
  const art = build(BASE)
  const { x0, y0, y1 } = art.box
  const h = y1 - y0
  const norm = p => [r4((p.x - x0) / h), r4((p.y - y0) / h)]
  // 덮는 자리는 bottleShape.mjs 가 solid 로 내놓는다 — 그리는 조각(parts)과 달리 닫혀 있다.
  const polygons = art.solid.map(flattenPart).filter(pts => pts.length >= 3).map(pts => pts.flatMap(norm))
  return { width: r4((art.box.x1 - x0) / h), polygons }
}

const out = Object.fromEntries(Object.entries(BUILDS).map(([shape, build]) => [shape, shapeOutline(build)]))
const body = Object.entries(out).map(([shape, { width, polygons }]) =>
  `  ${shape}: {\n    width: ${width},\n    polygons: [\n${polygons.map(p => `      [${p.join(',')}],`).join('\n')}\n    ],\n  },`).join('\n')

// 적을 곳을 인자로 받는다 — 검사는 임시 파일에 적어 두고 지금 파일과 견준다(진짜 파일을 덮어쓰지 않게)
const target = process.argv[2] ? pathToFileURL(process.argv[2]) : new URL('../src/editor/templates/inkRecordBottles.js', import.meta.url)
writeFileSync(target, `\
// 생성한 파일 — 고치지 말 것. 만드는 곳: scripts/generate-ink-record-bottles.mjs
//
// 잉크병이 덮는 자리. 병 **높이를 1** 로 본 좌표이고, 원점은 병을 감싸는 네모의 왼쪽 위다.
// 조각(뚜껑 · 목 · 몸통 …)마다 다각형 하나 — 그 중 하나에라도 들면 병 안이다.
export const INK_RECORD_BOTTLES = {
${body}
}
`)
console.log('저장:', target.pathname,
  Object.entries(out).map(([k, v]) => `${k} ${v.polygons.length}조각 ${v.polygons.reduce((s, p) => s + p.length / 2, 0)}점`).join(' · '))
