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

test('팔레트 칸 색 창: 처음 색과 다르면 X 왼쪽에 원래대로, 누르면 처음 색(테이프는 기본 id 그대로)으로 되돌린다', () => {
  const editor = read('../src/diary/components/PresetColorEditor.js')
  assert.match(editor, /defaultValue = null, onDone/)
  assert.match(editor, /const changed = Boolean\(defaults\) && !same\(list, defaults\)/)
  assert.match(editor, /\{changed && <Pressable accessibilityRole="button" accessibilityLabel=\{`\$\{title\} 원래 색으로 되돌리기`\}[^>]*onPress=\{restore\}[^>]*><Text style=\{s\.restoreText\}>원래대로<\/Text><\/Pressable>\}\n\s*<Pressable accessibilityRole="button" accessibilityLabel=\{`\$\{title\} 창 닫기`\}/)
  assert.match(editor, /onDone\(defaults && same\(latest\.current, defaults\) \? defaultValue : fromList\(latest\.current\)\)/)
  // 유리펜 칸은 색 셋이라 한 칸짜리 기본색이 없다 → glass 면 null 을 넘겨 '원래대로'를 띄우지 않는다
  assert.match(read('../src/editor/components/controls/EditablePalette.js'), /defaultValue: glass \? null : palette\.defaults\?\.\[index\] \?\? null/)
})

test('팔레트 편집: 고치는 칸은 촘촘한 점선 고리(SVG 6조각), 색 창에서 고치는 동안 그 칸이 바로 바뀐다', () => {
  const palette = read('../src/editor/components/controls/EditablePalette.js')
  assert.match(palette, /const RING_R = 12\.5, RING_STEP = \(2 \* Math\.PI \* RING_R\) \/ 6/)
  assert.match(palette, /strokeDasharray=\{`\$\{RING_STEP \* 0\.6\} \$\{RING_STEP \* 0\.4\}`\}/)
  assert.match(palette, /editFocus:\{borderWidth:0\}/)
  // 유리펜은 color 가 색 셋(배열)이라 칸이 읽는 묶음 문자열로 바꿔 넣는다(안 그러면 고치는 동안 칸이 안 바뀐다)
  assert.match(palette, /onChange: color => setPreview\(\{ index, color: glass \? glassEntry\(\{ ink: color\[0\], glitter: color\[1\], sheen: color\[2\] \}\) : color \}\),/)
  assert.match(palette, /onClose: \(\) => setPreview\(null\),/)
  assert.match(palette, /const shown = preview\?\.index === index \? preview\.color : entry/)
  // 편집기 펜 색 창도 닫힐 때 미리보기를 거둔다
  const editor = read('../src/editor/screens/EditorScreen.js')
  assert.equal((editor.match(/colorPicker\.onClose\?\.\(\); setColorPicker\(null\)/g) || []).length, 2)
})

test('도트 스티커 디오&모아 윤곽선은 코코아 #5b3a29', () => {
  const stickers = read('../src/editor/builtinStickers.js')
  assert.equal((stickers.match(/\["#5b3a29"/g) || []).length, 24)
  assert.doesNotMatch(stickers, /#1c1c1c/i)
})
