import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as builtinStickers from '../src/editor/builtinStickers.js'
import { PageExportError } from '../src/editor/utils/pageExport.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

// PageImageSurface 를 가짜 React 로 한 번 그리고 effect 를 돌린다(내보내기 화면의 '찍기 전 기다리기' 판단만 본다)
function renderSurface(snapshot) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/PageImageSurface.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const effects = []
  let slot = 0
  const states = []
  const react = {
    useState: initial => { const i = slot++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef: value => ({ current: value }),
    useEffect: fn => effects.push(fn),
  }
  const mocks = {
    react,
    'react/jsx-runtime': { jsx: () => null, jsxs: () => null, Fragment: 'Fragment' },
    'react-native': { PixelRatio: { get: () => 1 }, Platform: { OS: 'web' }, View: 'View' },
    './PageBackground': { __esModule: true, default: 'PageBackground' },
    './canvas/ObjectView': { __esModule: true, default: 'ObjectContent', objectDrawOpacity: () => 1 },
    '../utils/pageImageQuality.js': { pageImageQuality: () => ({}) },
    '../utils/capturePage': { capturePage: async () => ({ uri: 'x' }) },
    '../utils/regionExport.js': { exportObjectPosition: () => ({}) },
    '../utils/pageExport.js': { PageExportError },
    '../../handwriting/library.js': { ensurePersonalFonts: async () => {} },
    '../services/textFonts': { ensureExportFonts: async () => {} },
    '../skia/skiaPencilScale.js': { SkiaPencilScale: { Provider: 'Provider' } },
    '../skia/pencilRaster.js': { isSkiaPencil: () => false },
    '../builtinStickers': builtinStickers,
    '../hooks/useStickerPacks': { useStickerPacks: () => 0 },
    '../templates/packingLayout.js': { packingLayout: () => null },
    './canvas/PackingColorLayer': { PackingColorLayer: 'PackingColorLayer', PackingFrontLayer: 'PackingFrontLayer' },
    './canvas/InkRecordFrontLayer': { InkRecordFrontLayer: 'InkRecordFrontLayer' },
    // 병 윤곽 자리 계산은 **진짜 모듈**을 쓴다 — 화면과 같은 규칙인지 가짜로는 못 본다
    '../templates/inkRecordLayout.js': require('../src/editor/templates/inkRecordLayout.js'),
    '../../shared/fontScope': { KeepFont: 'KeepFont' },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { if (!(id in mocks)) throw new Error('mock 없음: ' + id); return mocks[id] }, module, module.exports)
  const calls = { resolve: [], reject: [] }
  const job = { snapshot, signal: { aborted: false }, resolve: v => calls.resolve.push(v), reject: e => calls.reject.push(e), onCaptureStart: () => {} }
  module.exports.default({ job })
  const cleanups = effects.map(fn => fn())
  return { calls, cleanups, module }
}

const page = objects => ({ pageId: 'p', width: 1024, height: 768, pixelWidth: 1024, background: '#FFFFFF', template: null, objects })
const remoteSticker = { id: 's1', type: 'sticker', x: 0, y: 0, w: 110, h: 110, builtin: 'remote:gone:cherry' }

test('원격 스티커 팩이 끝내 오지 않으면 빈 자리로 찍지 않고 내보내기 오류로 알린다', t => {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => mock.timers.reset())
  const { calls, module } = renderSurface(page([remoteSticker]))
  assert.equal(module.exports.isRemoteSticker(remoteSticker), true)
  mock.timers.tick(module.exports.REMOTE_PACK_WAIT_MS - 1)
  assert.equal(calls.reject.length, 0) // 기다리는 중
  mock.timers.tick(1)
  assert.equal(calls.reject.length, 1)
  assert.equal(calls.reject[0].code, 'EXPORT_MEDIA_FAILED')
  assert.equal(calls.resolve.length, 0)
})

test('팩이 들어와 있으면 기다리지 않고, 원격 아닌 스티커는 상관없다', t => {
  mock.timers.enable({ apis: ['setTimeout'] })
  t.after(() => { mock.timers.reset(); builtinStickers.retainRemoteStickerPacks([]) })
  builtinStickers.registerRemoteStickerPack({ id: 'remote:gone', name: '팩', items: [{ builtin: 'remote:gone:cherry', name: '체리', w: 3, h: 2, paths: [['#ffffff', 'M0 0h3v2h-3z']] }] })
  const { calls } = renderSurface(page([remoteSticker, { id: 's2', type: 'sticker', x: 0, y: 0, w: 10, h: 10, builtin: 'moa_basic' }]))
  mock.timers.tick(20000)
  assert.equal(calls.reject.length, 0)
})
