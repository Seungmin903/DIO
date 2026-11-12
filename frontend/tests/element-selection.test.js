import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'
import * as text from '../src/editor/utils/text.js'
import * as reducer from '../src/editor/state/editorReducer.js'
import { pageSize } from '../src/editor/utils/pageGeometry.js'
import * as planners from '../src/editor/templates/planners.js'
import * as completedStrokePlan from '../src/editor/utils/completedStrokePlan.js'
import * as pageGrid from '../src/editor/utils/pageGrid.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/Canvas.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source + '\nexport { CanvasObject }', {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

// 실제 Canvas 입력 핸들러를 호출한다. OS의 터치 전달 자체는 검증 대상이 아니다.
function fixture(objects, selectedIds = [], zoom = 1, multi = false) {
  let handlers
  let state = { ...reducer.createInitialState({ pages: [{ id: 'page', objects }] }), selectedIds }
  const actions = []
  const dispatch = (action) => { actions.push(action); state = reducer.editorReducer(state, action) }
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { forwardRef: fn => fn, memo: fn => fn, useImperativeHandle() {}, useRef: (current) => ({ current }), useState: (value) => [value, () => {}], useEffect() {}, useLayoutEffect() {}, useMemo: fn => fn() }
    if (id === 'react-native') return { View: 'view', Text: 'text', Pressable: 'pressable', Keyboard: { dismiss() {} }, Platform: { OS: 'android', select: (options) => options.default }, StyleSheet: { create: (value) => value } }
    if (id.endsWith('/usePageReadiness.js')) return { usePageReadiness: () => ({ pageReady: true, generation: {}, setReadyPage() {} }) }
    if (id.endsWith('/usePan')) return { usePan: (value) => { handlers = value; return {} } }
    if (id.endsWith('/useProgressiveNativePage.js')) return { useProgressiveNativePage: () => true }
    if (id.endsWith('/editorReducer')) return reducer
    if (id.endsWith('/common')) return common
    if (id.endsWith('/text')) return text
    if (id.endsWith('/modifiers')) return { isMultiSelectKey: () => multi }
    if (id.endsWith('/pageGeometry.js')) return { pageSize }
    if (id.endsWith('/planners.js')) return planners
    if (id.endsWith('/completedStrokePlan.js')) return completedStrokePlan
    if (id.endsWith('/pageGrid.js')) return pageGrid
    if (id.endsWith('/theme')) return { colors: {}, radius: { lg: 12 }, shadow: {} }
    if (id.endsWith('/constants')) return { PHOTO_SHAPES: [] }
    if (id.endsWith('/objects')) return {}
    if (id.endsWith('/backdrop.js')) return { isBackdrop: (object) => object?.backdrop === true }
    if (id.endsWith('/GridOverlay')) return { __esModule: true, default: () => null, DEFAULT_GUIDES: { grid: 'none' }, hasGuides: () => false }
    if (id.startsWith('.')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return {
    actions, state: () => state,
    background: () => { module.exports.default({ page: state.doc.pages[0], zoom, selectedIds, dispatch }); return handlers },
    object: (object) => {
      module.exports.CanvasObject({ object, live: { current: { objects, selectedIds, onEditText() {} } }, pageWidth: 1188, pageHeight: 840, zoom, dispatch, onGuides() {}, onInteracting() {} })
      return handlers
    },
  }
}
const object = (id, type = 'stroke', extra = {}) => ({ id, type, x: 100, y: 100, w: 30, h: 30, rotation: 0, ...extra })

test('필기·텍스트·사진·스티커가 같은 배율 좌표로 이동하고 잠금·숨김 요소는 유지된다', () => {
  for (const zoom of [0.5, 1, 2.5]) {
    const objects = ['stroke', 'text', 'photo', 'sticker'].map((type, i) => object(type, type, { x: 100 + i * 100 }))
    objects.push(object('locked', 'stroke', { locked: true }), object('hidden', 'stroke', { hidden: true }))
    const f = fixture(objects, objects.map((o) => o.id), zoom)
    const input = f.object(objects[0])
    input.onStart({ locationX: 15 * zoom, locationY: 15 * zoom })
    input.onMove(37 * zoom, 29 * zoom)
    input.onEnd({ moved: true, duration: 100 })
    for (const moved of f.state().doc.pages[0].objects) {
      const start = objects.find((o) => o.id === moved.id)
      assert.equal(moved.x, start.x + (moved.locked || moved.hidden ? 0 : 37))
      assert.equal(moved.y, start.y + (moved.locked || moved.hidden ? 0 : 29))
    }
    assert.equal(f.state().past.length, 1)
  }
})

test('단일 선택·수정키 다중 선택·빈 곳 해제는 문서와 작업 이력을 변경하지 않는다', () => {
  const a = object('a'), b = object('b', 'text', { x: 300 })
  for (const multi of [false, true]) {
    const f = fixture([a, b], ['a'], 1, multi)
    const input = f.object(b)
    input.onStart({ locationX: 15, locationY: 15 })
    input.onEnd({ moved: false, duration: 10 })
    assert.deepEqual(f.state().selectedIds, multi ? ['a', 'b'] : ['b'])
    assert.equal(f.state().past.length, 0)
  }
  const f = fixture([a, b], ['a'])
  const input = f.background()
  input.onStart({ locationX: 800, locationY: 600 })
  input.onEnd({ cancelled: false })
  assert.deepEqual(f.state().selectedIds, [])
  assert.equal(f.state().past.length, 0)
})

test('영역 선택 도중 두 손가락 조작으로 취소하면 이전 다중 선택을 복원한다', () => {
  const f = fixture([object('a', 'text'), object('b', 'text', { x: 300 })], ['b'])
  const input = f.background()
  input.onStart({ locationX: 80, locationY: 80 })
  input.onMove(80, 80)
  assert.deepEqual(f.state().selectedIds, ['a'])
  input.onEnd({ cancelled: true })
  assert.deepEqual(f.state().selectedIds, ['b'])
  assert.equal(f.state().past.length, 0)
})

test('일반 영역 선택은 미선택 필기 획을 제외하고 텍스트만 선택한다', () => {
  const f = fixture([object('stroke'), object('text', 'text', { x: 160 })])
  const input = f.background()
  input.onStart({ locationX: 80, locationY: 80 })
  input.onMove(140, 100)
  input.onEnd({ cancelled: false })
  assert.deepEqual(f.state().selectedIds, ['text'])
  assert.equal(f.state().past.length, 0)
})

test('길게 누르기로 다중 선택에 추가하고 같은 요소를 다시 길게 누르면 제외한다', () => {
  const a = object('a'), b = object('b', 'text', { x: 300 })
  for (const ids of [['a'], ['a', 'b']]) {
    const f = fixture([a, b], ids)
    const input = f.object(b)
    input.onStart({ locationX: 15, locationY: 15 })
    input.onEnd({ moved: false, duration: 500 })
    assert.deepEqual(f.state().selectedIds, ids.length === 1 ? ['a', 'b'] : ['a'])
    assert.equal(f.state().past.length, 0)
  }
})

test('묶음 선택으로 숨김 요소 ID가 포함되어도 숨김 요소의 좌표를 이동하지 않는다', () => {
  const a = object('a', 'stroke', { groupId: 'group' })
  const hidden = object('hidden', 'text', { hidden: true, groupId: 'group' })
  const f = fixture([a, hidden])
  const input = f.object(a)
  input.onStart({ locationX: 15, locationY: 15 })
  input.onMove(50, 40)
  input.onEnd({ moved: true, duration: 100 })
  assert.deepEqual(f.state().doc.pages[0].objects[1], hidden)
  assert.equal(f.state().doc.pages[0].objects[0].x, 150)
})
