import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as builtinStickers from '../src/editor/builtinStickers.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'

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
async function renderSurface(snapshot) {
  const states = [], captures = []
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
    'react-native': { PixelRatio: { get: () => 1 }, Platform: { OS: 'web' }, View: 'View' },
    './PageBackground': { __esModule: true, default: 'PageBackground' },
    './canvas/ObjectView': { __esModule: true, default: 'ObjectContent', objectDrawOpacity: () => 1 },
    '../utils/pageImageQuality.js': { pageImageQuality: () => ({}) },
    '../utils/capturePage': { capturePage: async (node, shot) => { captures.push(shot.layer); return { uri: 'x' } } },
    '../utils/regionExport.js': { exportObjectPosition: () => ({}) },
    '../utils/pageExport.js': { PageExportError },
    '../../handwriting/library.js': { ensurePersonalFonts: async () => {} },
    '../services/textFonts': { ensureExportFonts: async () => {} },
    '../skia/skiaPencilScale.js': { SkiaPencilScale: { Provider: 'Provider' } },
    '../skia/pencilRaster.js': { isSkiaRaster: () => false },
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
      for (const node of nodes(tree)) if (node.props?.testID === 'page-export-surface') node.props.onLayout()
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
