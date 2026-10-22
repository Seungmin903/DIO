import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const code = babel.transformSync(readFileSync(new URL('../src/editor/components/ExportMenu.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
function renderMenu(mobilePortrait, anchor) {
  const state = []
  let cursor = 0
  const mocks = {
    react: { Fragment: 'fragment', useEffect: () => {}, useMemo: fn => fn(), useState: initial => {
      const i = cursor++
      if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial
      return [state[i], value => { state[i] = value }]
    } },
    'react-native': { View: 'view', Pressable: 'button', ScrollView: 'scroll', Text: 'text', TextInput: 'input', Platform: { OS: 'ios' }, useWindowDimensions: () => ({ width: 414, height: 896 }), StyleSheet: { create: v => v, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute' } } },
    './ToolPanel': { Segmented: 'segment', ToolPanelHeader: 'header', toolPanelStyles: { card: {}, content: {}, label: {} } },
    './ExportScreen': { ExportButton: 'export' },
    './controls/EditorModal': { __esModule: true, default: 'modal' },
    '../../shared/theme': { colors: {} },
    '../utils/pageGeometry.js': { pageSize: () => ({ width: 1280, height: 800 }) },
    '../utils/pdfMenu.js': { menuPdfPolicy: () => ({ maxPages: 20 }) },
    '../utils/exportSelection.js': { pageListKey: () => 'a' },
    '../stickerAssets': {},
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? require(id), module, module.exports)
  const render = () => { cursor = 0; return module.exports.default({ mobilePortrait, anchor, doc: { pages: [{ id: 'a', objects: [] }] }, currentId: 'a' }) }
  return { render }
}
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
}
test('모바일 세로는 전체 모달 높이로 중앙 정렬하고 실제 높이에 맞춰 카드 높이를 제한한다', () => {
  const { render } = renderMenu(true, { x: 350, y: 10, width: 44, height: 44 })
  const tree = render()
  const root = tree.props.children
  assert.equal(root.props.style.flex, 1)
  const center = nodes(tree).find(n => n.props?.pointerEvents === 'box-none')
  assert.equal(center.props.style.flex, 1)
  assert.equal(center.props.style.justifyContent, 'center')
  assert.equal(center.props.style.position, undefined)
  root.props.onLayout({ nativeEvent: { layout: { height: 760 } } })
  const card = nodes(render()).find(n => n.props?.accessibilityViewIsModal)
  const placement = Object.assign({}, ...card.props.style)
  assert.equal(placement.top, undefined)
  assert.equal(placement.maxHeight, 728)
})
test('모바일 가로 중앙 배치와 태블릿 앵커 배치를 유지한다', () => {
  for (const anchor of [null, { x: 350, y: 20, width: 44, height: 44 }]) {
    const tree = renderMenu(false, anchor).render()
    assert.equal(tree.props.children.type, 'fragment')
    const card = nodes(tree).find(n => n.props?.accessibilityViewIsModal)
    const placement = Object.assign({}, ...card.props.style)
    assert.equal(placement.top, anchor ? 76 : undefined)
    assert.equal(placement.position, anchor ? 'absolute' : undefined)
  }
})
