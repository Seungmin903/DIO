import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
function load(path, isPhone = true) {
  const code = expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => {
    if (id.endsWith('/useFormFactor')) return { useFormFactor: () => ({ isPhone }) }
    if (id === 'react') return { Fragment: Symbol.for('react.fragment'), memo: fn => fn, useState: value => [typeof value === 'function' ? value() : value, () => {}], useRef: value => ({current:value}), useEffect: () => {} }
    if (id === 'react-native') return { FlatList: 'list', Modal: 'modal', Pressable: 'button', Text: 'text', View: 'view', StyleSheet: { create: value => value } }
    if (id === 'react-native-safe-area-context') return { SafeAreaView: 'safe-area' }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/pageGeometry.js')) return { pageSize: () => ({ width: 1280, height: 800 }) }
    if (id.endsWith('/EditorModal')) return { __esModule: true, default: 'modal' }
    if (id.endsWith('/ToolPanel')) return { PANEL_RADIUS: 20 }
    if (id.endsWith('/usePan')) return { usePan: () => ({}) }
    if (id.endsWith('/common')) return { clamp: (v,a,b) => Math.min(b,Math.max(a,v)) }
    if (id.endsWith('/PenSafeTextInput')) return { __esModule:true, default:'input' }
    if (id.endsWith('/StaticPage') || id.endsWith('/Icon') || id.endsWith('/PageBulkDelete')) return { __esModule:true, default: 'mock' }
    return require(id)
  }, module, module.exports)
  return module.exports.default
}
function all(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(all)]
}
test('페이지 넓게 보기는 안전 영역 모달로 열리고 닫기와 시스템 종료 요청을 처리한다', () => {
  const Overview = load('../src/editor/components/panels/PageOverview.js')
  let closed = 0
  const tree = Overview({pages:[],currentId:'p',onClose:()=>closed++})
  assert.equal(tree.type, 'modal')
  assert.equal(tree.props.visible, true)
  assert.ok(all(tree).some(n=>n.type === 'safe-area' && Object.assign({}, ...n.props.style.filter(Boolean)).flex === 1))
  tree.props.onRequestClose()
  all(tree).find(n=>n.props?.accessibilityLabel === '넓게 보기 닫기').props.onPress()
  assert.equal(closed, 2)
})
test('슬라이더 숫자는 단위와 폰 · 태블릿에 상관없이 가운데 정렬한다', () => {
  for (const phone of [true, false]) {
    const Slider = load('../src/editor/components/controls/Slider.js', phone)
    for (const unit of ['', '°', '%']) {
      const input = all(Slider({value:10,min:0,max:100,step:1,onChange:()=>{},unit})).find(n=>n.type === 'input')
      assert.equal(Object.assign({}, ...[input.props.style].flat().filter(Boolean)).textAlign, 'center')
    }
  }
})


test('태블릿은 기존 View 오버레이를 유지한다', () => {
  const Overview = load('../src/editor/components/panels/PageOverview.js', false)
  const tree = Overview({pages:[],currentId:'p',onClose:()=>{}})
  assert.equal(tree.type, 'view')
  const backdrop = Object.assign({}, ...tree.props.style.filter(Boolean))
  assert.equal(backdrop.padding, 24)
})
