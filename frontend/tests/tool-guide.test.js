import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDE_CYCLE_MS, toolGuideFrame } from '../src/editor/utils/toolGuide.js'

const modes = ['stroke', 'area', 'rectangle', 'freeform']

test('획 지우기는 지나간 경로에 닿은 획부터 통째로 숨긴다', () => {
  assert.deepEqual(toolGuideFrame('stroke', 450).hiddenStrokes, [false, false, false])
  assert.deepEqual(toolGuideFrame('stroke', 900).hiddenStrokes, [true, false, false])
  assert.deepEqual(toolGuideFrame('stroke', 1225).hiddenStrokes, [true, true, false])
  assert.deepEqual(toolGuideFrame('stroke', 1600).hiddenStrokes, [true, true, true])
  // 지나간 획은 결과를 보여 주는 동안에도 사라진 상태를 유지한다.
  assert.deepEqual(toolGuideFrame('stroke', GUIDE_CYCLE_MS - 1).hiddenStrokes, [true, true, true])
})

test('자유형 올가미는 그리는 동안 열려 있고 완료 시 시작점으로 닫힌다', () => {
  assert.equal(toolGuideFrame('freeform', 450).selection, '')
  assert.ok(!toolGuideFrame('freeform', 1999).selection.endsWith(' Z'))
  const completed = toolGuideFrame('freeform', 2000)
  assert.ok(completed.selection.startsWith('M46.00 78.00 '))
  assert.ok(completed.selection.endsWith('L46.00 78.00 Z'))
  assert.equal(completed.done, true)
  assert.equal(completed.cursorVisible, false)
})

test('동작 줄이기는 모든 모드에서 시간과 관계없이 커서 없는 완료 결과를 보여 준다', () => {
  for (const mode of modes) {
    const result = toolGuideFrame(mode, 2500)
    assert.equal(result.done, true)
    assert.equal(result.cursorVisible, false)
    for (const elapsed of [0, 900, GUIDE_CYCLE_MS, GUIDE_CYCLE_MS * 2 + 1225]) {
      assert.deepEqual(toolGuideFrame(mode, elapsed, true), result)
    }
  }
})

test('반복 경계에서 삭제·선택 결과를 초기화하고 같은 시점의 안내를 재현한다', () => {
  for (const mode of modes) {
    const initial = toolGuideFrame(mode, 0)
    assert.equal(initial.done, false)
    assert.equal(initial.cursorVisible, false)
    assert.deepEqual(initial.hiddenStrokes, [false, false, false])
    assert.equal(initial.cut, '')
    assert.equal(initial.selection, '')
    assert.deepEqual(toolGuideFrame(mode, GUIDE_CYCLE_MS), initial)
    assert.deepEqual(toolGuideFrame(mode, GUIDE_CYCLE_MS + 1225), toolGuideFrame(mode, 1225))
  }
})
