// 속지 SVG 의 글자 묶음에 **글꼴 교체에 쓰는 치수**를 적어 넣는다.
// 실행: node scripts/bake-paper-metrics.mjs (frontend/). 속지를 새로 넣거나 글자를 고치면 다시 돌린다.
//
// 왜: 속지 글꼴을 바꿀 때 묶음이 차지한 폭 · 굵기(Regular · Bold) · 쓸 수 있는 자리를 알아야 하는데,
// SVG 에는 글자 윤곽만 있고 그 둘이 적혀 있지 않다. 예전에는 앱이 원본 글꼴 표를 들고 다니며
// 그때그때 알아냈고, 그래서 **속지에 새 글자가 들어올 때마다 그 표를 다시 뽑아야** 했다.
// 한 번 구워 넣으면 그 일이 없어진다 — 속지가 자기 치수를 들고 다니고, 앱에는 글자 윤곽 표가 없다(글자 폭 표만 남는다)
// (S15P31F106-848).
//
//   <g aria-label="데일리 플래너" data-adv="182.991" data-w="B" data-fit="236">…</g>
//     data-adv: 보이는 글자가 차지하는 폭(속지 좌표) · data-w: 굵은 글씨면 "B"
//     data-anchor: 자리를 맞춘 기준점(middle · end). 시작 맞춤이면 적지 않는다
//     data-fit: 오른쪽으로 **쓸 수 있는 폭**(다음 선 · 칸 · 글자까지). 고른 글꼴이 이보다 넓어질 때만
//               앱이 글자 크기를 줄인다. 원래 폭(data-adv)을 기준 삼으면 마루부리 숫자가 유난히 좁아
//               "1" 이 든 라벨마다 줄어들어 옆 숫자와 크기가 달라진다(2026-11-11 실측 62%).
//
// 치수는 원본 글꼴(MaruBuri) 확인표에서 구한다. 그 표는 **빌드 때만 쓰는** 자료라
// scripts/paperMetrics/ 에 두고 앱에서는 쓰지 않는다(scripts/generate-paper-fonts.py 가 만든다).
// 이미 적혀 있으면 건드리지 않는다 — 다시 돌려도 결과가 같다. --force 면 다 지우고 다시 센다
// (여유 폭을 재는 식을 고쳤을 때 쓴다).
//
// 코드로 그리는 속지(플래너 · 날짜 · 발색 기록 덮개)는 그릴 때 직접 적으므로 여기서 다루지 않는다.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import MARU from './paperMetrics/maruburi.js'

const FORCE = process.argv.includes('--force')
const ROOT = fileURLToPath(new URL('../assets/templates/', import.meta.url))
const svgFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir, entry.name)
  return entry.isDirectory() ? svgFiles(path) : entry.name.endsWith('.svg') ? [path] : []
})

const GROUP = /<g\b([^>]*)>((?:\s*<path\b[^>]*\/>)+)\s*<\/g>/g
const PATH = /<path\b([^>]*)\/>/g
const TRANSFORM = /translate\(\s*([-\d.eE+]+)[\s,]+([-\d.eE+]+)\s*\)\s*scale\(\s*([-\d.eE+]+)/
const attr = (text, name) => text.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1] ?? null
const unescapeXml = text => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
const n = value => Number(value.toFixed(3))

// 원본 윤곽과 확인표 윤곽 상자의 허용 차이(글자 하나당, 1000 단위)
const BOX_TOLERANCE = 3
// path(절대 좌표 M L Q C H V Z)의 점 · 조절점이 이루는 상자의 [가로, 세로]
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

/**
 * 묶음 하나 → { adv, weight, x, y, s, end }. 글자 묶음이 아니거나 치수를 못 구하면 null.
 * quiet 면 못 구한 까닭을 알리지 않는다(여유 폭을 재느라 이웃을 훑을 때 쓴다).
 */
