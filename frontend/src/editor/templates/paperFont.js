// 속지 글꼴. 속지의 인쇄 글자(날짜 · 요일 · 이름표 · 플래너 숫자)는 모두 MaruBuri 글자 윤곽(path)이라 글꼴 파일을 쓰지 않는다.
// 속지 설정에서 글꼴을 고르면, 최종 SVG 의 글자 묶음(<g aria-label="글자"><path transform="translate(x y) scale(s -s)"/>…</g>)을
// 고른 글꼴의 윤곽으로 같은 크기 · 기준선 · 정렬로 다시 놓는다. 정적 속지 · 날짜 속지 · 플래너(바탕 · 덮개 · 내보내기)가 모두 같은 모양이라 한 곳에서 처리한다.
// 글자 윤곽 표는 scripts/generate-paper-fonts.py 로 만든다(paperFonts/). 표에 없는 글자나 알아볼 수 없는 묶음은 건드리지 않는다(MaruBuri 그대로).
import { getTemplate } from './catalog.js'
import MARU from './paperFonts/maruburi.js'
import nanumGothic from './paperFonts/nanum-gothic.js'
import nanumMyeongjo from './paperFonts/nanum-myeongjo.js'
import gowunBatang from './paperFonts/gowun-batang.js'
import gowunDodum from './paperFonts/gowun-dodum.js'
import nanumPen from './paperFonts/nanum-pen.js'
import poorStory from './paperFonts/poor-story.js'

/** 속지 글꼴 목록. 첫 번째가 원본(기본)이다. */
export const PAPER_FONTS = [
  { id: 'maruburi', label: '마루부리' },
  { id: 'nanum-gothic', label: '나눔고딕' },
  { id: 'nanum-myeongjo', label: '나눔명조' },
  { id: 'gowun-batang', label: '고운바탕' },
  { id: 'gowun-dodum', label: '고운돋움' },
  { id: 'nanum-pen', label: '나눔손글씨 펜' },
  { id: 'poor-story', label: '푸어스토리' },
]
export const DEFAULT_PAPER_FONT = PAPER_FONTS[0].id
const TABLES = { 'nanum-gothic': nanumGothic, 'nanum-myeongjo': nanumMyeongjo, 'gowun-batang': gowunBatang, 'gowun-dodum': gowunDodum, 'nanum-pen': nanumPen, 'poor-story': poorStory }

/** 글자가 인쇄되는 속지인가. 빈 종이와 노트(무지 · 줄 · 모눈 · 도트)에는 인쇄 글자가 없어 글꼴을 고를 일이 없다. */
export function paperPrintsText(assetId) {
  if (assetId == null) return false
  try { return getTemplate(assetId).type !== 'note' } catch { return false }
}

/** 바꿀 수 있는(원본이 아닌) 속지 글꼴 ID 인가 */
export const isPaperFontId = id => typeof id === 'string' && Object.hasOwn(TABLES, id)

// 굵은 글씨(B)가 없는 글꼴은 같은 색의 덧선(획 굵기 40/1000, 글꼴 배율을 나눈 값)으로 굵게 만든다.
const FAUX_BOLD = 40
// 한 줄로 이어 붙은 묶음으로 보는 간격(앞 묶음 끝과 다음 묶음 시작의 차) · 기준점을 둥근 자리로 알아보는 허용 오차
const JOIN = 0.05
const ROUND = 0.06
// 원본 윤곽과 확인표 윤곽 상자의 허용 차이(글자 하나당, 1000 단위)
const BOX_TOLERANCE = 3

