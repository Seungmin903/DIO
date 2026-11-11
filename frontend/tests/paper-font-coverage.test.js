import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import MARU from '../scripts/paperMetrics/maruburi.js'
import { PAPER_RUNTIME_CHARS } from '../src/editor/templates/paperRuntimeChars.js'

// 속지의 인쇄 글자는 원본(마루부리) 글자 윤곽(path)이다. 속지 설정에서 다른 글꼴을 고르면
// paperFont.js 가 그 묶음을 **진짜 글꼴로 쓴 <text>** 로 바꾸는데, 그러려면 묶음이 차지한 폭과
// 굵기를 알아야 한다. SVG 에는 적혀 있지 않아 **속지에 구워 넣는다**(scripts/bake-paper-metrics.mjs).
//
// 확인표에 없는 글자가 섞인 묶음은 **손대지 않아 그 묶음만 원본 글꼴로 남는다** — 화면에는 글꼴이
// 섞여 보이지만 오류는 나지 않아 조용히 지나간다. 2026-11-11 실측으로 43글자가 그랬다(표를 만드는
// 스크립트가 undated 와 reusable 폴더만 훑고 있었다). 새 속지를 넣으면서 표를 다시 안 뽑으면 같은
// 일이 되풀이되므로, 사람이 기억하지 않아도 되게 여기서 막는다.
//
// (글꼴마다 윤곽 표를 두던 방식은 2026-11-11 에 없앴다 — S15P31F106-848. 이제 글꼴을 더해도
//  표를 뽑을 일이 없고, 확인표 하나만 글자를 따라가면 된다.)
const ROOT = new URL('../assets/templates/', import.meta.url)

const svgFiles = (dir = ROOT) => readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
  const path = join(dir.pathname ? decodeURIComponent(dir.pathname).replace(/^\//, '') : dir, entry.name)
  return entry.isDirectory() ? svgFiles(path) : entry.name.endsWith('.svg') ? [path] : []
})

/** 속지 SVG 에 인쇄된 글자 전부(글자 묶음의 aria-label) */
function paperChars() {
  const chars = new Set()
  for (const file of svgFiles()) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/aria-label="([^"]*)"/g)) {
      for (const ch of match[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')) chars.add(ch)
    }
  }
  chars.delete(' ')
  return [...chars].sort()
}

const HOWTO = '→ frontend 에서 `python scripts/generate-paper-fonts.py` 를 다시 돌리고 바뀐 scripts/paperMetrics/maruburi.js 와 속지를 함께 커밋하세요.'

test('속지에 인쇄된 글자가 모두 원본 글꼴 확인표에 있다 — 없으면 글꼴을 바꿔도 그 묶음만 원본으로 남는다', () => {
  const chars = paperChars()
  assert.ok(chars.length > 50, `속지 글자를 못 읽었다(${chars.length}자) — 검사가 헛돌고 있다`)
  const missing = chars.filter(ch => !MARU[ch])
  assert.deepEqual(missing, [], `마루부리 확인표에 없는 글자: ${missing.join('')}\n${HOWTO}`)
})

test('앱이 실행 중에 찍는 글자도 확인표에 있다 — 속지 SVG 에는 안 나와서 빠지기 쉽다', () => {
  // 발색 기록 속지는 병을 칠하면 #RRGGBB 를 채운다. 이 글자들은 어느 속지 SVG 에도 없으므로
  // SVG 만 훑어서는 표에 들어가지 않는다 — 따로 적어 두고 여기서 지킨다.
  const chars = [...PAPER_RUNTIME_CHARS].sort()
  assert.ok(chars.length > 0)
  const missing = chars.filter(ch => !MARU[ch])
  assert.deepEqual(missing, [], `마루부리 확인표에 없는 글자: ${missing.join('')}\n${HOWTO}`)
})

test('확인표를 만드는 스크립트가 속지 SVG 전부와 실행 중 글자를 훑는다', () => {
  // 범위가 좁아지면 위 검사가 통과하더라도 다음 사람이 표를 다시 뽑을 때 글자가 사라진다.
  const script = readFileSync(new URL('../scripts/generate-paper-fonts.py', import.meta.url), 'utf8')
  assert.match(script, /assets\/templates\/\*\*\/\*\.svg/, '속지 SVG 전부를 훑어야 한다')
  assert.match(script, /RUNTIME_CHARS/, '실행 중에 찍는 글자도 넣어야 한다')
})

test('앱에는 글자 윤곽 표가 없다 — 남은 것은 글자 폭 숫자뿐이다', () => {
  // 글꼴마다 떠 두던 윤곽 표(1.87MB)는 없앴다. 원본 글꼴 확인표도 속지에 치수를 구워 넣을 때만
  // 쓰므로 빌드 전용으로 scripts/ 아래에 둔다.
  assert.equal(existsSync(new URL('../src/editor/templates/paperFonts/', import.meta.url)), false, 'src 에 글꼴 윤곽 표 폴더가 남아 있다')
  assert.ok(existsSync(new URL('../scripts/paperMetrics/maruburi.js', import.meta.url)), '빌드용 확인표가 있어야 한다')
  assert.doesNotMatch(readFileSync(new URL('../src/editor/templates/paperFont.js', import.meta.url), 'utf8'),
    /paperFonts|paperMetrics/, '앱이 윤곽 표를 읽으면 안 된다')
  // 앱이 쓰는 글자 폭 표는 숫자뿐이라 작다. 윤곽이 다시 섞여 들어오면 여기서 걸린다.
  const widths = readFileSync(new URL('../src/editor/templates/paperFontWidths.js', import.meta.url), 'utf8')
  assert.ok(widths.length < 40 * 1024, `글자 폭 표가 너무 크다(${Math.round(widths.length / 1024)}KB) — 윤곽이 섞였나`)
  assert.doesNotMatch(widths, /"[MLQCHVZ][\s\d]/, '글자 폭 표에 윤곽(path)이 들어 있다')
})
