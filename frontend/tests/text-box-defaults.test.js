import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('857: 기존 글상자 · 도형의 서식을 고쳐도 새 글상자 기본값은 그대로이고, 글 도구 창에서 정할 때만 바뀐다', () => {
  const screen = read('src/editor/screens/EditorScreen.js')
  assert.equal(screen.match(/setTextDefaults\(/g)?.length, 1)
  assert.match(screen, /if \(!textEditing && !selectedText\) setTextDefaults\(next\)/)
  // 새 글상자는 저장된 기본값으로 시작한다
  assert.match(screen, /setTextEditing\(\{ \.\.\.textDefaults, \.\.\.box, id: createId\(\), pageId: page\.id, text: '' \}\)/)
})