function metricsOf(attrs, body, quiet = false) {
  const label = attr(attrs, 'aria-label')
  if (label == null) return null                     // 글자 묶음이 아니다(그림 조각)
  const shown = [...unescapeXml(label)].filter(ch => ch !== ' ')
  const paths = [...body.matchAll(PATH)].map(item => {
    const d = attr(item[1], 'd'), t = attr(item[1], 'transform')?.match(TRANSFORM)
    return d && t ? { d, x: Number(t[1]), y: Number(t[2]), s: Number(t[3]) } : null
  })
  if (!shown.length || paths.length !== shown.length || paths.some(path => !path)) return null
  if (shown.some(ch => !MARU[ch])) return quiet ? null : { missing: shown.filter(ch => !MARU[ch]).join('') }
  const s = paths[0].s
  if (!(s > 0) || paths.some(path => path.s !== s || path.y !== paths[0].y)) return null
  // 굵기: 글자 윤곽 상자 크기가 Regular 와 Bold 중 어느 쪽에 맞는지(묶음 전체의 합)
  let regular = 0, bold = 0
  paths.forEach((path, i) => {
    const [width, height] = boxOf(path.d), ref = MARU[shown[i]]
    regular += Math.abs(width - ref[1]) + Math.abs(height - ref[2]); bold += Math.abs(width - ref[4]) + Math.abs(height - ref[5])
  })
  if (Math.min(regular, bold) > BOX_TOLERANCE * paths.length) return quiet ? null : { missing: `굵기를 못 가름(${label})` }
  const weight = regular <= bold ? 'R' : 'B'
  const last = paths[paths.length - 1]
  const end = last.x + MARU[shown[shown.length - 1]][weight === 'R' ? 0 : 3] * s
  return { adv: n(end - paths[0].x), weight, x: paths[0].x, y: paths[0].y, s, end }
}

/**
 * 묶음 오른쪽으로 **쓸 수 있는 폭**. 같은 높이 띠에서 오른쪽에 처음 나오는 것(세로선 · 네모 테두리 ·
 * 다른 글자 묶음)까지다. 아무것도 없으면 종이 오른쪽 끝까지. 원래 폭보다 작아지지는 않는다.
 * 글자는 기준선 위로 올라가므로 띠는 기준선에서 글자 크기만큼 위, 조금 아래로 잡는다.
 */
