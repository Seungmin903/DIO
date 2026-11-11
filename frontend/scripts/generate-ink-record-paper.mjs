// 발색 기록 속지 SVG 를 만든다. 실행: node scripts/generate-ink-record-paper.mjs
//
// 무엇인가: 유리펜 잉크를 기록하는 속지. 한 칸에 잉크 하나 — 잉크병 · 이름 · 색 값 셋(잉크 · 글리터 · 테).
// 병을 그 잉크로 칠하면 앱이 색 셋을 읽어 미리보기 네모와 #RRGGBB 를 자동으로 채운다
// (유리펜 획이 color · inkGlitterColor · inkSheenColor 를 들고 있다 — src/editor/templates/inkRecord.js).
//
// 지켜야 하는 것:
//  · 768 x 1024(세로). class="dp-paper", data-page-type, role · aria-label · title
//  · 선 · 글자는 **속지 팔레트 색만**: 구조선 #bfc1c4, 진한 틀 #aeb3b8, 옅은 줄 #d7d9dc, 글자 #292929
//    (docs/디자인 가이드.md). 그래야 속지 색 설정이 그대로 먹는다
//  · 인쇄 글자는 **글자 윤곽(path)** 이고 묶음 모양이 정확해야 글꼴 교체가 먹는다
//    <g aria-label="잉크"><path d="..." transform="translate(x y) scale(s -s)"/>…</g>
//    (src/editor/templates/paperFont.js 의 readGroup 이 이 모양만 읽는다)
//
// 글자 윤곽은 scripts/dump-maruburi-glyphs.py 가 뽑아 둔 것을 쓴다.
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { square, circle, artAt, place, BASE } from './inkRecord/bottleShape.mjs'
// 자리 계산은 앱과 **같은 모듈**을 쓴다 — 두 벌로 두면 자동으로 채우는 값이 엉뚱한 데 찍힌다
import { SIZES, GRID, MARGIN as M, cellRegions, INK_RECORD_SHAPES, inkRecordId, INK_RECORD_FRAME as FRAME } from '../src/editor/templates/inkRecordLayout.js'

const STRUCT = '#bfc1c4', RULE = '#d7d9dc', INK = '#292929'
const n = v => Number(v.toFixed(2))

const GLYPHS = JSON.parse(readFileSync(new URL('./out/maruburi-glyphs.json', import.meta.url), 'utf8'))

/**
 * 글자 묶음. 윤곽은 1000 단위 em 이므로 글자 크기 size 에 맞는 배율은 size/1000 이다.
 * anchor: 'start' | 'middle' | 'end' — 가로 기준점.
 */
function glyphText(text, x, y, size, { weight = 'R', fill = INK, anchor = 'start', extra = '' } = {}) {
  const table = GLYPHS[weight] ?? GLYPHS.R
  const chars = [...text]
  if (chars.some(ch => ch !== ' ' && !table[ch])) throw new Error(`글자 윤곽 없음: ${text}`)
  const s = size / 1000
  const width = chars.reduce((sum, ch) => sum + (table[ch]?.[0] ?? 0), 0) * s
  let cursor = anchor === 'end' ? x - width : anchor === 'middle' ? x - width / 2 : x
  let paths = '', from = null, to = null
  for (const ch of chars) {
    const [advance, d] = table[ch] ?? [0, '']
    if (ch !== ' ' && d) {
      if (from === null) from = cursor
      paths += `<path d="${d}" transform="translate(${n(cursor)} ${n(y)}) scale(${n(s)} ${n(-s)})"/>`
      to = cursor + advance * s
    }
    cursor += advance * s
  }
  // 글꼴 교체에 쓰는 치수를 적어 둔다(paperFont.js readGroup) — 적어 두면 원본 글꼴 확인표가 없어도 된다
  const metrics = from === null ? '' : ` data-adv="${n(to - from)}"${weight === 'B' ? ' data-w="B"' : ''}`
  return `<g fill="${fill}"${extra} aria-label="${text}"${metrics}>${paths}</g>`
}

// fill 을 반드시 적는다 — 없으면 검정으로 칠해진다(속지 형식 검사가 지킨다)
const line = (x1, y1, x2, y2, stroke = STRUCT, w = 1) =>
  `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" fill="none" stroke="${stroke}" stroke-width="${w}" />`
