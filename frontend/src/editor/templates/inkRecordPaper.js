// 발색 기록 속지의 **덮개**. 바탕(SVG 파일)은 빈 칸만 그려 두고, 병을 칠하면 그 색에서 읽은
// 미리보기 네모와 #RRGGBB 를 여기서 그린다. 기록(page.planner)에 저장하지 않고 **그때그때 획에서
// 읽으므로**, 획을 지우면 값도 같이 사라진다(사용자 2026-11-11).
import { n, TEXT } from './plannerDraw.js'
import { INK_RECORD_GLYPHS } from './inkRecordGlyphs.js'
import { inkRecordLayout, isInkRecordId, SIZES } from './inkRecordLayout.js'
import { inkRecordValue } from './inkRecord.js'

export { isInkRecordId }

const FRAME = '#aeb3b8'
// 값 글자 크기. 바탕의 '잉크 · 글리터 · 테' 라벨(10)과 나란히 읽히게 같은 크기로 둔다.
const SIZE = 10

/**
 * HEX 여섯 자를 글자 윤곽으로 찍는다. 다른 속지와 같은 모양(<g aria-label> + transform)이라
 * 속지 글꼴을 바꾸면 paperFont.js 가 이 글자도 함께 바꿔 끼운다.
 * 스터디 플래너 글자표에는 0-9 · A-F 가 없어 전용 표(inkRecordGlyphs.js)를 쓴다.
 */
function hexText(text, x, y) {
  const k = SIZE / 1000
  let cursor = x, paths = '', from = null, to = null
  for (const ch of text) {
    const entry = INK_RECORD_GLYPHS.R[ch]
    if (!entry) continue
    const [advance, d] = entry
    if (d) {
      if (from === null) from = cursor
      paths += `<path d="${d}" transform="translate(${n(cursor)} ${n(y)}) scale(${k} ${-k})"/>`
      to = cursor + advance * k
    }
    cursor += advance * k
  }
  // 글꼴 교체에 쓰는 치수를 적어 둔다(paperFont.js readGroup) — 적어 두면 원본 글꼴 확인표가 없어도 된다
  return paths ? `<g fill="${TEXT}" aria-label="${text}" data-adv="${n(to - from)}">${paths}</g>` : ''
}

/**
 * 덮개 SVG. fills 는 inkRecordValue() 가 만든 칸별 값(없으면 빈 <svg>).
 */
export function inkRecordOverlaySvg(assetId, fills) {
  const layout = inkRecordLayout(assetId)
  if (!layout) return ''
  const { W, H } = SIZES[layout.orientation]
  fills = fills ?? []
  let body = ''
  layout.cells.forEach((cell, index) => {
    const fill = fills[index]
    if (!fill) return
    const values = [fill.ink, fill.glitter, fill.sheen]
    values.forEach((value, i) => {
      // 그 자리에 손으로 쓴 글씨가 있으면 자동 값을 찍지 않는다(사용자가 고친 것이 이긴다)
      if (!value || fill.written[i]) return
      const chip = cell.chips[i]
      // 칠은 **사용자가 고른 잉크 색**이라 속지 색 설정에 덧칠되면 안 된다(옆의 HEX 글자와 어긋난다).
      // 테두리는 속지 구조선이라 설정을 따라야 하므로, 칠과 테두리를 따로 그린다.
      body += `<rect x="${n(chip.x)}" y="${n(chip.y)}" width="${n(chip.w)}" height="${n(chip.h)}"`
        + ` fill="${value}" data-preserve-paint="true" />`
        + `<rect x="${n(chip.x)}" y="${n(chip.y)}" width="${n(chip.w)}" height="${n(chip.h)}"`
        + ` fill="none" stroke="${FRAME}" stroke-width="1" />`
      body += hexText(value.slice(1), cell.hex[i].x + 2, cell.baselines[i])
    })
  })
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`
}

/**
 * 바탕 <svg> 안에 덮개 내용을 끼워 넣는다. 둘은 viewBox 가 같으므로 그대로 겹친다.
 * 내보내기는 속지 하나를 XML 한 덩이로 받으므로 여기서 합쳐 준다.
 */
export function mergeInkRecordOverlay(baseXml, overlayXml) {
  if (!overlayXml) return baseXml
  const inner = overlayXml.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  if (!inner.trim()) return baseXml
  const close = baseXml.lastIndexOf('</svg>')
  return close < 0 ? baseXml : baseXml.slice(0, close) + inner + baseXml.slice(close)
}

/**
 * 바탕은 **속지 파일 그대로**다(fileBase). 덮개만 따로 만들어 위에 겹친다 —
 * 그래서 svg() 로 바탕을 통째로 대신하지 않는다. 내보내기가 이 표시를 보고 파일을 먼저 읽는다.
 */
export const inkRecordApi = (assetId) => isInkRecordId(assetId) ? {
  kind: 'inkRecord',
  fileBase: true,
  orientation: assetId.endsWith('portrait') ? 'portrait' : 'landscape',
  startHour: () => 6,
  normalize: value => value ?? null,
  setOptions: value => value ?? null,
  baseSvg: () => null,
  // 값이 없으면(내보내기처럼 page.planner 를 안 거친 길) 요소에서 바로 읽는다
  overlaySvg: (value, objects) => inkRecordOverlaySvg(assetId, value ?? inkRecordValue(assetId, objects)),
  svg: (value, objects) => inkRecordOverlaySvg(assetId, value ?? inkRecordValue(assetId, objects)),
  titles: () => null,
  stroke: () => null,
  erase: () => null,
  textSlot: () => null,
  cellTap: () => null,
  nowLine: () => null,
  editTap: () => null,
  titleAt: () => null,
  autoColor: () => null,
} : null
