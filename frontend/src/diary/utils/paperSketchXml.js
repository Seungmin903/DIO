import { PAPER_SKETCHES } from './paperSketches.js'

// 속지 대표 그림의 SVG 를 기기 픽셀 단위로 만든다(PaperSketch 가 쓴다. 규칙은 그쪽 머리말)
// 색 · 막대 값은 코덱스 검수(2026-11-02): 옅은 색(#d7d9dc)은 글 쓰는 줄 · 작은 글자에만, 구조선은 한 단계 진하게.
// 3px 안으로 붙은 평행선은 하나만 남기고(작은 칸에서 표가 얼룩지지 않게), 폭 3px 이하 작은 글자 막대는 뺀다.
const MIN_GAP = 3
const LINE = { f: '#bfc1c4', b: '#bfc1c4', s: '#aeb3b8', i: '#aeb3b8' }
const RULE = { ...LINE, f: '#d7d9dc' }
const BAR = { t: '#666666', l: '#d7d9dc' }

export function sketchXml(sketchKey, pageWidth, pageHeight, width, height) {
  const sketch = PAPER_SKETCHES[sketchKey]
  const k = width / pageWidth
  const P = v => Math.round(v * k)
  const at = (v, max) => Math.min(max - 1, Math.max(0, Math.floor(v * k)))
  const out = []
  const drawn = { h: [], v: [] }
  const rect = (x, y, w, h, color) => { if (w > 0 && h > 0) out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"/>`) }
  // 같은 방향 선이 이미 MIN_GAP 안쪽에 겹쳐 있으면 그리지 않는다(진한 틀은 늘 그린다)
  const line = (axis, pos, from, to, color, always = false) => {
    const near = drawn[axis].some(([p, a, b]) => Math.abs(p - pos) < MIN_GAP && Math.min(b, to) - Math.max(a, from) >= Math.min(b - a, to - from) / 2)
    if (near && !always) return
    drawn[axis].push([pos, from, to])
    if (axis === 'h') rect(from, pos, Math.max(1, to - from), 1, color)
    else rect(pos, from, 1, Math.max(1, to - from), color)
  }
  // 자리 · 양 끝을 모두 같은 내림 규칙으로 옮겨 모서리가 1px 도 어긋나거나 삐져나오지 않게 한다
  const hline = (x1, x2, y, color, always) => line('h', at(y, height), at(x1, width), at(x2, width) + 1, color, always)
  const vline = (x, y1, y2, color, always) => line('v', at(x, width), at(y1, height), at(y2, height) + 1, color, always)
  const box = (x, y, w, h, color, always) => { hline(x, x + w, y, color, always); hline(x, x + w, y + h, color, always); vline(x, y, y + h, color, always); vline(x + w, y, y + h, color, always) }
  // 큰 칸 테두리 → 진한 선 → 기본 선 → 반복 줄 순으로 그려, 붙은 선이 겹치면 앞의 것이 남는다
  for (const [x, y, w, h, tone] of sketch.rects) box(x, y, w, h, LINE[tone], tone === 's')
  const order = { s: 0, i: 1, b: 2, f: 3 }
  for (const [x1, y1, x2, y2, tone] of [...sketch.lines].sort((m, n) => order[m[4]] - order[n[4]])) (y1 === y2 ? hline(x1, x2, y1, LINE[tone]) : vline(x1, y1, y2, LINE[tone]))
  for (const [axis, a, b, start, step, count, tone] of sketch.rules) {
    const gap = step * k
    // 옅은 결 무늬(칸 안 모눈)는 뺀다. 페이지 폭의 1/4 넘는 옅은 가로줄(글 쓰는 줄)만 남긴다
    const long = axis === 'h' && b - a >= pageWidth / 4
    if (gap < MIN_GAP && tone === 'f' && !long) continue
    // 개수가 적은 칸 나눔(달력 7칸 등)은 칸 수가 바뀌면 안 되니 제자리에 그린다. 많으면 간격을 정수로 맞춰 줄마다 고르게
    const s = count <= 8 ? gap : Math.max(long && tone === 'f' ? MIN_GAP + 1 : MIN_GAP, Math.round(gap)), base = start * k
    const n = count <= 8 ? count : Math.floor(((count - 1) * gap) / s + 1e-6) + 1
    for (let i = 0; i < n; i += 1) {
      const pos = Math.floor(base + i * s)
      if (axis === 'h') line('h', Math.min(height - 1, pos), at(a, width), at(b, width) + 1, RULE[tone])
      else line('v', Math.min(width - 1, pos), at(a, height), at(b, height) + 1, RULE[tone])
    }
  }
  for (const [x, y, w, h, tone] of sketch.boxes) if (w * k >= MIN_GAP) box(x, y, w, h, LINE[tone], true)
  for (const [x, y, w, h, tone] of sketch.bars) {
    const barW = P(x + w) - P(x)
    if (barW < 2 || tone === 'l' && barW <= 3) continue
    const barH = tone === 't' ? Math.max(2, Math.round(h * k * 0.75)) : Math.max(1, Math.round(h * k * 0.5))
    rect(P(x), Math.round((y + h / 2) * k - barH / 2), barW, barH, BAR[tone])
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">${out.join('')}</svg>`
}
