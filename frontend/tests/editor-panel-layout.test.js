import test from 'node:test'
import assert from 'node:assert/strict'
import { editorPanelLayout } from '../src/editor/utils/panelLayout.js'

test('좁은 창과 세로 태블릿은 패널 하나만 표시하고 닫힌 채 시작한다', () => {
  for (const [width, compact, landscape] of [[599, true, false], [600, false, false], [839, false, true], [1024, false, false]])
    assert.deepEqual(editorPanelLayout(width, compact, landscape), { initialOpen: false, singlePanel: true })
})

test('충분히 넓은 가로 태블릿은 두 패널을 사용할 수 있다', () => {
  assert.deepEqual(editorPanelLayout(840, false, true), { initialOpen: true, singlePanel: false })
})
