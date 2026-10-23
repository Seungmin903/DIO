import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'
import * as pen from '../src/editor/utils/penSettings.js'
import * as formats from '../src/editor/utils/textFormats.js'
import * as text from '../src/editor/utils/text.js'
import * as placement from '../src/editor/utils/popoverPlacement.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/ContextBar.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture(object) {
  let state = createInitialState({ pages: [{ id: 'page', objects: [object] }] })
  const events = [], module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { useState: (value) => [value, () => {}] }
    if (id === 'react-native') return { View: 'view', Text: 'text', Pressable: 'button', ScrollView: 'scroll', StyleSheet: { create: (s) => s } }
    if (id.endsWith('/common')) return common
    if (id.endsWith('/popoverPlacement')) return placement
    if (id.endsWith('/penSettings')) return pen
    if (id.endsWith('/text')) return text
    if (id.endsWith('/textFormats')) return formats
    if (id === '../TextActionBar') {
      const m = { exports: {} }
      const compiled = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextActionBar.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
      new Function('require', 'module', 'exports', compiled.code)(load, m, m.exports)
      return m.exports
    }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/constants')) return { PAGE_WIDTH: 1280, PAGE_HEIGHT: 800 }
    if (id.startsWith('.')) return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const root = module.exports.default({ objects: [object], allObjects: [object], zoom: 1,
    dispatch: (action) => { state = editorReducer(state, action) },
    onEditText: (o) => events.push(['edit', o.id]), onTextSettings: () => events.push(['settings']),
    onCopy: (objects) => events.push(['copy', objects[0].id]), onCut: (objects) => events.push(['cut', objects[0].id]),
    onToggleMore: () => events.push(['more']),
    onCopyText: (value) => events.push(['copyText', value]), onTextLink: (o) => events.push(['link', o.id]),
  })
  const nodes = []
  function walk(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(walk); return }
    if (typeof value.type === 'function') { walk(value.type(value.props)); return }
    nodes.push(value); walk(value.props?.children)
  }
  walk(root)
  return { state: () => state, events, nodes, press: (label) => {
    const node = nodes.find((n) => n.props?.accessibilityLabel === label)
    assert.ok(node, label); node.props.onPress()
  } }
}

test('텍스트 바는 빠른 색·글씨 크기 대신 서식 창을 열어 색·크기·자간 등을 바꾼다', () => {
  const original = text.createText({ id: 'text', x: 100, y: 100, text: '한글 편집', colorRanges: [{ start: 0, end: 2, color: '#DD887A' }] })
  const f = fixture(original)
  assert.ok(!f.nodes.some((n) => String(n.props?.accessibilityLabel ?? '').startsWith('선택 요소 색상')))
  assert.ok(!f.nodes.some((n) => n.props?.accessibilityLabel === '글씨 확대'))
  f.press('서식')
  assert.deepEqual(f.events, [['settings']])
})

test('텍스트 바는 서식·링크·복제·삭제를 연결한다', () => {
  const original = text.createText({ id: 'text', x: 100, y: 100, text: '한글', fontSize: 28 })
  const f = fixture(original)
  assert.ok(!f.nodes.some(n => n.props?.accessibilityLabel === '복사'))
  f.press('링크')
  assert.deepEqual(f.events, [['link', 'text']])
  f.press('복제')
  const [source, copy] = f.state().doc.pages[0].objects
  assert.notEqual(copy.id, source.id)
  for (const key of ['type', 'text', 'fontSize', 'color', 'w', 'h', 'rotation']) assert.equal(copy[key], source[key], key)
  assert.ok(copy.x !== source.x || copy.y !== source.y)
  assert.deepEqual(f.state().selectedIds, [copy.id])
  assert.equal(editorReducer(f.state(), { type: 'undo' }).doc.pages[0].objects.length, 1)
  const removed = fixture(original)
  removed.press('삭제')
  assert.equal(removed.state().doc.pages[0].objects.length, 0)
  assert.equal(editorReducer(removed.state(), { type: 'undo' }).doc.pages[0].objects[0].text, '한글')
  assert.ok(!f.nodes.some(n => n.props?.accessibilityLabel === '내용 편집'))
})

test('획 색상만 바꾸고 종류·좌표는 보존하며 잠금·사진은 기존 편집 바를 유지한다', () => {
  const stroke = { id: 'stroke', type: 'stroke', x: 10, y: 20, w: 200, h: 40, rotation: 30, penKind: 'highlighter' }
  const f = fixture(stroke)
  assert.equal(f.nodes.filter(n => n.props?.accessibilityLabel === '복제').length, 1)
  // 필기 바에는 글자 수정이 없고, 요소 복사·붙여넣기(복사한 게 없으면 꺼짐)가 있다
  assert.ok(!f.nodes.some(n => n.props?.accessibilityLabel === '수정'))
  assert.equal(f.nodes.find(n => n.props?.accessibilityLabel === '붙여넣기')?.props.disabled, true)
  assert.ok(!f.nodes.some(n => n.props?.children === '펜 선'))
  f.press(`선택 요소 색상 ${pen.EDITOR_COLORS[0]}`)
  assert.deepEqual(f.state().doc.pages[0].objects[0], { ...stroke, color: pen.EDITOR_COLORS[0] })
  for (const object of [{ ...stroke, locked: true }, { ...stroke, type: 'photo' }]) {
    assert.ok(!fixture(object).nodes.some((n) => n.props?.accessibilityLabel === '필기 빠른 편집'))
  }
})
