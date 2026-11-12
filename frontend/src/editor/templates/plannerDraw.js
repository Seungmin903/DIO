// 인터랙션 속지(스터디 플래너 · 데일리 플래너)가 함께 쓰는 SVG 그리기 · 획 판정 도구.
// 다른 속지와 같은 양식 — 네모 테두리 · 회색 선 · MaruBuri 윤곽 글자. 글자 윤곽은 studyPlannerGlyphs.js (docs/스터디 플래너 속지/스크립트/글자.py 로 만든다).
import { GLYPHS } from './studyPlannerGlyphs.js'

// 다른 속지와 같은 6색 팔레트라 속지 옵션의 레이아웃 색이 그대로 먹는다(appearance.js).
export const TEXT = '#292929', LABEL = '#666666', LINE = '#d7d9dc', LINE_SOFT = '#e8e9eb'

// 반투명 색을 흰 바탕에 올린 것과 같은 불투명 색
export const onWhite = (hex, alpha) => '#' + [1, 3, 5].map(i => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * alpha).toString(16).padStart(2, '0')).join('').toUpperCase()
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const n = v => Math.round(v * 100) / 100
export const rect = (x, y, w, h, a = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" ${a}/>`
export const box = (R, stroke = LINE) => rect(R.x, R.y, R.w, R.h, `fill="none" stroke="${stroke}" stroke-width="1"`)
export const line = (x1, y1, x2, y2, stroke = LINE_SOFT, dash = '') => `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" fill="none" stroke="${stroke}" stroke-width="1"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`
export const checkPath = (cx, cy, s) => `M${n(cx - s * .42)} ${n(cy + s * .02)} L${n(cx - s * .1)} ${n(cy + s * .34)} L${n(cx + s * .48)} ${n(cy - s * .38)}`
export const svgOpen = L => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${L.w} ${L.h}" width="${L.w}" height="${L.h}">`

// 글자: 다른 속지처럼 글자마다 윤곽 path 를 놓는다(기기에 폰트가 없어도 같은 모양).
function glyph(ch, weight) {
  const g = GLYPHS[weight][ch]
  if (!g) throw new Error(`플래너 글자 윤곽 없음: "${ch}" (${weight}) — docs/스터디 플래너 속지/스크립트/글자.py`)
  return g
}
export const textWidth = (s, size, weight = 'R') => [...String(s)].reduce((sum, ch) => sum + glyph(ch, weight)[0], 0) * size / 1000
/** runs: [{ s, size, weight?, fill? }] 를 이어 쓴다. anchor: 'start' | 'middle' | 'end' */
export function write(x, y, runs, anchor = 'start') {
  const list = Array.isArray(runs) ? runs : [runs]
  const width = list.reduce((sum, r) => sum + textWidth(r.s, r.size, r.weight), 0)
  let cx = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x
  return list.map(({ s, size, weight = 'R', fill = LABEL }) => {
    const k = size / 1000
    let paths = '', from = null, to = null
    for (const ch of String(s)) {
      const [adv, d] = glyph(ch, weight)
      if (d) {
        if (from === null) from = cx
        paths += `<path d="${d}" transform="translate(${n(cx)} ${n(y)}) scale(${k} ${-k})"/>`
        to = cx + adv * k
      }
      cx += adv * k
    }
    // 글꼴을 바꿀 때 쓰는 치수를 묶음에 적어 둔다 — 적어 두면 원본 글꼴 확인표가 없어도 된다
    // (paperFont.js readGroup). data-adv 는 보이는 글자가 차지하는 폭, data-w 는 굵은 글씨 표시.
    const metrics = from === null ? '' : ` data-adv="${n(to - from)}"${weight === 'B' ? ' data-w="B"' : ''}`
    return `<g fill="${fill}" aria-label="${esc(s)}"${metrics}>${paths}</g>`
  }).join('')
}
export const label = (x, y, s, size = 14) => write(x, y, { s, size })
/** 이름표가 있는 줄 공책 칸 (메모 · 오늘 돌아보기) */
export function ruled(R, name) {
  let s = box(R) + label(R.x + 12, R.y + 26, name)
  for (let y = R.y + 58; y < R.y + R.h - 8; y += 28) s += line(R.x + 12, y, R.x + R.w - 12, y)
  return s
}

// ---------- 획 판정 ----------
/** 점 사이를 step 간격으로 채워 빠르게 그어도 칸이 빠지지 않게 한다. */
export function sample(points, step = 3) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[i + 1] ?? a, n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n })
  }
  return out
}
/** 첫 점에서 가장 멀리 간 거리. 톡(탭)인지 그은 것인지 가른다. */
export const span = points => points.reduce((m, p) => Math.max(m, Math.hypot(p.x - points[0].x, p.y - points[0].y)), 0)
/** 원 목록 [{ cx, cy, r }] 에서 점이 닿은 원의 번호(없으면 -1). 손가락 끝만큼 넉넉하게 본다. */
export const hitCircle = (list, p) => list.findIndex(c => Math.hypot(p.x - c.cx, p.y - c.cy) <= c.r + 6)
