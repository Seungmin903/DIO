import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as effects from '../src/editor/utils/effects.js'
import * as shapes from '../src/editor/utils/shapes.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]
function load(file, mocks = {}) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const module = { exports: {} }
  const svg = Object.fromEntries(['ClipPath','Defs','Filter','FeGaussianBlur','G','Mask','Path','Rect','Image'].map(n => [n, n]))
  const defaults = { react: { memo: x => x, createContext: () => ({}), useContext: () => null }, 'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: x => x }, View: 'View' }, 'react-native-svg': { __esModule: true, default: 'Svg', ...svg }, '../../utils/effects': effects, '../../utils/svgId': { useSvgId: () => 'test-shadow' }, '../../utils/shapes': shapes, '../../../shared/theme': { colors: {} } }
  new Function('require','module','exports',code)(id => mocks[id] ?? defaults[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports
}
const pathShadow = load('../src/editor/components/canvas/PhotoPathShadow.js').default
test('바깥 그림자는 모양 경로·방향·색·흐림·퍼짐을 반영하고 SVG 여백을 확보한다', () => {
  const shadow = effects.shadowOf({ shadow: true, shadowDirection: 'r', shadowDistance: 10, shadowSpread: 3, shadowBlur: 8, shadowColor: '#FF0000', shadowOpacity: 0.4 })
  const tree = pathShadow({ d: shapes.shapePath('heart', 100, 80), width: 100, height: 80, shadow, zoom: 2, flipY: true })
  assert.ok(tree.props.width > 140)
  assert.equal(nodes(tree).find(n => n.type === 'FeGaussianBlur').props.stdDeviation, 8)
  const path = nodes(tree).find(n => n.type === 'Path' && n.props.stroke)
  assert.equal(path.props.strokeWidth, 12)
  assert.equal(path.props.fill, '#FF0000')
  assert.match(path.props.transform, /scale\(1 -1\)/)
  assert.ok(nodes(tree).some(n => n.props.transform === 'translate(20 0)'))
})
test('안쪽 그림자는 모양 안에 클리핑하고 비활성 상태에서는 아무것도 그리지 않는다', () => {
  const shadow = { ...effects.shadowOf({ shadow: true }), inset: true }
  const tree = pathShadow({ d: shapes.shapePath('star', 100, 100), width: 100, height: 100, shadow, zoom: 1 })
  assert.ok(nodes(tree).some(n => n.type === 'Mask' && n.props.maskType === 'luminance'))
  assert.ok(nodes(tree).some(n => n.props.clipPath === 'url(#test-shadow-clip)'))
  assert.equal(pathShadow({ d: '', width: 100, height: 100, shadow: { on: false }, zoom: 1 }), null)
})
test('사진 렌더러는 하트·별·우표에 그림자 경로를 연결하고 다른 사진은 기존 방식을 유지한다', () => {
  const frame = load('../src/editor/components/canvas/PhotoFrame.js')
  const view = load('../src/editor/components/canvas/ObjectView.js', {
    '../../hooks/useMediaUri': { useMediaUri: () => 'data:image/png;base64,fixture' },
    '../../stickerAssets': { isAnimatedMedia: () => false },
    '../../utils/objects': { photoInnerBox: p => ({ left: 0, top: 0, width: p.w, height: p.h }), coverLayout: (_p,w,h) => ({ left: 0, top: 0, width: w, height: h }) },
    './PhotoFrame': { __esModule: true, default: 'FrameBackdrop', stampPath: frame.stampPath },
  })
  for (const photo of [{ frame: 'shape', shape: 'heart' }, { frame: 'shape', shape: 'star' }, { frame: 'stamp' }]) {
    for (const shadowInset of [false, true]) {
      const p = { id: 'p', type: 'photo', w: 100, h: 80, shadow: true, shadowInset, ...photo }
      assert.equal(view.photoSupportsShadow(p), true)
      const tree = view.PhotoContent({ photo: p, zoom: 1 })
      const layers = nodes(tree).filter(n => n.type === './PhotoPathShadow')
      assert.equal(layers.length, 1)
      assert.equal(layers[0].props.shadow.on, true)
      assert.equal(layers[0].props.shadow.inset, shadowInset)
      assert.ok(layers[0].props.d)
    }
  }
  const regular = view.PhotoContent({ photo: { frame: 'shape', shape: 'rect', w: 100, h: 80, shadow: true }, zoom: 1 })
  assert.ok(regular.props.style.some(s => s?.boxShadow))
})
