import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('공방 도구 · 속지 탭: 견본 줄과 팔레트 편집은 머리줄 · 구분선과 같은 폭(태블릿 318, 폰 칸 전체)이라 팔레트 편집이 선 끝을 넘지 않는다', () => {
  const presets = read('src/diary/components/StudioPresets.js')
  assert.match(presets, /export function PaletteFit\(\{ full = false, children \}\) \{\s*return <View style=\{\[local\.paletteFit, full && local\.lineFull\]\}>/)
  assert.match(presets, /paletteFit: \{ width: 318, maxWidth: '100%' \}/)
  // 구분선과 같은 폭 값
  assert.match(presets, /line: \{ width: 318, maxWidth: '100%', height: 1/)
  assert.match(presets, /<PaletteFit full=\{compact\}><EditablePalette scope=\{group\.scope\} label=\{group\.label\} flushEdit \/><\/PaletteFit>/)
  const paper = read('src/diary/components/StudioPaperStyle.js')
  assert.match(paper, /<PaletteFit full=\{compact\}><EditablePalette scope=\{scope\} label=\{label\} value=\{value\} onPick=\{onChange\} flushEdit \/><\/PaletteFit>/)
})

test('팔레트 편집 글자 오른쪽 끝을 줄 끝에 맞춘다(누르는 자리 여백 6 은 바깥으로) — 공방에서만, 편집기 패널은 그대로', () => {
  const palette = read('src/editor/components/controls/EditablePalette.js')
  assert.match(palette, /flushEdit = false \}\) \{/)
  assert.match(palette, /style=\{\[s\.edit, flushEdit && s\.editFlush\]\}/)
  assert.match(palette, /edit:\{minHeight:36,justifyContent:'center',paddingHorizontal:6\}/)
  assert.match(palette, /editFlush:\{marginRight:-6\}/)
})
