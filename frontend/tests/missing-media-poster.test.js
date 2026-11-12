import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const compile = (path) => expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code

// 사진 내용이 어떤 still 값으로 그려지는지와, 점선 안내가 나오는지만 본다.
function render(object, { status, uriFor, still = false }) {
  const requests = []
  const mocks = {
    react: { memo: (x) => x, createContext: () => ({}), useContext: () => null, useMemo: (fn) => fn(), useState: (v) => [v, () => {}], useEffect() {}, useRef: (v) => ({ current: v }), useCallback: (fn) => fn },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react/compiler-runtime': { c: (size) => new Array(size).fill(Symbol.for('react.memo_cache_sentinel')) },
    'react-native': { Platform: { OS: 'ios', select: (o) => o.ios ?? o.default }, StyleSheet: { create: (x) => x, flatten: (x) => x, absoluteFill: {} }, View: 'View', Text: 'Text', Image: 'Image' },
    '../../hooks/useMediaUri': {
      useMediaEntry: () => (status ? { status } : undefined),
      useMediaUri: (item, options) => { requests.push(options.still); return uriFor(options.still) },
      useSvgImageUri: () => null,
    },
    '../../hooks/useTextFont': { __esModule: true, default: () => 'ready', useTextFont: () => 'ready' },
    '../../utils/mediaReferences.js': { mediaId: (item) => item?.mediaFileId ?? null },
    '../../stickerAssets': { isAnimatedMedia: () => true, isRetiredSticker: () => false, stickerSource: () => null },
  }
  const fallback = new Proxy({}, { get: (_, name) => (name === '__esModule' ? true : name === 'default' ? 'Stub' : () => null) })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/components/canvas/ObjectView.js'))((id) => mocks[id] ?? fallback, module, module.exports)
  const view = module.exports.default ?? module.exports.ObjectContent
  const element = view({ object, zoom: 1, still })
  const flat = (node) => (!node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)])
  const tree = flat(element)
  return { requests, stills: tree.filter((node) => node.props && 'still' in node.props).map((node) => node.props.still), notice: tree.some((node) => node.props?.children === '이미지 확인 필요') }
}

const photo = { id: 'p', type: 'photo', w: 100, h: 100, mediaFileId: 'm1', src: 'media:m1', poster: 'data:image/png;base64,AAAA' }

test('원본을 찾지 못해도 첫 장면이 있으면 첫 장면으로 그린다', () => {
  const result = render(photo, { status: 'error', uriFor: (still) => (still ? photo.poster : null) })
  assert.equal(result.notice, false)
  assert.deepEqual(result.requests, [true])
  assert.deepEqual(result.stills, [true])
})

test('원본이 있으면 움직이는 원본을 그린다', () => {
  const result = render(photo, { status: 'ready', uriFor: () => 'file:///cat.gif' })
  assert.deepEqual(result.requests, [false])
  assert.deepEqual(result.stills, [false])
})

test('첫 장면이 없는 사진은 원본을 못 찾으면 점선 안내를 유지한다', () => {
  const { poster, ...plain } = photo
  const result = render(plain, { status: 'error', uriFor: () => null })
  assert.equal(result.notice, true)
})
