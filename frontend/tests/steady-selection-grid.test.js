import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('고른 칸은 테두리 2 = 여백 1 줄임: 고를 때마다 칸 폭 · 옆 칸 자리가 움직이지 않는다', () => {
  const panel = read('../src/editor/components/ToolPanel.js')
  assert.match(panel, /segmentItem: \{[^}]*borderWidth: 1, padding: 1,/)
  assert.match(panel, /segmentActive: \{ borderColor: colors\.primaryStrong, borderWidth: 2, padding: 0 \}/)
  assert.match(panel, /chipActive: \{ borderColor: colors\.primaryStrong, borderWidth: 2, padding: 0 \}/)
  const tape = read('../src/editor/components/panels/TapeOptions.js')
  assert.match(tape, /segmentItem: \{[^}]*borderWidth: 1, padding: 1,/)
  assert.match(tape, /segmentActive: \{ borderColor: colors\.primaryStrong, borderWidth: 2, padding: 0 \}/)
  const shape = read('../src/editor/components/ShapeSettings.js')
  assert.match(shape, /categoryTabActive:\{paddingHorizontal:11\}/)
  assert.match(shape, /borderPreviewActive:\{paddingHorizontal:7,paddingVertical:3\}/)
  assert.match(read('../src/editor/components/panels/DecorDrawer.js'), /pillActive: \{[^}]*borderWidth: 2, paddingHorizontal: 12 \}/)
  assert.match(read('../src/editor/components/panels/PhotoCropper.js'), /chipActive: \{ borderWidth: 2, paddingHorizontal: 13,/)
  const pages = read('../src/editor/components/panels/PageList.js')
  assert.match(pages, /tab: \{[^}]*borderWidth: 1, padding: 1,/)
  assert.match(pages, /tabActive: \{ borderWidth: 2, padding: 0,/)
  const pen = read('../src/editor/components/PenSettings.js')
  assert.match(pen, /type: \{[^}]*paddingVertical: 6, paddingHorizontal: 1 \}/)
  assert.match(pen, /typeSelected: \{ borderWidth: 2, paddingVertical: 5, paddingHorizontal: 0,/)
})

test('공방 내 표지 · 내 속지는 폰 · 태블릿 모두 격자: 긴 변이 칸 폭, 한 줄은 아랫변을 맞춘다', () => {
  const shelf = read('../src/diary/components/StudioShelf.js')
  assert.doesNotMatch(shelf, /FadeScroll/)
  assert.match(shelf, /const CELL = \{ cover: 154, paper: 208 \};/)
  assert.match(shelf, /useFillGrid\(\{ cell: CELL\[kind\], gap: GAP, minColumns: 2 \}\)/)
  assert.match(shelf, /const slot = item\.orientation === 'landscape' \? \{ width, height: short \} : \{ width: short, height: width \};/)
  assert.match(shelf, /grid: \{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: GAP,/)
})