// path(절대 좌표 M L Q C H V Z)의 점 · 조절점이 이루는 상자의 [가로, 세로] (scripts/generate-paper-fonts.py 의 box 와 같은 계산)
const TOKEN = /([MLQCHVZ])|(-?\d+(?:\.\d+)?)/g
const ARGS = { M: 2, L: 2, Q: 4, C: 6, H: 1, V: 1 }
function boxOf(path) {
  const tokens = [...path.matchAll(TOKEN)]
  let min = [Infinity, Infinity], max = [-Infinity, -Infinity], command = null
  for (let i = 0; i < tokens.length;) {
    if (tokens[i][1]) { command = tokens[i][1]; i++; continue }
    const count = ARGS[command]
    for (let k = 0; k < count; k++) {
      const value = Number(tokens[i + k][2]), axis = command === 'H' ? 0 : command === 'V' ? 1 : k % 2
      min[axis] = Math.min(min[axis], value); max[axis] = Math.max(max[axis], value)
    }
    i += count
  }
  return Number.isFinite(min[0]) && Number.isFinite(min[1]) ? [max[0] - min[0], max[1] - min[1]] : [0, 0]
}
const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const attr = (text, name) => text.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null
const round3 = value => Math.round(value * 1000) / 1000

const GROUP = /<g\b([^>]*)>((?:\s*<path\b[^>]*\/>)+)\s*<\/g>/g
const PATH = /<path\b([^>]*)\/>/g
const TRANSFORM = /translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)\s*scale\(\s*([-\d.eE+]+)/

/** 글자 묶음 하나를 읽는다. 읽을 수 없으면(글자 수 · 모양이 맞지 않음) null. */
function readGroup(match) {
  const [, attrs, body] = match
  const label = attr(attrs, 'aria-label')
  if (label == null) return null
  const text = [...unescapeXml(label)]
  const shown = text.filter(ch => ch !== ' ')
  const paths = [...body.matchAll(PATH)].map(item => {
    const d = attr(item[1], 'd'), t = attr(item[1], 'transform')?.match(TRANSFORM)
    return d && t ? { d, x: Number(t[1]), y: Number(t[2]), s: Number(t[3]) } : null
  })
  if (!shown.length || paths.length !== shown.length || paths.some(path => !path) || shown.some(ch => !MARU[ch])) return null
  // 굵기: 글자 윤곽 상자 크기가 Regular 와 Bold 중 어느 쪽에 맞는지(묶음 전체의 합). 어느 쪽에도 맞지 않으면 건드리지 않는다.
  let regular = 0, bold = 0
  paths.forEach((path, i) => {
    const [width, height] = boxOf(path.d), ref = MARU[shown[i]]
    regular += Math.abs(width - ref[1]) + Math.abs(height - ref[2]); bold += Math.abs(width - ref[4]) + Math.abs(height - ref[5])
  })
  if (Math.min(regular, bold) > BOX_TOLERANCE * paths.length) return null
  const weight = regular <= bold ? 'R' : 'B'
  const w = weight === 'R' ? 0 : 3, s = paths[0].s
  if (!(s > 0) || paths.some(path => path.s !== s || path.y !== paths[0].y)) return null
  const trailing = text.join('').match(/ *$/)[0].length
  const last = paths[paths.length - 1]
  // 원래 끝 자리: 마지막 글자 폭 + 뒤에 붙은 공백
  const end = last.x + (MARU[shown[shown.length - 1]][w] + trailing * MARU[' '][w]) * s
  return { index: match.index, length: match[0].length, attrs, text, weight, s, x: paths[0].x, y: paths[0].y, end }
}

// 한 줄(이어 붙은 묶음들)의 시작 · 가운데 · 끝 자리
const edges = line => { const a = line[0].x, b = line[line.length - 1].end; return { start: a, middle: (a + b) / 2, end: b } }
const grid = value => Math.abs(value * 2 - Math.round(value * 2)) / 2
const TYPES = ['start', 'middle', 'end']

/**
 * 한 줄의 기준점: 시작 · 가운데 · 끝 중 같은 기준선의 이웃 줄들까지 합쳐 둥근 자리(0.5 단위)가 가장 많이 나오는 것.
 * (요일 이름처럼 오른쪽 끝이 칸 가장자리에 맞은 줄은 이웃 모두 끝이 둥글고, 가운데가 둥근 건 우연이다.) 비기면 시작 → 가운데 → 끝 순.
 */
function anchorOf(line, lines) {
  const row = lines.filter(other => Math.abs(other[0].y - line[0].y) < 0.02 && other[0].s === line[0].s)
  const votes = Object.fromEntries(TYPES.map(type => [type, row.filter(other => grid(edges(other)[type]) <= ROUND).length]))
  const best = TYPES.reduce((pick, type) => votes[type] > votes[pick] ? type : pick)
  if (votes[best] > 0) return best
  return 'start'
}

function layout(line, font, lines) {
  const a = line[0].x, b = line[line.length - 1].end
  const anchor = anchorOf(line, lines)
  const parts = line.map(group => {
    const k = group.s * font.size // 글자 윤곽은 1000 단위라 원본 scale(예: 0.014)이 이미 화면 크기에 맞는 배율이다
    const table = group.weight === 'B' && font.B ? font.B : font.R
    const glyphs = group.text.map(ch => table[ch])
    return { group, k, glyphs, width: glyphs.reduce((sum, glyph) => sum + glyph[0], 0) * k, bold: group.weight === 'B' && !font.B }
  })
  const total = parts.reduce((sum, part) => sum + part.width, 0)
  let cursor = anchor === 'end' ? b - total : anchor === 'middle' ? (a + b) / 2 - total / 2 : a
  return parts.map(({ group, k, glyphs, bold }) => {
    let paths = ''
    const scale = Number(k.toPrecision(6))
    group.text.forEach((ch, i) => {
      const [advance, d] = glyphs[i]
      if (ch !== ' ' && d) paths += `<path d="${d}" transform="translate(${round3(cursor)} ${round3(group.y)}) scale(${scale} ${-scale})"/>`
      cursor += advance * k
    })
    const fill = attr(group.attrs, 'fill')
    const extra = bold && fill && !/\bstroke=/.test(group.attrs) ? ` stroke="${fill}" stroke-width="${Number((FAUX_BOLD / font.size).toFixed(1))}" stroke-linejoin="round"` : ''
    return `<g${group.attrs}${extra}>${paths}</g>`
  })
}

/**
 * 속지 SVG 문자열의 글자 묶음을 fontId 글꼴의 윤곽으로 다시 놓은 문자열. 원본 글꼴(또는 모르는 글꼴)이면 그대로 돌려준다.
 * 크기(scale) · 기준선(y) · 색은 원본 그대로이고, 가로 자리는 원래 기준점(시작 · 가운데 · 끝)을 지킨다. 이어 붙은 묶음(예: 큰 숫자 + 작은 단위)은 한 줄로 다시 놓는다.
 */
export function swapPaperFont(xml, fontId) {
  const font = TABLES[fontId]
  if (!font || typeof xml !== 'string' || !xml.includes('aria-label')) return xml
  const groups = [...xml.matchAll(GROUP)].map(readGroup)
  // 묶음 사이에 공백만 있고 앞 묶음 끝에서 다음 묶음이 바로 시작하면 한 줄
  const lines = []
  groups.forEach((group, i) => {
    if (!group) return
    const previous = lines[lines.length - 1], before = previous?.[previous.length - 1]
    if (before && groups[i - 1] === before && !xml.slice(before.index + before.length, group.index).trim() && Math.abs(group.y - before.y) < 0.02 && Math.abs(group.x - before.end) < JOIN) previous.push(group)
    else lines.push([group])
  })
  let out = '', at = 0
  for (const line of lines) {
    // 글꼴에 없는 글자가 한 묶음이라도 있으면 그 줄은 원본 그대로 둔다(한 줄에 두 글꼴이 섞이지 않게)
    if (line.some(group => group.text.some(ch => !font.R[ch] || (group.weight === 'B' && font.B && !font.B[ch])))) continue
    const first = line[0], last = line[line.length - 1]
    out += xml.slice(at, first.index) + layout(line, font, lines).join('')
    at = last.index + last.length
  }
  return out + xml.slice(at)
}
