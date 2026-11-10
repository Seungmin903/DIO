import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('다이어리 만들기 · 수정 옵션 패널은 키보드가 가린 만큼 아래를 비우고 입력 중인 칸을 키보드 위로 올린다(소스 확인)', () => {
  const source = readFileSync(new URL('../src/diary/components/Workbench.js', import.meta.url), 'utf8')
  assert.match(source, /Keyboard\.addListener\('keyboardDidShow'/)
  assert.match(source, /setKeyboardPad\(Math\.max\(0, Math\.round\(y \+ h - keyboardTop\.current\)\)\)/)
  assert.match(source, /TextInput\.State\?\.currentlyFocusedInput\?\.\(\)/)
  assert.match(source, /keyboardPad > 0 && \{ paddingBottom: 16 \+ keyboardPad \}/)
})
