// 속지 글꼴. 속지의 인쇄 글자(날짜 · 요일 · 이름표 · 플래너 숫자)는 원본(MaruBuri) 글자 윤곽(path)이라
// 글꼴 파일 없이도 곧바로 그려진다. 속지 설정에서 다른 글꼴을 고르면, 그 글자 묶음
// (<g aria-label="글자"><path transform="translate(x y) scale(s -s)"/>…</g>)을 **진짜 글꼴로 쓴 <text>** 로 바꾼다.
// 정적 속지 · 날짜 속지 · 플래너(바탕 · 덮개 · 내보내기)가 모두 같은 모양이라 한 곳에서 처리한다.
//
// 2026-11-11 이전에는 글꼴마다 글자 윤곽 표(1.8MB)를 떠 두고 바꿔 끼웠다. 그러면 표에 없는 글자 ·
// 표를 안 뜬 글꼴이 그대로 남아, 글자나 글꼴을 더할 때마다 표를 다시 뽑아야 했다. 지금은 글꼴 이름만
// 넘기므로 글자가 늘든 글꼴이 늘든 저절로 따라온다(paperTextFont.js).
//
// 묶음이 차지한 폭과 굵기(Regular · Bold), 그리고 오른쪽으로 쓸 수 있는 폭은 SVG 에 글자 윤곽만
// 있어 알 수 없으므로,
// **속지가 자기 치수를 들고 다닌다** — <g aria-label="…" data-adv="182.991" data-w="B">.
// 정적 속지에는 scripts/bake-paper-metrics.mjs 가 한 번 구워 넣고, 코드로 그리는 속지는 그릴 때 적는다
// (plannerDraw.write · dated.js · inkRecordPaper.js). 그래서 앱에는 글꼴 표가 하나도 없다.
// 치수가 없는 묶음은 손대지 않아 원본 글꼴(MaruBuri)로 남는다.
import { getTemplate } from './catalog.js'
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
  if (!shown.length || paths.length !== shown.length || paths.some(path => !path)) return null
  const s = paths[0].s
  if (!(s > 0) || paths.some(path => path.s !== s || path.y !== paths[0].y)) return null
  // 치수가 적혀 있지 않으면 폭을 알 수 없으므로 손대지 않는다(원본 글꼴로 남는다)
  const adv = Number(attr(attrs, 'data-adv'))
  if (!Number.isFinite(adv) || !(adv > 0)) return null
  // data-fit: 오른쪽으로 쓸 수 있는 폭. 고른 글꼴이 이보다 넓어질 때만 글자 크기를 줄인다.
  const fitAttr = Number(attr(attrs, 'data-fit'))
  const fit = Number.isFinite(fitAttr) && fitAttr >= adv ? fitAttr : adv
  return { index: match.index, length: match[0].length, attrs, text, s, x: paths[0].x, y: paths[0].y,
    weight: attr(attrs, 'data-w') === 'B' ? 'B' : 'R', end: paths[0].x + adv, fit }
}

/**
 * 속지 SVG 문자열의 글자 묶음을 fontId 글꼴로 쓴 <text> 로 바꾼 문자열.
 * 원본 글꼴(또는 모르는 글꼴)이면 그대로 돌려준다.
 *
 * 크기(글자 크기) · 기준선(y) · 시작 자리(x) · 색은 원본 그대로다. 고른 글꼴이 그 자리(data-fit)보다
 * 넓어질 때만 글자 크기를 줄인다 — 좁은 것은 그대로 둔다(paperTextFont.js).
 * 읽을 수 없는 묶음은 손대지 않아 원본 윤곽(MaruBuri)으로 남는다.
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
