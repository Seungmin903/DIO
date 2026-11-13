import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as builtinStickers from '../src/editor/builtinStickers.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'
import * as pencilRasterModule from '../src/editor/skia/pencilRaster.js'
const { isSkiaRaster } = pencilRasterModule
import { createStroke } from '../src/editor/utils/strokes.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const transform = (path) => expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
const load = (code, mocks) => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => { if (!(id in mocks)) throw new Error('mock 없음: ' + id); return mocks[id] }, module, module.exports)
  return module.exports
}

// GIF 층 합성용 층(snapshot.layer)마다 PageImageSurface 가 무엇을 그리고, 속지를 기다리는지 본다.
// 가짜 React 로 그린 뒤 effect 를 돌리고, 바뀐 상태로 다시 그리기를 되풀이한다
const surfaceCode = transform('../src/editor/components/PageImageSurface.js')
// os: Platform.OS · loadAssets: 첫 그리기 뒤 그림이 올라왔다고 알릴(onAssetLoad) 요소 id
async function renderSurface(snapshot, { os = 'web', loadAssets = [] } = {}) {
  const states = [], captures = [], notified = new Set()
  let slot = 0, effects = []
  const element = (type, props) => ({ type, props })
  const react = {
    useState: (initial) => { const i = slot++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef: (value) => { const i = slot++; if (!(i in states)) states[i] = { current: value }; return states[i] },
    useEffect: (fn) => effects.push(fn),
  }
  const Surface = load(surfaceCode, {
    react,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { PixelRatio: { get: () => 1 }, Platform: { OS: os }, View: 'View' },
    './PageBackground': { __esModule: true, default: 'PageBackground' },
    './canvas/ObjectView': { __esModule: true, default: 'ObjectContent', objectDrawOpacity: () => 1 },
    '../utils/pageImageQuality.js': { pageImageQuality: () => ({}) },
    '../utils/capturePage': { capturePage: async (node, shot) => { captures.push(shot.layer); return { uri: 'x' } } },
    '../utils/regionExport.js': { exportObjectPosition: () => ({}) },
    '../utils/pageExport.js': { PageExportError },
    '../../handwriting/library.js': { ensurePersonalFonts: async () => {} },
    '../services/textFonts': { ensureExportFonts: async () => {} },
    '../skia/skiaPencilScale.js': { SkiaPencilScale: { Provider: 'Provider' } },
    // 실제 판단 함수: 앱의 잉크펜 · 연필은 Skia 그림이 올라올 때까지 기다린다
    '../skia/pencilRaster.js': { isSkiaRaster },
    '../builtinStickers': builtinStickers,
    '../hooks/useStickerPacks': { useStickerPacks: () => 0 },
    '../templates/packingLayout.js': { packingLayout: () => null },
    './canvas/PackingColorLayer': { PackingColorLayer: 'PackingColorLayer', PackingFrontLayer: 'PackingFrontLayer' },
    './canvas/InkRecordFrontLayer': { InkRecordFrontLayer: 'InkRecordFrontLayer' },
    '../templates/inkRecordLayout.js': require('../src/editor/templates/inkRecordLayout.js'),
    '../../shared/fontScope': { KeepFont: 'KeepFont' },
  }).default
  const job = { snapshot, signal: { aborted: false }, resolve: () => {}, reject: (error) => { throw error }, onCaptureStart: () => {} }
  const raf = globalThis.requestAnimationFrame, caf = globalThis.cancelAnimationFrame
  globalThis.requestAnimationFrame = (fn) => { fn(); return 0 }
  globalThis.cancelAnimationFrame = () => {}
  try {
    let tree
    // 그리기 → effect → (글꼴 · 배치 알림) → 다시 그리기를 몇 번 되풀이한다
    for (let round = 0; round < 3; round++) {
      slot = 0; effects = []
      tree = Surface({ job })
      effects.forEach((fn) => fn())
      // 앱은 바깥 상자 크기가 정해져야 찍을 면을 그린다
      tree.props?.onLayout?.({ nativeEvent: { layout: { width: snapshot.width, height: snapshot.height } } })
      for (const node of nodes(tree)) if (node.props?.testID === 'page-export-surface') node.props.onLayout()
      // 그림 알림은 요소가 처음 그려진 차례에 한 번 보낸다(앱은 바깥 상자 크기가 정해진 다음 차례부터 요소를 그린다)
      for (const node of nodes(tree)) if (node.type === 'ObjectContent' && loadAssets.includes(node.props.object.id) && !notified.has(node.props.object.id)) { notified.add(node.props.object.id); node.props.onAssetLoad() }
      await new Promise((resolve) => setTimeout(resolve))
    }
    const all = [...nodes(tree)]
    return { types: all.map((n) => n.type), surface: all.find((n) => n.props?.testID === 'page-export-surface'), captures }
  } finally { globalThis.requestAnimationFrame = raf; globalThis.cancelAnimationFrame = caf }
}
function* nodes(node) {
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) { for (const child of node) yield* nodes(child); return }
  yield node
  yield* nodes(node.props?.children)
}

