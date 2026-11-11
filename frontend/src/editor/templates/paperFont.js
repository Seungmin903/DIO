// 속지 글꼴. 속지의 인쇄 글자(날짜 · 요일 · 이름표 · 플래너 숫자)는 원본(MaruBuri) 글자 윤곽(path)이라
// 글꼴 파일 없이도 곧바로 그려진다. 속지 설정에서 다른 글꼴을 고르면, 그 글자 묶음
// (<g aria-label="글자"><path transform="translate(x y) scale(s -s)"/>…</g>)을 **진짜 글꼴로 쓴 <text>** 로 바꾼다.
// 정적 속지 · 날짜 속지 · 플래너(바탕 · 덮개 · 내보내기)가 모두 같은 모양이라 한 곳에서 처리한다.
//
// 2026-11-11 이전에는 글꼴마다 글자 윤곽 표(1.8MB)를 떠 두고 바꿔 끼웠다. 그러면 표에 없는 글자 ·
// 표를 안 뜬 글꼴이 그대로 남아, 글자나 글꼴을 더할 때마다 표를 다시 뽑아야 했다. 지금은 글꼴 이름만
// 넘기므로 글자가 늘든 글꼴이 늘든 저절로 따라온다(paperTextFont.js).
//
// 남은 표 하나(paperFonts/maruburi.js, 7KB)는 **원본 글꼴의 치수**다. SVG 에는 글자 윤곽만 있고
// 글자 폭이 적혀 있지 않아서, 묶음이 차지한 폭(textLength)과 굵기(Regular · Bold)를 여기서 읽는다.
// 속지에 새 글자가 들어오면 scripts/generate-paper-fonts.py 를 다시 돌려야 하고,
// tests/paper-font-coverage.test.js 가 빠진 글자를 먼저 잡는다.
import { getTemplate } from './catalog.js'
import MARU from './paperFonts/maruburi.js'
import { textFromGroup, paperFontFamily } from './paperTextFont.js'

/** 속지 글꼴 목록. 첫 번째가 원본(기본)이다. 글꼴 이름은 앱 글꼴 목록에서 온다(paperTextFont.js). */
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

/** 글자가 인쇄되는 속지인가. 빈 종이와 노트(무지 · 줄 · 모눈 · 도트)에는 인쇄 글자가 없어 글꼴을 고를 일이 없다. */
export function paperPrintsText(assetId) {
  if (assetId == null) return false
  try { return getTemplate(assetId).type !== 'note' } catch { return false }
}

/** 바꿀 수 있는(원본이 아닌) 속지 글꼴 ID 인가 */
export const isPaperFontId = id => typeof id === 'string' && id !== DEFAULT_PAPER_FONT
  && PAPER_FONTS.some(font => font.id === id) && Boolean(paperFontFamily(id))

/** 속지가 그리려면 기기에 있어야 하는 글꼴 id. 고른 글꼴이 없으면 원본 윤곽이라 아무것도 필요 없다. */
export const paperFontIdsToLoad = (fontId) => isPaperFontId(fontId) ? [fontId] : []

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

const GROUP = /<g\b([^>]*)>((?:\s*<path\b[^>]*\/>)+)\s*<\/g>/g
const PATH = /<path\b([^>]*)\/>/g
const TRANSFORM = /translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)\s*scale\(\s*([-\d.eE+]+)/

/**
 * 글자 묶음 하나를 읽는다. 읽을 수 없으면(글자 수 · 모양이 맞지 않음) null.
 * end 는 **보이는 마지막 글자가 끝나는 자리**다 — 뒤에 붙은 공백은 폭에 넣지 않는다(textLength 가 보이는 글자의 폭이라).
 */
export function readGroup(match) {
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
  const last = paths[paths.length - 1]
  const end = last.x + MARU[shown[shown.length - 1]][w] * s
  return { index: match.index, length: match[0].length, attrs, text, weight, s, x: paths[0].x, y: paths[0].y, end }
}

/**
 * 속지 SVG 문자열의 글자 묶음을 fontId 글꼴로 쓴 <text> 로 바꾼 문자열.
 * 원본 글꼴(또는 모르는 글꼴)이면 그대로 돌려준다.
 *
 * 크기(글자 크기) · 기준선(y) · 시작 자리(x) · 색은 원본 그대로이고, 차지하는 폭도 textLength 로 묶어
 * 원본과 같다. 읽을 수 없는 묶음은 손대지 않아 원본 윤곽(MaruBuri)으로 남는다.
 */
export function swapPaperFont(xml, fontId) {
  if (!isPaperFontId(fontId) || typeof xml !== 'string' || !xml.includes('aria-label')) return xml
  let out = '', at = 0
  for (const match of xml.matchAll(GROUP)) {
    const group = readGroup(match)
    if (!group) continue
    const text = textFromGroup(group, fontId)
    if (!text) continue
    out += xml.slice(at, group.index) + text
    at = group.index + group.length
  }
  return out + xml.slice(at)
}
