import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as eraser from '../src/editor/utils/eraser.js'
import { createStroke } from '../src/editor/utils/strokes.js'

const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const { code } = fromExpo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/EraserInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function input(zoom = 1, diameter, props = {}) {
  let handlers
  const actions = [], previews = []
  const module = { exports: {} }
  const load = (name) => {
    if (name === 'react-native') return { StyleSheet: { create: (style) => style }, View: ({ children }) => React.createElement('div', null, children) }
    if (name === '../../shared/theme') return { colors: {} }
    if (name === '../hooks/usePan') return { usePan: (value) => { handlers = value; return {} } }
    if (name === '../utils/eraser.js') return eraser
    if (name === '../utils/penPerformance.js') return { startPenMeasurement: () => null }
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  renderToStaticMarkup(React.createElement(module.exports.default, {
    zoom, diameter, objects: [createStroke([{ x: 100, y: 50 }, { x: 100, y: 150 }], { id: 'stroke', width: 2 })],
    dispatch: (action) => actions.push(action), onPreview: (ids) => previews.push(ids), ...props,
  }))
  return { handlers, actions, previews, interval: module.exports.eraserPreviewInterval }
}
test('영역 지우기 미리보기 간격은 iOS 태블릿과 폰을 구분한다', () => {
  const { interval } = input()
  assert.equal(interval('ios', false), 64)
  assert.equal(interval('ios', true), 32)
  assert.equal(interval('android', false), 32)
  assert.equal(interval('web', true), 32)
})
test('실제 지우개 입력 핸들러는 화면 배율을 환산하고 확정 전에는 삭제하지 않는다', () => {
  for (const zoom of [0.5, 1, 2.5]) {
    const { handlers, actions, previews } = input(zoom)
    handlers.onStart({ locationX: 20 * zoom, locationY: 100 * zoom })
    handlers.onMove(160 * zoom, 0, {})
    assert.deepEqual(previews.at(-1), ['stroke'])
    assert.deepEqual(actions, [])
    handlers.onEnd({ cancelled: false })
    handlers.onEnd({ cancelled: false })
    assert.deepEqual(actions, [{ type: 'removeObjects', ids: ['stroke'] }])
    assert.deepEqual(previews.at(-1), [])
  }
})
test('두 손가락 진입과 responder 취소는 후보를 버리고 문서를 보존한다', () => {
  for (const multiTouch of [false, true]) {
    const { handlers, actions, previews } = input()
    handlers.onStart({ locationX: 100, locationY: 100 })
    assert.deepEqual(previews.at(-1), ['stroke'])
    if (multiTouch) handlers.onMove(0, 0, { touches: [{}, {}] })
    handlers.onEnd({ cancelled: !multiTouch })
    assert.deepEqual(actions, [])
    assert.deepEqual(previews.at(-1), [])
  }
})
test('우클릭·다중 터치 시작·빈 곳 입력은 삭제 이력을 만들지 않는다', () => {
  for (const event of [{ button: 2 }, { touches: [{}, {}] }, { locationX: 500, locationY: 500 }]) {
    const { handlers, actions } = input()
    handlers.onStart(event)
    handlers.onEnd({ cancelled: false })
    assert.deepEqual(actions, [])
  }
})

test('크기 설정은 실제 삭제 반경에 반영되고 확대 상태에서도 같은 논리 범위를 사용한다', () => {
  for (const zoom of [0.5, 1, 2.5]) {
    for (const [diameter, expected] of [[24, []], [48, [{ type: 'removeObjects', ids: ['stroke'] }]]]) {
      const { handlers, actions } = input(zoom, diameter)
      handlers.onStart({ locationX: 80 * zoom, locationY: 100 * zoom })
      handlers.onEnd({ cancelled: false })
      assert.deepEqual(actions, expected)
    }
  }
})


test('플래너 지우기와 일반 획 삭제는 한 action으로 확정하고 취소 시 둘 다 버린다', () => {
  for (const cancelled of [false, true]) {
    const original = { cells: { a: '#123456' } }, erased = { cells: {} }, drafts = []
    const f = input(1, 24, { planner: original, onPlannerErase: () => erased, onPlannerPreview: value => drafts.push(value) })
    f.handlers.onStart({ locationX: 100, locationY: 100 })
    assert.deepEqual(f.actions, [])
    f.handlers.onEnd({ cancelled })
    f.handlers.onEnd({ cancelled })
    assert.deepEqual(f.actions, cancelled ? [] : [{ type: 'setPlanner', planner: erased, after: { type: 'removeObjects', ids: ['stroke'] } }])
    assert.equal(drafts.at(-1), null)
  }
})


test('대상 선택은 실제 입력 세션에 전달되고 선택 지우기에서 플래너 기록은 보존된다', () => {
  for (const mode of ['stroke', 'area']) for (const target of ['pen', 'highlighter']) {
    let plannerCalls = 0
    const original = { cells: { a: '#123456' } }
    const f = input(1, 24, { mode, target, planner: original,
      onPlannerErase: () => { plannerCalls++; return { cells: {} } } })
    f.handlers.onStart({ locationX: 100, locationY: 100 })
    f.handlers.onEnd({ cancelled: false })
    assert.equal(plannerCalls, 0)
    assert.equal(f.actions.length, target === 'pen' ? 1 : 0)
    if (target === 'pen') assert.equal(f.actions[0].type, mode === 'area' ? 'replaceObjects' : 'removeObjects')
  }
})
