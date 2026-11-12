import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('683: 스와이프 표지는 폰 · 태블릿 모두 칸 가운데(가로 표지도 좌우 화살표 높이에)', () => {
  const card = read('../src/diary/components/DiaryCard.js')
  assert.match(card, /centered=\{large \|\| layout === 'carousel'\}/)
  const cover = read('../src/diary/components/Cover.js')
  assert.match(cover, /centered && styles\.fillCenter/)
  assert.match(cover, /fillCenter: \{ justifyContent: 'center' \}/)
})
