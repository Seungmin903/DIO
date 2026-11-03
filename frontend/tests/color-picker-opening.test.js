import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as settings from '../src/editor/utils/penSettings.js'
import { colorPickerPlacement } from '../src/editor/utils/colorPickerPlacement.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function load(file, nativeView = {}) {
  let refs = 0
  const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/' + file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code
  const mocks = {
    react: { useRef: value => ({ current: refs++ === 0 ? nativeView : value }), useEffect() {}, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] },
    // RN 0.88 exposes absoluteFill only; the removed alias must not be mocked in.
    'react-native': { Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 390, height: 844 }), View: 'view', Pressable: 'pressable', Text: 'text', ScrollView: 'scroll', StyleSheet: { create: value => value, absoluteFill: { position:'absolute',left:0,right:0,top:0,bottom:0 } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({}) },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (mocks[id]) return mocks[id]
    if (id === 'react/jsx-runtime') return require(id)
    if (id.endsWith('/penSettings')) return settings
    if (id.endsWith('/useRecentPenColors')) return { useRecentPenColors: () => [] }
    if (id.endsWith('/usePalettes')) return { usePalette: () => ({ colors: settings.EDITOR_COLORS }) }
    if (id.endsWith('/colorPickerPlacement.js')) return { colorPickerPlacement }
    if (id.endsWith('/ToolPanel')) return { toolPanelStyles: {}, Segmented: 'segmented', ToolPanelHeader: 'header' }
    if (id.endsWith('/MyColorPresets')) return { __esModule: true, default: 'presets', MAX_PRESETS: 14, useColorPresets: () => ({ presets: [], loaded: false, add() {} }) }
    if (id.endsWith('/theme')) return { colors: {}, shadow: { float: {} } }
    if (id === '@react-native-async-storage/async-storage') return { __esModule: true, default: { getItem: () => new Promise(() => {}) } }
    return { __esModule: true, default: id }
  }, module, module.exports)
  return module.exports.default
}
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]

test('측정 메서드가 없거나 콜백이 오지 않아도 +는 즉시 창 열기를 요청한다', () => {
  for (const view of [{}, { measureInWindow() {} }]) {
    const open = [], Component = load('PenSettings.js', view)
    const tree = Component({ settings: settings.DEFAULT_PEN_SETTINGS, onOpenColorPicker: anchor => open.push(anchor) })
    tree.props.onLayout()
    nodes(tree).find(node => node.type === 'presets').props.onRequestPicker()
    assert.deepEqual(open, [null])
  }
})

test('위치 측정이 준비되면 설정 옆 배치에 사용할 앵커를 전달한다', () => {
  const open = [], Component = load('PenSettings.js', { measureInWindow: callback => callback(20,100,320,400) })
  const tree = Component({ settings: settings.DEFAULT_PEN_SETTINGS, onOpenColorPicker: anchor => open.push(anchor) })
  tree.props.onLayout(); nodes(tree).find(node => node.type === 'presets').props.onRequestPicker()
  assert.deepEqual(open, [{ x:20,y:100,width:320,height:400 }])
})

test('네이티브 측정 전 첫 렌더부터 색 창과 스포이트 버튼이 존재한다', () => {
  for (const view of [{}, { measureInWindow() {} }]) {
    const Component = load('PenColorPicker.js', view)
    const tree = Component({ anchor:null, scope:'pen', value:'#123456' })
    assert.equal(tree.props.collapsable, false)
    assert.deepEqual(tree.props.style[0], { position:'absolute',left:0,right:0,top:0,bottom:0,zIndex:90 })
    tree.props.onLayout({ nativeEvent: { layout: { width:390,height:844 } } })
    const card = nodes(tree).find(node => node.props?.testID === 'pen-color-picker')
    assert.ok(card)
    const position = card.props.style[1]
    assert.ok(position.left >= 0 && position.left + position.width <= 390)
    assert.ok(nodes(tree).find(node => node.props?.accessibilityLabel === '펜 스포이트'))
  }
})

test('RN 0.88에서 스포이트와 터치 입력 층 모두 실제 화면 크기를 채운다', () => {
  const Component = load('EyedropperOverlay.js', { measureInWindow() {} })
  const tree = Component({ request: { width:100,height:100,zoom:1,origin:{x:0,y:0},viewport:{width:100,height:100},offset:{x:0,y:0},screen:{width:390,height:844} } })
  const input = nodes(tree).find(node => node.props?.testID === 'eyedropper-input')
  for (const style of [tree.props.style,input.props.style]) {
    assert.equal(style.position,'absolute')
    for(const edge of ['top','right','bottom','left']) assert.equal(style[edge],0)
  }
})

test('프리셋 저장소 복원을 기다리는 동안에도 독립 색 창의 +를 누를 수 있다', () => {
  const Component = load('controls/MyColorPresets.js'), called = []
  const tree = Component({ value:'#123456', onRequestPicker: () => called.push(true) })
  const button = nodes(tree).find(node => node.props?.accessibilityLabel === '새 색상 고르기')
  assert.equal(button.props.disabled, false)
  button.props.onPress(); assert.deepEqual(called, [true])
})
