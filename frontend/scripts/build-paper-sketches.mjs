// 속지 고르기 칸의 '대표 그림' 자료를 실제 속지 SVG 에서 뽑는다 → src/diary/utils/paperSketches.js
// 실행: node scripts/build-paper-sketches.mjs (frontend/). 속지 양식을 바꾸면 다시 실행한다.
// 뽑는 것: 긴 선(가로 · 세로) · 큰 칸(테두리 상자) · 글자 자리(글자 윤곽 대신 막대) · 같은 간격으로 반복되는 선(줄 · 모눈, 한 묶음으로).
// 버리는 것: 글자 모양 · 하트 같은 작은 장식 · 바탕 사각형.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const templates = path.join(root, 'assets/templates')
const load = file => fs.readFileSync(path.join(templates, file), 'utf8')
const day = await import(pathToFileURL(path.join(root, 'src/editor/templates/dayPlanner.js')))
const study = await import(pathToFileURL(path.join(root, 'src/editor/templates/studyPlanner.js')))
const route = await import(pathToFileURL(path.join(root, 'src/editor/templates/routePaper.js')))
const inkRecord = await import(pathToFileURL(path.join(root, 'src/editor/templates/inkRecordLayout.js')))

const withBottles = (xml, orientation, shape) => xml.replace('</svg>',
  inkRecord.inkRecordLayout(inkRecord.inkRecordId(shape, orientation)).cells
    .map(cell => `<rect x="${cell.bottle.x}" y="${cell.bottle.y}" width="${cell.bottle.w}" height="${cell.bottle.h}" fill="none" stroke="#bfc1c4" />`)
    .join('') + '</svg>')

const SOURCES = {
  cover: o => load(`undated/undated-cover-${o}.svg`),
  divider: o => load(`undated/undated-divider-${o}.svg`),
  monthly: o => load(`undated/undated-monthly-${o}.svg`),
  'weekly-blocks': o => load(`undated/undated-weekly-blocks-${o}.svg`),
  'weekly-journal': o => load(`undated/undated-weekly-journal-${o}.svg`),
  day: o => day.dayPlannerBaseSvg(o),
  study: o => study.plannerBaseSvg(o),
  route: o => route.routePaperSketchSvg(o),
  diary: o => load(`2026/SVG/2026-reusable-diary-${o}.svg`),
  scrap: o => load(`2026/SVG/2026-reusable-scrap-${o}.svg`),
  // 잉크병은 윤곽(path · ellipse)이라 아래 extract 가 못 읽는다. 칸마다 병이 앉는 자리를 네모로 덧붙여
  // 대표 그림에 '칸마다 병 하나'가 드러나게 한다(이 크기에서는 둥근 · 각진 차이는 어차피 안 보인다).
  'ink-record-round': o => withBottles(load(`2026/SVG/2026-reusable-ink-record-round-${o}.svg`), o, 'round'),
  'ink-record-square': o => withBottles(load(`2026/SVG/2026-reusable-ink-record-square-${o}.svg`), o, 'square'),
}
// 선 색 → 굵기 단계. f 옅은 선(줄 · 모눈) · b 기본 선 · s 진한 틀 · i 글자색(체크 상자)
const TONE = { '#e8e9eb': 'f', '#d7d9dc': 'b', '#bfc1c4': 'b', '#aeb3b8': 's', '#666666': 'i', '#292929': 'i' }
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]))
const r1 = v => Math.round(v * 10) / 10