function freeWidth(xml, group, pageWidth) {
  const size = group.s * 1000
  const top = group.y - size * 0.86, bottom = group.y + size * 0.22
  let limit = pageWidth - 2
  const narrow = (x) => { if (Number.isFinite(x) && x > group.end - 0.5 && x < limit) limit = x }
  for (const [tag] of xml.matchAll(/<(?:line|rect)\b[^>]*\/?>/g)) {
    // 템플릿 리터럴 안에서는 \\s · \\d 로 적어야 한다 — \s 는 그냥 s 가 된다(코드리뷰 2026-11-11)
    const at = key => Number((tag.match(new RegExp(`\\s${key}="([-\\d.]+)"`)) ?? [])[1])
    if (tag.startsWith('<line')) {
      const x1 = at('x1'), y1 = at('y1'), x2 = at('x2'), y2 = at('y2')
      if ([x1, y1, x2, y2].some(Number.isNaN)) continue
      if (Math.abs(x1 - x2) > 0.5) continue                      // 가로선은 글자를 막지 않는다
      if (Math.max(y1, y2) < top || Math.min(y1, y2) > bottom) continue
      narrow(x1)
    } else {
      const x = at('x'), y = at('y'), w = at('width'), h = at('height')
      if ([x, y, w, h].some(Number.isNaN)) continue
      if (y + h < top || y > bottom) continue
      narrow(x)                                                  // 네모는 왼쪽 변이 막는다
      if (x <= group.x) narrow(x + w)                            // 묶음을 품은 네모는 오른쪽 변이 막는다
    }
  }
  for (const match of xml.matchAll(GROUP)) {
    if (match.index === group.index) continue
    const other = metricsOf(match[1].replace(/\s+data-(adv|w|fit)="[^"]*"/g, ''), match[2], true)
    if (!other) continue
    if (other.y < top || other.y > bottom) continue
    narrow(other.x)
  }
  return Math.max(group.end - group.x, limit - group.x)
}

// 기준점 판정에 쓰는 값 — 자리가 0.5 단위에 떨어지면 그 기준으로 맞춘 것으로 본다
const ROUND = 0.06
const ANCHORS = ['start', 'middle', 'end']
const edgeOf = (group, type) => type === 'start' ? group.x : type === 'end' ? group.end : (group.x + group.end) / 2
const onGrid = value => Math.abs(value * 2 - Math.round(value * 2)) / 2 <= ROUND

/**
 * 이 묶음이 **어느 자리에 맞춰** 놓였나. 시작 · 가운데 · 끝 중, 같은 기준선 · 같은 크기의 이웃까지
 * 합쳐 0.5 단위에 떨어지는 일이 가장 많은 것을 고른다(요일 이름처럼 오른쪽 끝을 칸에 맞춘 줄은
 * 이웃 모두 끝이 떨어지고, 가운데가 떨어지는 건 우연이다). 비기면 시작 → 가운데 → 끝 순.
 *
 * 글꼴을 바꾸면 폭이 달라지므로 이 기준점을 지켜야 가운데 · 오른쪽 맞춤이 왼쪽으로 쏠리지 않는다
 * (코드리뷰 2026-11-11). 예전 윤곽 교체가 줄마다 하던 일을 굽기 때 한 번만 해 둔다.
 */
function anchorOf(group, siblings) {
  const row = siblings.filter(other => Math.abs(other.y - group.y) < 0.02 && other.s === group.s)
  const votes = ANCHORS.map(type => row.filter(other => onGrid(edgeOf(other, type))).length)
  const best = votes.indexOf(Math.max(...votes))
  return votes[best] > 0 ? ANCHORS[best] : 'start'
}

let files = 0, added = 0, already = 0
const trouble = [], noPage = []
/**
 * 종이 폭 = 맨 바깥 <svg> 의 viewBox 셋째 값(없으면 width). 읽지 못하면 null.
 * 예전에는 'viewBox="0 0 1024 768"' 문자열이 있으면 1024, 아니면 768 로 보았다 — 그 두 크기가 아닌
 * 속지가 들어오면 오른쪽 한계(data-fit)가 조용히 어긋난다(코드리뷰 2026-11-11).
 */
function pageWidthOf(xml) {
  const root = xml.match(/<svg\b[^>]*>/)?.[0]
  if (!root) return null
  const box = attr(root, 'viewBox')?.trim().split(/[\s,]+/).map(Number)
  const width = box?.length === 4 ? box[2] : Number(attr(root, 'width'))
  return Number.isFinite(width) && width > 0 ? width : null
}
for (const file of svgFiles(ROOT)) {
  const xml = readFileSync(file, 'utf8')
  if (!xml.includes('aria-label')) continue
  let out = '', at = 0, touched = 0
  const page = pageWidthOf(xml)
  if (page == null) { noPage.push(file.split(/[\\/]/).pop()); continue }
  // 기준점은 이웃을 봐야 정해지므로 이 장의 묶음을 먼저 다 읽어 둔다
  const siblings = [...xml.matchAll(GROUP)]
    .map(one => metricsOf(one[1].replace(/\s+data-(adv|w|fit|anchor)="[^"]*"/g, ''), one[2], true))
    .filter(Boolean)
  for (const match of xml.matchAll(GROUP)) {
    const [whole, attrs, body] = match
    if (!FORCE && /\sdata-adv="/.test(attrs) && /\sdata-fit="/.test(attrs)) { already++; continue }
    // 이미 적힌 값은 걷어내고 다시 센다 — 다시 돌려도 결과가 같게
    const clean = attrs.replace(/\s+data-(adv|w|fit|anchor)="[^"]*"/g, '')
    const metrics = metricsOf(clean, body)
    if (!metrics) continue
    if (metrics.missing) { trouble.push(`${file.split(/[\\/]/).pop()} ${metrics.missing}`); continue }
    const fit = n(freeWidth(xml, { ...metrics, index: match.index }, page))
    const anchor = anchorOf(metrics, siblings)
    out += xml.slice(at, match.index) + whole.replace(/^<g\b[^>]*>/, () =>
      `<g${clean} data-adv="${metrics.adv}"${metrics.weight === 'B' ? ' data-w="B"' : ''}`
      + `${anchor === 'start' ? '' : ` data-anchor="${anchor}"`} data-fit="${fit}">`)
    at = match.index + whole.length
    touched++
  }
  if (!touched) continue
  writeFileSync(file, out + xml.slice(at))
  files++; added += touched
}
console.log('속지', files, '장 ·', added, '묶음에 치수를 적었다 · 이미 있던 것', already)
if (trouble.length) {
  console.log('치수를 못 구한 묶음', trouble.length, '—', trouble.slice(0, 5).join(' / '))
  console.log('→ python scripts/generate-paper-fonts.py 로 원본 글꼴 확인표를 다시 뽑고 이 스크립트를 다시 돌리세요.')
  process.exitCode = 1
}
if (noPage.length) {
  console.log('종이 폭(viewBox)을 못 읽어 굽지 않은 속지', noPage.length, '—', noPage.slice(0, 5).join(' / '))
  console.log('→ 속지의 <svg> 에 viewBox="0 0 폭 높이" 를 적고 다시 돌리세요.')
  process.exitCode = 1
}
