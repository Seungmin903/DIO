import test from 'node:test'
import assert from 'node:assert/strict'
import { createToolSwitcher, pencilTapTool, rememberTool, sideButtonTool } from '../src/editor/utils/pencilDoubleTap.js'

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

test('S펜 사이드버튼을 누르는 동안 지우개, 떼면 누르기 전 펜으로 돌아온다', () => {
  let step = sideButtonTool(true, 'highlighter')
  assert.deepEqual(step, { tool: 'eraser', hold: 'highlighter' })
  step = sideButtonTool(false, 'eraser', step.hold)
  assert.deepEqual(step, { tool: 'highlighter', hold: null })
})

test('사이드버튼을 누른 동안 다른 도구를 고르면 떼도 돌아가지 않는다', () => {
  const { hold } = sideButtonTool(true, 'pen')
  assert.deepEqual(sideButtonTool(false, 'pen', hold), { tool: null, hold: null })
  assert.deepEqual(sideButtonTool(false, 'select', hold), { tool: null, hold: null })
})

test('이미 지우개거나 그리기 도구가 아니면 사이드버튼은 도구를 바꾸지 않는다', () => {
  assert.deepEqual(sideButtonTool(true, 'eraser'), { tool: null, hold: null })
  assert.deepEqual(sideButtonTool(false, 'eraser'), { tool: null, hold: null })
  for (const tool of ['select', 'lasso', 'text', 'hand']) assert.deepEqual(sideButtonTool(true, tool), { tool: null, hold: null })
})

test('사이드버튼 신호가 겹쳐 와도 누르기 전 펜을 잃지 않는다', () => {
  const first = sideButtonTool(true, 'pen')
  const again = sideButtonTool(true, 'eraser', first.hold)
  assert.deepEqual(sideButtonTool(false, 'eraser', again.hold), { tool: 'pen', hold: null })
})

test('누르는 동안 지우개를 직접 다시 골라 hold 가 비워지면 떼도 지우개로 남는다', () => {
  sideButtonTool(true, 'pen')
  assert.deepEqual(sideButtonTool(false, 'eraser', null), { tool: null, hold: null })
})

const switcherOn = (tool) => {
  const calls = []
  const switcher = createToolSwitcher((next, previous) => calls.push([next, previous]), tool)
  return { switcher, calls }
}

test('도구 전환 창구: 누름·뗌이 리렌더 없이 연달아 와도 원래 펜으로 돌아오고 이전 도구를 바르게 넘긴다', () => {
  const { switcher, calls } = switcherOn('pen')
  switcher.sideButton(true)
  switcher.sideButton(false)
  assert.deepEqual(calls, [['eraser', 'pen'], ['pen', 'eraser']])
})

test('도구 전환 창구: 누르는 동안 툴바로 지우개를 다시 고르면 떼도 지우개로 남는다', () => {
  const { switcher, calls } = switcherOn('pen')
  switcher.sideButton(true)
  switcher.select('eraser')
  switcher.sideButton(false)
  assert.deepEqual(calls, [['eraser', 'pen'], ['eraser', 'eraser']])
})

test('도구 전환 창구: 누르는 동안 다른 도구를 고르면 떼도 되돌리지 않는다', () => {
  const { switcher, calls } = switcherOn('highlighter')
  switcher.sideButton(true)
  switcher.select('select')
  switcher.sideButton(false)
  assert.deepEqual(calls, [['eraser', 'highlighter'], ['select', 'eraser']])
})

test('도구 전환 창구: 누름은 무시해도 뗌은 처리해 임시 지우개가 남지 않는다', () => {
  const { switcher, calls } = switcherOn('pen')
  switcher.sideButton(true)
  switcher.sideButton(true, { ignorePress: true })
  switcher.sideButton(false, { ignorePress: true })
  assert.deepEqual(calls, [['eraser', 'pen'], ['pen', 'eraser']])
  switcher.sideButton(true, { ignorePress: true })
  assert.equal(calls.length, 2)
})

test('도구 전환 창구: 렌더가 알려 준 도구(sync)를 이전 도구로 쓴다', () => {
  const { switcher, calls } = switcherOn('select')
  switcher.sync('highlighter')
  switcher.sideButton(true)
  assert.deepEqual(calls, [['eraser', 'highlighter']])
})