const page = (layer) => ({ pageId: 'p', width: 100, height: 100, pixelWidth: 100, background: '#FFEEDD', template: { backgroundAssetId: 'paper' }, objects: [], layer })

test('바탕 층과 층 없는 내보내기는 바탕색 · 속지를 그리고 속지가 준비될 때까지 찍지 않는다', async () => {
  for (const layer of ['base', undefined]) {
    const { types, surface, captures } = await renderSurface(page(layer))
    assert.ok(types.includes('PageBackground'), `${layer}: 속지`)
    assert.equal(surface.props.style.backgroundColor, '#FFEEDD')
    assert.deepEqual(captures, [], `${layer}: 속지 onReady 전에는 찍지 않는다`)
    // 속지 앞 그림은 바탕 층에서는 빼고(맨 위 층이 그린다), 층 없는 내보내기에서는 그린다
    assert.equal(types.includes('InkRecordFrontLayer'), layer === undefined, `${layer}: 속지 앞 그림`)
  }
})

test('사이 · 맨 위 층은 투명 바탕에 속지 없이 그려 속지를 기다리지 않고 찍는다. 속지 앞 그림은 맨 위 층만', async () => {
  for (const layer of ['middle', 'top']) {
    const { types, surface, captures } = await renderSurface(page(layer))
    assert.ok(!types.includes('PageBackground'), `${layer}: 속지 없음`)
    assert.equal(surface.props.style.backgroundColor, 'transparent')
    assert.deepEqual(captures, [layer], `${layer}: 속지를 기다리지 않고 찍는다`)
    assert.equal(types.includes('InkRecordFrontLayer'), layer === 'top', `${layer}: 속지 앞 그림`)
  }
})

test('웹 캡처는 사이 · 맨 위 층에 바탕색을 넘기지 않는다', async () => {
  const options = []
  const { capturePage } = load(transform('../src/editor/utils/capturePage.web.js'), {
    './exportFonts.js': { waitForExportFonts: async () => {} },
    'html-to-image': { toBlob: async (node, option) => { options.push(option); return new Blob(['x']) } },
    './pageExport.js': { PageExportError },
    '../../handwriting/library.js': { personalFontExportCSS: async () => '' },
  })
  const doc = globalThis.document
  globalThis.document = { fonts: {} }
  try { for (const layer of [undefined, 'base', 'middle', 'top']) (await capturePage({}, { ...page(layer), pixelHeight: 100 })).dispose() }
  finally { globalThis.document = doc }
  assert.deepEqual(options.map((o) => o.backgroundColor), ['#FFEEDD', '#FFEEDD', undefined, undefined])
})

// 앱의 잉크펜 획은 편집 화면과 같은 Skia 그림(PencilSkiaStroke)으로 구워 띄우므로, 그림이 올라왔다는 알림(onAssetLoad)이 와야 찍는다.
// 그림을 못 만들어 SVG 로 떨어질 때도 PencilSkiaStroke 가 같은 알림을 보낸다. 웹은 SVG 그대로라 기다리지 않는다.
const glassStroke = () => createStroke([{ x: 10, y: 10, pressure: 1 }, { x: 60, y: 30, pressure: 1 }], { id: 'glass-1', kind: 'glass', width: 6, renderVersion: 3, materialSeed: 1 })
const inkPage = () => ({ ...page('top'), objects: [glassStroke()] })

test('앱의 잉크펜 획은 Skia 그림이 올라왔다는 알림이 올 때까지 찍지 않는다', async () => {
  for (const os of ['android', 'ios']) {
    assert.deepEqual((await renderSurface(inkPage(), { os })).captures, [], `${os}: 알림 전에는 찍지 않는다`)
    assert.deepEqual((await renderSurface(inkPage(), { os, loadAssets: ['glass-1'] })).captures, ['top'], `${os}: 알림(그림 · SVG 폴백) 뒤에 찍는다`)
  }
})

test('웹의 잉크펜 획은 SVG 라 그림 알림을 기다리지 않고 찍는다', async () => {
  assert.deepEqual((await renderSurface(inkPage(), { os: 'web' })).captures, ['top'])
})

// StrokeContent: 앱의 잉크펜은 PencilSkiaStroke(SVG 는 실패 때 쓸 fallback)로, 웹은 SVG 그대로 그린다
const strokeContentCode = transform('../src/editor/components/StrokeContent.js')
function renderStroke(object, os) {
  const element = (type, props) => ({ type, props })
  return load(strokeContentCode, {
    react: { useMemo: (fn) => fn() },
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { Platform: { OS: os } },
    'react-native-svg': { __esModule: true, default: 'Svg', Path: 'Path' },
    '../utils/strokes': { strokeOutline: () => '', strokePath: () => 'M0 0' },
    './PencilStrokeContent': { __esModule: true, default: 'PencilStrokeContent' },
    './PencilSkiaStroke': { __esModule: true, default: 'PencilSkiaStroke' },
    '../skia/pencilRaster.js': { isSkiaRaster, pencilBakesOpacity: () => false },
    './InkStrokeContent': { __esModule: true, default: 'InkStrokeContent' },
    './FeltStrokeContent': { __esModule: true, default: 'FeltStrokeContent' },
    './NibStrokeContent': { __esModule: true, default: 'NibStrokeContent' },
    '../utils/nibStroke': { ballVaries: () => false, isNibKind: () => false },
    '../utils/svgId': { useSvgId: () => 'id' },
    '../utils/penSettings': { HIGHLIGHTER_OPACITY: 0.4 },
    '../templates/packingChecks.js': { packingCheckPath: () => null },
    '../utils/dashedStroke': { isDashedKind: () => false, dashedObjectContour: () => '' },
    './canvas/GlassStrokeContent': { __esModule: true, default: 'GlassStrokeContent' },
  }).default({ object, zoom: 1, onAssetLoad: () => {} })
}

