import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

// Exercise the actual shared screen handler; setters model the next render.
const source = readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8')
const start = source.indexOf('  const selectTool = (tool) => {')
const end = source.indexOf('  const openExport =', start)
assert.ok(start >= 0 && end > start)
const handler = source.slice(start, end)
function fixture(activeTool = 'hand') {
  const state = { activeTool, penSettingsOpen: false, lassoSettingsOpen: false,
    textSettingsOpen: false, shapeSettingsOpen: false, guidesOpen: false,
    cropId: null, tapeCropId: null, drawerTab: null, moreOpen: false }
  const events = []
  const context = { ...state, dispatch: action => events.push(action),
    finishCrop: () => events.push('finishCrop'), closeBubbles() {},
    setTextEditing() {}, setLasso() {},
    // 도구 선택이 함께 닫는 사진 패널과 도구 전환 측정(핸들러가 부르는 외부 동작)
    closePhotoPanel() {},
    toolChangeMeasurement: { current: null }, startPagePanelMeasurement: () => ({ dispose() {} }),
    page: { objects: [] }, state: { doc: { pages: [] } } }
  for (const key of Object.keys(state)) {
    context[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { state[key] = value }
  }
  return { state, events, press(tool) {
    Object.assign(context, state)
    runInNewContext(`${handler}\nselectTool(requestedTool)`, { ...context, requestedTool: tool })
  } }
}

for (const tool of ['pen', 'highlighter', 'eraser']) test(`${tool}: 선택 → 설정 열기 → 닫기 → 다시 열기`, () => {
  const f = fixture()
  f.press(tool)
  assert.equal(f.state.activeTool, tool)
  assert.equal(f.state.penSettingsOpen, false, '첫 선택은 설정 창 없이 즉시 사용')
  assert.equal(f.events[0].type, 'select')
  assert.equal(f.events[0].ids.length, 0, '기존 선택 해제 동작 유지')
  f.press(tool)
  assert.equal(f.state.penSettingsOpen, true)
  f.press(tool)
  assert.equal(f.state.penSettingsOpen, false)
  assert.equal(f.state.activeTool, tool)
  f.press(tool)
  assert.equal(f.state.penSettingsOpen, true)
})

test('다른 도구로 전환하면 기존 설정을 닫고, 새 도구를 다시 눌러야 설정이 열린다', () => {
  const f = fixture('pen')
  for (const tool of ['highlighter', 'eraser', 'pen']) {
    f.state.penSettingsOpen = true
    f.press(tool)
    assert.equal(f.state.activeTool, tool)
    assert.equal(f.state.penSettingsOpen, false)
    f.press(tool)
    assert.equal(f.state.penSettingsOpen, true)
  }
  f.press('hand')
  assert.equal(f.state.activeTool, 'hand')
  assert.equal(f.state.penSettingsOpen, false)
})

test('텍스트 도구는 처음 눌러도 다시 눌러도 기본값 서식 창을 열지 않고(S15P31F106-482), 올가미 설정 동작은 유지하며 펜 설정은 닫는다', () => {
  const f = fixture('pen')
  f.state.penSettingsOpen = true
  f.press('text')
  assert.equal(f.state.textSettingsOpen, false, '처음 고를 때는 창이 뜨지 않는다')
  assert.equal(f.state.penSettingsOpen, false)
  f.state.activeTool = 'text'
  f.press('text')
  assert.equal(f.state.textSettingsOpen, false, '고른 도구를 다시 눌러도 열지 않는다 — 서식은 키보드 위 줄 · 선택 바의 서식이 맡는다')
  f.state.activeTool = 'text'; f.state.textSettingsOpen = true
  f.press('text')
  assert.equal(f.state.textSettingsOpen, false, '열려 있던 창은 닫는다')
  f.press('lasso')
  assert.equal(f.state.lassoSettingsOpen, true)
  assert.equal(f.state.textSettingsOpen, false)
})
