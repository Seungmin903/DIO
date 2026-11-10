import test from 'node:test'
import assert from 'node:assert/strict'
import { pencilTapTool, rememberTool } from '../src/editor/utils/pencilDoubleTap.js'

const historyOf = (...tools) => tools.reduce(rememberTool, {})

test('기본 설정(지우개로 전환)이면 펜과 지우개를 오간다', () => {
  assert.equal(pencilTapTool('switchEraser', 'pen', historyOf('pen')), 'eraser')
  assert.equal(pencilTapTool('switchEraser', 'eraser', historyOf('pen', 'eraser')), 'pen')
})

test('형광펜에서 지우개로 갔다가 다시 형광펜으로 돌아온다', () => {
  assert.equal(pencilTapTool('switchEraser', 'highlighter', historyOf('highlighter')), 'eraser')
  assert.equal(pencilTapTool('switchEraser', 'eraser', historyOf('highlighter', 'eraser')), 'highlighter')
})

test('펜 기록이 없으면 지우개에서 펜으로 돌아온다', () => {
  assert.equal(pencilTapTool('switchEraser', 'eraser', historyOf('eraser')), 'pen')
})

test('이중 탭을 끈 설정이면 아무것도 바꾸지 않는다', () => {
  assert.equal(pencilTapTool('ignore', 'pen', historyOf('pen')), null)
})

test('이전 도구 설정이면 바로 전 그리기 도구로 간다', () => {
  assert.equal(pencilTapTool('switchPrevious', 'highlighter', historyOf('pen', 'highlighter')), 'pen')
  assert.equal(pencilTapTool('switchPrevious', 'pen', historyOf('select', 'pen')), null)
})

test('DIO 에 없는 동작(색상 팔레트 등)은 펜 ↔ 지우개로 처리한다', () => {
  assert.equal(pencilTapTool('showColorPalette', 'pen', historyOf('pen')), 'eraser')
  assert.equal(pencilTapTool(undefined, 'pen', historyOf('pen')), 'eraser')
})

test('그리기 도구가 아니면 무시한다', () => {
  for (const tool of ['select', 'lasso', 'text', 'hand']) assert.equal(pencilTapTool('switchEraser', tool, historyOf(tool)), null)
})
