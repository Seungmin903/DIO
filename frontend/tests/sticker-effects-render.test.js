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
    './MediaImage': { __esModule: true, default: 'MediaImage' },
    '../../../shared/theme': { colors: {} },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code + '\nmodule.exports.StickerContent = StickerContent;')((id) => mocks[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: () => null }), module, module.exports)
  const tree = module.exports.StickerContent({ object: { id: 'gif', type: 'sticker', outline, shadow, outlineColor: '#ff0000', shadowColor: '#0000ff' }, width: 100, height: 100, zoom: 1, still })
  return { request, nodes: nodes(tree), images: nodes(tree).filter((n) => n.type === 'MediaImage') }
}
test('iOS 원본·윤곽선·그림자는 모두 같은 PNG 장면이며 독립 GIF를 재생하지 않는다', () => {
  const { request, images } = render()
  assert.equal(request.uri, 'original.gif')
  assert.ok(images.length > 16)
  assert.ok(images.every((n) => n.props.source.uri === 'frame:2' && n.props.animated === false))
  const colors = images.flatMap((n) => [n.props.style].flat(Infinity).map((s) => s.tintColor)).filter(Boolean)
  assert.ok(colors.includes('#ff0000'))
  assert.ok(colors.includes('#0000ff'))
})
test('준비 중 원본과 효과는 같은 poster를 사용하며 실패 안내를 표시한다', () => {
  const pending = render({ frame: null })
  assert.ok(pending.images.every((n) => n.props.source.uri === 'poster' && !n.props.animated))
  assert.ok(render({ frame: null, error: true }).nodes.some((n) => n.props.accessibilityLiveRegion === 'polite'))
})
test('효과 끄기·정지 출력·Android는 기존 미디어 경로를 유지한다', () => {
  for (const options of [{ outline: false, shadow: false }, { still: true }, { platform: 'android' }]) {
    const r = render(options)
    assert.equal(r.request, null)
    const main = r.images.at(-1)
    assert.equal(main.props.source.uri, options.still ? 'poster' : 'original.gif')
    assert.equal(main.props.animated, !options.still)
  }
})