function extract(xml) {
  const lines = [], rects = [], boxes = [], glyphs = []
  for (const [tag] of xml.matchAll(/<line\b[^>]*>/g)) {
    const a = attrs(tag), tone = TONE[(a.stroke ?? '').toLowerCase()]
    if (!tone) continue
    const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map(k => Number(a[k]))
    if (y1 === y2 || x1 === x2) lines.push({ x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2), tone })
  }
  for (const [tag] of xml.matchAll(/<rect\b[^>]*>/g)) {
    const a = attrs(tag), tone = TONE[(a.stroke ?? '').toLowerCase()]
    if (!tone || a.fill && a.fill !== 'none') continue
    const box = [Number(a.x ?? 0), Number(a.y ?? 0), Number(a.width), Number(a.height)].map(r1)
    if (box[2] >= 24 && box[3] >= 24) rects.push([...box, tone])
    else boxes.push([...box, tone])
  }
  // 글자: 글자 하나가 translate(x 기준선) scale(s -s) 로 놓인 윤곽이다. 같은 줄에 붙은 글자를 한 막대로 모은다
  for (const [tag] of xml.matchAll(/<path\b[^>]*transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+) [-\d.]+\)"[^>]*>/g)) {
    const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)/.exec(tag)
    glyphs.push({ x: Number(m[1]), y: Number(m[2]), s: Number(m[3]) })
  }
  glyphs.sort((a, b) => a.y - b.y || a.s - b.s || a.x - b.x)
  const bars = []
  for (const g of glyphs) {
    const em = g.s * 1000, last = bars[bars.length - 1]
    if (last && last.y === g.y && last.s === g.s && g.x - last.end < em * 0.8) last.end = g.x + em * 0.9
    else bars.push({ x: g.x, y: g.y, s: g.s, end: g.x + em * 0.9 })
  }
  return { lines, rects, boxes, bars: bars.map(b => [r1(b.x), r1(b.y - b.s * 720), r1(b.end - b.x), r1(b.s * 720), b.s >= 0.024 ? 't' : 'l']), }
}

// 같은 길이 · 색의 평행선이 같은 간격으로 3개 넘게 이어지면 한 묶음(줄 · 모눈)으로 바꾼다: [축, 시작, 끝, 첫 자리, 간격, 개수, 색]
function rules(lines) {
  const groups = new Map(), rest = []
  for (const l of lines) {
    const axis = l.y1 === l.y2 ? 'h' : 'v'
    const key = axis === 'h' ? `h|${l.x1}|${l.x2}|${l.tone}` : `v|${l.y1}|${l.y2}|${l.tone}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(axis === 'h' ? l.y1 : l.x1)
  }
  const out = []
  for (const [key, list] of groups) {
    const [axis, a, b, tone] = key.split('|')
    const at = [...new Set(list)].sort((m, n) => m - n)
    let i = 0
    while (i < at.length) {
      let j = i + 1
      const step = at[i + 1] - at[i]
      while (j < at.length && Math.abs(at[j] - at[j - 1] - step) < 0.6) j += 1
      if (j - i >= 3) { out.push([axis, Number(a), Number(b), r1(at[i]), r1((at[j - 1] - at[i]) / (j - i - 1)), j - i, tone]); i = j }
      else { rest.push(axis === 'h' ? [Number(a), at[i], Number(b), at[i], tone] : [at[i], Number(a), at[i], Number(b), tone]); i += 1 }
    }
  }
  return { rules: out, lines: rest.map(l => l.map(v => (typeof v === 'number' ? r1(v) : v))) }
}

const result = {}
for (const [id, source] of Object.entries(SOURCES)) {
  for (const o of ['landscape', 'portrait']) {
    const { lines, rects, boxes, bars } = extract(source(o))
    // 짧은 선(글자 밑 빈칸 표시 등 64 미만)은 막대 · 칸과 겹쳐 지저분해서 버린다
    const long = lines.filter(l => l.x2 - l.x1 + l.y2 - l.y1 >= 64 || l.tone === 'f')
    result[`${id}-${o}`] = { ...rules(long), rects, boxes, bars }
  }
}
const body = `// 자동 생성 파일: scripts/build-paper-sketches.mjs 가 실제 속지 SVG 에서 뽑았다. 손으로 고치지 말고 다시 실행한다.
// 속지 단위 좌표. lines [x1, y1, x2, y2, 색] · rules [축, 시작, 끝, 첫 자리, 간격, 개수, 색] · rects/boxes [x, y, 폭, 높이, 색] · bars [x, y, 폭, 높이, t 제목 | l 글자]
// 색: f 옅은 선 · b 기본 선 · s 진한 틀 · i 글자색
export const PAPER_SKETCHES = ${JSON.stringify(result)}
`
fs.writeFileSync(path.join(root, 'src/diary/utils/paperSketches.js'), body)
console.log(Object.entries(result).map(([k, v]) => `${k}: lines ${v.lines.length} rules ${v.rules.length} rects ${v.rects.length} boxes ${v.boxes.length} bars ${v.bars.length}`).join('\n'))
