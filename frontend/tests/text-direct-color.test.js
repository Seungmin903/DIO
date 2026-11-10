import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('824: 글자 색 팔레트도 펜 · 형광펜처럼 끝에 점선 + 칸(직접 지정)을 두고, 같은 색 창을 편집기 위층에 띄운다', () => {
  const settings = read('src/editor/components/TextSettings.js')
  assert.match(settings, /<EditablePalette allowDirect scope="text" label="글자" value=\{settings\.color\} onPick=\{color => onChange\(\{color\}\)\} onOpenEditor=\{onOpenColorPicker\} \/>/)
  assert.match(settings, /export default function TextSettings\(\{[^}]*onOpenColorPicker \}\)/)
  const screen = read('src/editor/screens/EditorScreen.js')
  // 펜 · 글자가 같은 열기 함수를 쓴다(도구 · 페이지 · 창 폭이 바뀌면 닫힌다)
  assert.match(screen, /const openColorPicker = \(request, source\) => setColorPicker\(\{ \.\.\.request, source, tool: activeTool, pageId: page\.id, screen: \{ width: colorScreen\.width, height: colorScreen\.height \} \}\)/)
  assert.equal(screen.match(/<TextSettings onOpenColorPicker=\{\(request\) => openColorPicker\(request, 'text'\)\}/g)?.length, 2) // 요소 옆 · 하단 시트 두 자리
  assert.match(screen, /<PenSettings onOpenColorPicker=\{\(request\) => openColorPicker\(request, 'pen'\)\}/)
  // 색 창을 연 패널이 닫히면 색 창도 닫힌다(리뷰 !511)
  assert.match(screen, /const panelClosed = \(colorPicker\?\.source === 'text' && !textSettingsOpen\) \|\| \(colorPicker\?\.source === 'pen' && !penSettingsOpen\)/)
  assert.match(screen, /if \(colorPicker && \(panelClosed \|\| readOnly/)
  assert.match(screen, /colorScreen\.height, textSettingsOpen, penSettingsOpen\]\)/)
  // 직접 지정 칸은 공용 팔레트가 그린다: 점선 원 + 더하기, 화면 읽기 이름 '글자 색 직접 지정'
  const palette = read('src/editor/components/controls/EditablePalette.js')
  assert.match(palette, /\{allowDirect && <Pressable accessibilityRole="button" accessibilityLabel=\{`\$\{label\} 색 직접 지정`\}/)
})