const rect = (x, y, w, h, { stroke = STRUCT, sw = 1, fill = 'none' } = {}) =>
  `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" />`

/** 병 그림 + 병 좌표 → 속지 좌표 변환 */
function bottle(build, height, cx, top) {
  const art = artAt(build, height)
  const left = cx - art.w / 2
  return { svg: place(art, left, top).replaceAll('{line}', FRAME), art,
    at: (px, py) => ({ x: px + left - art.box.x0, y: py + top - art.box.y0 }) }
}

/**
 * 칸 하나. 자리는 inkRecordLayout.js 와 **같은 식**으로 계산해야 앱이 같은 자리를 찾는다.
 * 여기서 쓰는 값을 그 파일이 그대로 쓴다.
 */
function sheet(orientation, shape) {
  const round = shape === 'round'
  const { W, H, cols, rows } = SIZES[orientation]
  const out = []
  out.push(`<rect width="${W}" height="${H}" fill="#ffffff" />`)
  out.push(glyphText('발색 기록', M, M + 6, 22, { weight: 'B' }))
  out.push(line(M, M + 20, W - M, M + 20, FRAME, 1.5))

  const build = round ? (P => circle(P, P.s * 98 / BASE.s)) : square
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const R = cellRegions(orientation, col, row, shape)
    const { box, cx } = R, bh = R.bottleHeight
    const b = bottle(build, bh, cx, box.y + 10)
    out.push(`<g data-ink-cell="${row * cols + col}">${b.svg}</g>`)

    // 이름 줄: 아래 색 묶음과 같은 폭으로 맞춘다(좌우 끝이 어긋나면 들쭉날쭉하다)
    const gw = R.groupW, gx0 = R.groupX
    out.push(line(gx0, R.name.y + R.name.h, gx0 + gw, R.name.y + R.name.h, STRUCT))

    // 색 값 셋을 세로로 하나씩. 네모는 앱이 칠하고, # 뒤에는 앱이 HEX 를 쓴다.
    for (const [i, label] of ['잉크', '글리터', '테'].entries()) {
      const hy = R.baselines[i], chip = R.chips[i], hex = R.hex[i]
      out.push(glyphText(label, chip.x - 6, hy, 10, { fill: FRAME, anchor: 'end' }))
      out.push(rect(chip.x, chip.y, chip.w, chip.h, { stroke: FRAME }))
      out.push(glyphText('#', hex.x - 8, hy, 10, { fill: FRAME }))
      out.push(line(hex.x, hy + 3, hex.x + hex.w, hy + 3, RULE))
    }
  }
  return out.join('')
}

const wrap = (orientation, id, name, body) => { const { W, H } = SIZES[orientation]; return ''
  + `<?xml version='1.0' encoding='utf-8'?>\n<svg xmlns="http://www.w3.org/2000/svg" id="${id}" class="dp-paper"`
  + ` width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}"`
  + ` data-page-type="inkRecord" data-orientation="${orientation}"><title>${name}</title>`
  + `<metadata>DIO; MaruBuri Regular/Bold; NAVER; https://hangeul.naver.com/font</metadata>${body}</svg>` }

const NAMES = { round: '발색 기록(둥근 병)', square: '발색 기록(각진 병)' }

const dir = new URL('../assets/templates/2026/SVG/', import.meta.url)
for (const shape of INK_RECORD_SHAPES) for (const orientation of ['portrait', 'landscape']) {
  const id = inkRecordId(shape, orientation)
  writeFileSync(new URL(`${id}.svg`, dir), wrap(orientation, id, NAMES[shape], sheet(orientation, shape)))
  console.log('저장:', id + '.svg')
}
// 쓸 수 있는 폭(data-fit) · 맞춘 자리(data-anchor)는 다른 정적 속지와 **같은 식**으로 굽는다.
// 여기서 따로 셈하면 두 벌이 되어 어긋나고, 안 구우면 글꼴을 바꿀 때 글자가 모두 줄어든다(코드리뷰 2026-11-11).
// 굽기는 이미 치수가 다 적힌 묶음은 건드리지 않으므로, 방금 만든 속지만 채워진다.
execFileSync(process.execPath, [fileURLToPath(new URL('./bake-paper-metrics.mjs', import.meta.url))], { stdio: 'inherit' })