test('StrokeContent: 앱의 잉크펜은 Skia 그림으로, 웹의 잉크펜은 SVG 로 그린다', () => {
  for (const os of ['android', 'ios']) {
    const tree = renderStroke(glassStroke(), os)
    assert.equal(tree.type, 'PencilSkiaStroke', `${os}: Skia 그림`)
    assert.equal(tree.props.fallback.props.children.type, 'GlassStrokeContent', `${os}: 실패 때 쓸 SVG`)
    assert.equal(typeof tree.props.onAssetLoad, 'function', `${os}: 내보내기 알림을 넘긴다`)
  }
  const web = renderStroke(glassStroke(), 'web')
  assert.equal(web.type, 'Svg')
  assert.equal(web.props.children.type, 'GlassStrokeContent')
})

// PencilSkiaStroke(앱)는 펜 종류를 가리지 않고, 그림이 올라오면(Image onLoad · onError) · 그림을 못 만들면(SVG 폴백) onAssetLoad 를 보낸다.
// PageImageSurface 가 앱의 잉크펜 획을 이 알림으로 기다리므로, 잉크펜 획에서도 두 경우 모두 알림이 와야 내보내기가 멈추지 않는다.
const pencilSkiaNativeCode = transform('../src/editor/components/PencilSkiaStroke.native.js')
function renderPencilSkiaNative(object, drawn) {
  const states = [], notified = []
  let slot = 0, effects = []
  const element = (type, props) => ({ type, props })
  const react = {
    useContext: () => 2,
    useState: (initial) => { const i = slot++; if (!(i in states)) states[i] = initial; return [states[i], (value) => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef: (value) => { const i = slot++; if (!(i in states)) states[i] = { current: value }; return states[i] },
    useEffect: (fn) => effects.push(fn),
  }
  const raster = require('../src/editor/skia/rasterBudget.js')
  const PencilSkiaStroke = load(pencilSkiaNativeCode, {
    react,
    'react/jsx-runtime': { jsx: element, jsxs: element, Fragment: 'Fragment' },
    'react-native': { Image: 'Image', PixelRatio: { get: () => 1 }, View: 'View' },
    '../skia/skiaPencilScale.js': { SkiaPencilScale: {} },
    '../skia/skiaRuntime': { useSkiaRuntime: () => ({ runtime: {} }) },
    '../skia/pencilRaster.js': { ...pencilRasterModule, drawPencilRaster: () => drawn },
    '../skia/rasterBudget.js': { ...raster, withinBudget: () => true },
    '../utils/pencilPreviewFallback.js': require('../src/editor/utils/pencilPreviewFallback.js'),
  }).default
  slot = 0; effects = []
  const tree = PencilSkiaStroke({ object, zoom: 1, fallback: 'SvgFallback', onAssetLoad: () => notified.push(object.id) })
  effects.forEach((fn) => fn())
  return { tree, notified }
}

test('PencilSkiaStroke(앱): 잉크펜 획도 그림이 올라오면 onAssetLoad 를 보낸다', () => {
  const object = glassStroke()
  const drawn = { image: { encodeToBase64: () => 'AA==' }, dispose() {}, left: -10, top: -10, width: 80, height: 50 }
  const { tree, notified } = renderPencilSkiaNative(object, drawn)
  const image = [...nodes(tree)].find((node) => node.type === 'Image')
  assert.ok(image, 'Skia 그림을 띄운다')
  assert.deepEqual(notified, [], '그림이 올라오기 전에는 알리지 않는다')
  image.props.onLoad()
  assert.deepEqual(notified, ['glass-1'])
  image.props.onError()
  assert.deepEqual(notified, ['glass-1', 'glass-1'], '그림을 못 띄워도 알린다(SVG 로 둔다)')
})

test('PencilSkiaStroke(앱): 잉크펜 그림을 못 만들면 SVG 를 그리고 바로 onAssetLoad 를 보낸다', () => {
  const { tree, notified } = renderPencilSkiaNative(glassStroke(), null)
  assert.ok([...nodes(tree)].includes('SvgFallback') || JSON.stringify(tree).includes('SvgFallback'), 'SVG 폴백')
  assert.deepEqual(notified, ['glass-1'])
})
