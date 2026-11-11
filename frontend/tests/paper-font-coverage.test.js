import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import MARU from '../src/editor/templates/paperFonts/maruburi.js'
import nanumGothic from '../src/editor/templates/paperFonts/nanum-gothic.js'
import nanumMyeongjo from '../src/editor/templates/paperFonts/nanum-myeongjo.js'
import gowunBatang from '../src/editor/templates/paperFonts/gowun-batang.js'
import gowunDodum from '../src/editor/templates/paperFonts/gowun-dodum.js'
import nanumPen from '../src/editor/templates/paperFonts/nanum-pen.js'
import poorStory from '../src/editor/templates/paperFonts/poor-story.js'
import { PAPER_RUNTIME_CHARS } from '../src/editor/templates/paperRuntimeChars.js'

// 속지의 인쇄 글자는 글자 윤곽(path)이고, 속지 설정에서 글꼴을 바꾸면 paperFont.js 가 그 윤곽을
// 고른 글꼴의 윤곽으로 바꿔 끼운다. 바꿔 끼울 윤곽이 글꼴 표에 **없으면 그 글자만 마루부리로 남는다** —
// 화면에는 글꼴이 섞여 보이지만 오류는 나지 않아 조용히 지나간다.
//
// 2026-11-11 실측으로 43글자가 그렇게 빠져 있었다(먼슬리 · 위클리 · 데일리에만 나오는 글자들.
// 표를 만드는 스크립트가 undated 와 reusable 폴더만 훑고 있었다). 고친 뒤에도 **새 속지를 넣으면서
// 표를 다시 안 뽑으면 같은 일이 되풀이된다** — 사람이 기억하지 않아도 되게 여기서 막는다.
const FONTS = {
  '나눔고딕': nanumGothic, '나눔명조': nanumMyeongjo, '고운바탕': gowunBatang,
  '고운돋움': gowunDodum, '나눔손글씨 펜': nanumPen, '푸어스토리': poorStory,
}
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

const HOWTO = '→ frontend 에서 `python scripts/generate-paper-fonts.py` 를 다시 돌리고 바뀐 paperFonts/* 를 함께 커밋하세요.'

test('속지에 인쇄된 글자가 모두 글꼴 표에 있다 — 없으면 글꼴을 바꿔도 그 글자만 원본으로 남는다', () => {
  const chars = paperChars()
  assert.ok(chars.length > 50, `속지 글자를 못 읽었다(${chars.length}자) — 검사가 헛돌고 있다`)

  const missingMaru = chars.filter(ch => !MARU[ch])
  assert.deepEqual(missingMaru, [], `마루부리 확인표에 없는 글자: ${missingMaru.join('')}\n${HOWTO}`)

  for (const [label, table] of Object.entries(FONTS)) {
    const missing = chars.filter(ch => !table.R?.[ch])
    assert.deepEqual(missing, [], `${label} 표에 없는 글자: ${missing.join('')}\n${HOWTO}`)
  }
})

test('앱이 실행 중에 찍는 글자도 글꼴 표에 있다 — 속지 SVG 에는 안 나와서 빠지기 쉽다', () => {
  // 발색 기록 속지는 병을 칠하면 #RRGGBB 를 채운다. 이 글자들은 어느 속지 SVG 에도 없으므로
  // SVG 만 훑어서는 표에 들어가지 않는다 — 따로 적어 두고 여기서 지킨다.
  const chars = [...PAPER_RUNTIME_CHARS].sort()
  assert.ok(chars.length > 0)
  const missingMaru = chars.filter(ch => !MARU[ch])
  assert.deepEqual(missingMaru, [], `마루부리 확인표에 없는 글자: ${missingMaru.join('')}\n${HOWTO}`)
  for (const [label, table] of Object.entries(FONTS)) {
    const missing = chars.filter(ch => !table.R?.[ch])
    assert.deepEqual(missing, [], `${label} 표에 없는 글자: ${missing.join('')}\n${HOWTO}`)
  }
})

test('표를 만드는 스크립트가 속지 SVG 전부와 실행 중 글자를 훑는다', () => {
  // 범위가 좁아지면 위 검사가 통과하더라도 다음 사람이 표를 다시 뽑을 때 글자가 사라진다.
  const script = readFileSync(new URL('../scripts/generate-paper-fonts.py', import.meta.url), 'utf8')
  assert.match(script, /assets\/templates\/\*\*\/\*\.svg/, '속지 SVG 전부를 훑어야 한다')
  assert.match(script, /RUNTIME_CHARS/, '실행 중에 찍는 글자도 넣어야 한다')
})
