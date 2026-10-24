import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as effects from '../src/editor/utils/effects.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/ObjectView.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const nodes = (node) => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function render({ platform = 'ios', still = false, outline = true, shadow = true, frame = { uri: 'frame:2' }, error = false } = {}) {
  let request
  const mocks = {
    react: { memo: (value) => value, createContext: () => ({}), useContext: () => null },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: (s) => s }, Text: 'Text', View: 'View' },
    '../../utils/effects': effects,
    '../../stickerAssets': { isAnimatedMedia: () => true, stickerSource: (_object, isStill) => ({ uri: isStill ? 'poster' : 'original.gif' }) },
    '../../hooks/useMediaUri': { useMediaUri: () => undefined },
    '../../hooks/useStickerPlayback': { useStickerPlayback: (source) => { request = source; return { source: frame, error } } },
    './StickerFrame': { __esModule: true, default: 'StickerFrame' },
    './MediaImage': { __esModule: true, default: 'MediaImage' },
    '../../../shared/theme': { colors: {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code + '\nmodule.exports.StickerContent = StickerContent;')((id) => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: () => null }), module, module.exports)
  const tree = module.exports.StickerContent({ object: { id: 'gif', asset: 'bundled-gif', type: 'sticker', outline, shadow, outlineColor: '#ff0000', shadowColor: '#0000ff' }, width: 100, height: 100, zoom: 1, still })
  return { request, nodes: nodes(tree), images: nodes(tree).filter((n) => n.type === 'MediaImage') }
}
for (const platform of ['ios', 'android']) {
  test(`${platform}: 본체와 효과를 단일 프레임 렌더러에 전달한다`, () => {
    for (const options of [{}, { outline: false }, { shadow: false }]) {
      const r = render({ platform, ...options })
      assert.equal(r.request.uri, 'original.gif')
      assert.equal(r.images.length, 0)
      const frames = r.nodes.filter(n => n.type === 'StickerFrame')
      assert.equal(frames.length, 1)
      assert.equal(frames[0].props.source.uri, 'frame:2')
      const colors = frames[0].props.layers.map(layer => layer.color)
      assert.equal(colors.includes('#ff0000'), options.outline !== false)
      assert.equal(colors.includes('#0000ff'), options.shadow !== false)
    }
  })
  test(`${platform}: 준비 중 정지 poster를 공유하고 실패 안내를 표시한다`, () => {
    const pending = render({ platform, frame: null })
    assert.equal(pending.nodes.find(n => n.type === 'StickerFrame').props.source.uri, 'poster')
    assert.equal(pending.images.length, 0)
    assert.ok(render({ platform, frame: null, error: true }).nodes.some(n => n.props.accessibilityLiveRegion === 'polite'))
  })
}

test('효과 끄기·정지 출력·웹은 기존 미디어 경로를 유지한다', () => {
  for (const options of [{ outline: false, shadow: false }, { still: true }, { platform: 'web' }]) {
    const r = render(options)
    assert.equal(r.request, null)
    const main = r.images.at(-1)
    assert.equal(main.props.source.uri, options.still ? 'poster' : 'original.gif')
    assert.equal(main.props.animated, !options.still)
  }
})

test('SVG 본체와 알파 마스크는 단 하나의 이미지 노드를 참조한다', () => {
  const { code: frameCode } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/StickerFrame.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  const mocks = {
    'react-native-svg': { __esModule: true, default: 'Svg', Defs: 'Defs', G: 'G', Image: 'Image', Mask: 'Mask', Rect: 'Rect', Use: 'Use' },
    '../../utils/svgId': { useSvgId: () => 'frame-test' },
  }
  new Function('require', 'module', 'exports', frameCode)(id => mocks[id] ?? require(id), module, module.exports)
  for (const uri of ['poster', 'frame:1', 'frame:2']) {
    const tree = module.exports.default({ source: { uri }, width: 100, height: 80, layers: [{ key: 'shadow', dx: -12, dy: 20, color: '#123456', opacity: .3 }] })
    const all = nodes(tree)
    assert.equal(all.filter(n => n.type === 'Image').length, 1)
    assert.equal(all.find(n => n.type === 'Image').props.href.uri, uri)
    assert.ok(all.filter(n => n.type === 'Use').every(n => n.props.href === '#frame-test'))
    assert.equal(all.find(n => n.type === 'Mask').props.maskType, 'alpha')
    assert.equal(all.find(n => n.type === 'Rect').props.mask, 'url(#frame-test-alpha)')
    assert.equal(tree.props.viewBox, '-22 -22 144 124')
  }
})
