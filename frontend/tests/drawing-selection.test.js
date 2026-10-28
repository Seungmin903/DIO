import test from 'node:test'
import assert from 'node:assert/strict'
import { installDrawingSelectionGuard } from '../src/editor/utils/drawingSelectionGuard.js'
import { createPenPointerInput } from '../src/editor/utils/penPointerInput.js'

test('그림 영역의 브라우저 선택·메뉴·드래그만 막고 글상자와 정리는 유지한다', () => {
  const listeners = new Map()
  const node = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const cleanup = installDrawingSelectionGuard(node)
  for (const name of ['selectstart', 'contextmenu', 'dragstart']) {
    let prevented = 0
    const event = { cancelable: true, target: { closest: () => false }, preventDefault: () => prevented++ }
    listeners.get(name)(event); assert.equal(prevented, 1)
    listeners.get(name)({ ...event, target: { closest: () => true } }); assert.equal(prevented, 1)
    listeners.get(name)({ ...event, cancelable: false }); assert.equal(prevented, 1)
  }
  cleanup(); assert.equal(listeners.size, 0)
  assert.doesNotThrow(() => installDrawingSelectionGuard(null)())
})

test('수용한 Pencil만 기본 동작과 이전 선택을 정리하고 필압·정상 확정을 유지한다', () => {
  let prevented = 0, cleared = 0, ended
  const samples = [], starts = []
  const pointer = createPenPointerInput(() => ({ onStart: e => starts.push(e), onMove: (_x, _y, e) => samples.push(e), onEnd: e => { ended = e } }))
  const event = { pointerId: 1, pointerType: 'pen', button: 0, offsetX: 10, offsetY: 20, clientX: 110, clientY: 120,
    pressure: 0.6, timeStamp: 1, cancelable: true, preventDefault: () => prevented++,
    currentTarget: { ownerDocument: { getSelection: () => ({ isCollapsed: false, removeAllRanges: () => cleared++ }) } } }
  pointer.handlers.onPointerDown({ ...event, pointerType: 'touch' })
  assert.equal(prevented, 0); assert.equal(cleared, 0)
  pointer.handlers.onPointerDown(event)
  assert.equal(prevented, 1); assert.equal(cleared, 1); assert.equal(starts[0].pressure, 0.6)
  pointer.handlers.onPointerMove({ ...event, pointerId: 2 }); assert.equal(prevented, 1)
  pointer.handlers.onPointerMove({ ...event, clientX: 115, pressure: 0.8, timeStamp: 2 })
  assert.equal(samples[0].pressure, 0.8); assert.equal(prevented, 2)
  pointer.handlers.onPointerUp({ ...event, clientX: 120, pressure: 0, timeStamp: 3 })
  assert.equal(prevented, 3); assert.deepEqual(ended, { cancelled: false }); assert.equal(pointer.active, false)
})

test('Safari가 캔버스 밖에 늦게 만든 선택을 정리하고 편집 필드·해제 후 선택은 보존한다', () => {
  const listeners = new Map(), rootListeners = new Map()
  let cleared = 0
  const normal = { closest: () => false }, field = { closest: () => true }
  const selection = { isCollapsed: false, anchorNode: { nodeType: 3, parentElement: normal }, focusNode: normal,
    removeAllRanges: () => { cleared++; selection.isCollapsed = true } }
  const doc = { activeElement: normal, getSelection: () => selection,
    addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const cleanup = installDrawingSelectionGuard({ ownerDocument: doc,
    addEventListener: (name, fn) => rootListeners.set(name, fn), removeEventListener: name => rootListeners.delete(name) })
  let prevented = 0
  listeners.get('selectstart')({ target: normal, cancelable: true, preventDefault: () => prevented++ })
  assert.equal(prevented, 1)
  listeners.get('selectionchange')(); assert.equal(cleared, 1)
  listeners.get('selectionchange')(); assert.equal(cleared, 1)
  selection.isCollapsed = false; doc.activeElement = field
  listeners.get('selectionchange')(); assert.equal(cleared, 1)
  doc.activeElement = normal; selection.anchorNode = { nodeType: 3, parentElement: field }
  listeners.get('selectionchange')(); assert.equal(cleared, 1)
  listeners.get('selectstart')({ target: field, cancelable: true, preventDefault: () => prevented++ })
  assert.equal(prevented, 1)
  cleanup(); assert.equal(listeners.size, 0); assert.equal(rootListeners.size, 0)
})

test('필기 중 주변 UI의 선택 시작을 CSS로 막고 모드 종료 시 스타일도 제거한다', () => {
  let attached = false, removed = false
  const sheet = { textContent: '', setAttribute() {}, remove() { removed = true } }
  const doc = { head: { appendChild: node => { assert.equal(node, sheet); attached = true } },
    createElement: tag => { assert.equal(tag, 'style'); return sheet }, addEventListener() {}, removeEventListener() {} }
  const cleanup = installDrawingSelectionGuard({ ownerDocument: doc, addEventListener() {}, removeEventListener() {} })
  assert.equal(attached, true)
  assert.match(sheet.textContent, /-webkit-user-select:none!important/)
  assert.match(sheet.textContent, /body input,body textarea/)
  assert.match(sheet.textContent, /user-select:text!important/)
  cleanup(); assert.equal(removed, true)
})
