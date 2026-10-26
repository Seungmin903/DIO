import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, imagePoint, cropBetween, FULL_CROP, validateSplitOptions, splitError } from '../src/editor/utils/stickerSplit.js'
import { saveSplitSelection } from '../src/editor/utils/stickerSplitSave.js'
import { stickerSplit as web } from '../src/editor/services/stickerSplit.js'

const module = { apiVersion: 3, analyze() {}, merge() {}, cancel() {}, cleanup() {} }
test('Expo Go·웹·release·구형 모듈·비활성화 환경은 자동 분리만 비활성화한다', () => {
  for (const patch of [{ module: null }, { module: { ...module, apiVersion: 2 } }, { module: { ...module, apiVersion: 1 } }, { module: { apiVersion: 0 } }, { platform: 'web' }, { development: false }, { disabled: true }]) {
    assert.equal(splitAvailable({ development: true, platform: 'ios', module, ...patch }), false)
  }
  assert.equal(splitAvailable({ development: true, platform: 'ios', module }), true)
  assert.equal(splitAvailable({ development: true, platform: 'android', module }), true)
  assert.equal(web.available, false)
})
test('작업 이미지 contain 여백 터치는 무시하고 내부 좌표를 방향별로 환산한다', () => {
  assert.equal(imagePoint(10, 1, { width: 200, height: 200 }, { width: 200, height: 100 }), null)
  assert.deepEqual(imagePoint(100, 100, { width: 200, height: 200 }, { width: 200, height: 100 }), { x: 0.5, y: 0.5 })
  assert.deepEqual(imagePoint(100, 50, { width: 200, height: 100 }, { width: 100, height: 200 }), { x: 0.5, y: 0.5 })
})
test('모서리 지정 순서에 관계없이 같은 자르기 영역을 만든다', () => {
  assert.deepEqual(cropBetween({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 }), { x: 0.2, y: 0.1, width: 0.6000000000000001, height: 0.8 })
  assert.throws(() => cropBetween({ x: 0, y: 0 }, { x: 0, y: 1 }))
})
test('확대·이동 후 자르기 좌표는 원본 기준이며 경계 밖 드래그는 경계로 제한한다', () => {
  const frame = { width: 200, height: 200 }, image = { width: 200, height: 100 }, view = { zoom: 2, x: 20, y: -10 }
  assert.deepEqual(imagePoint(120, 90, frame, image, view), { x: 0.5, y: 0.5 })
  assert.equal(imagePoint(120, -50, frame, image, view), null)
  assert.deepEqual(imagePoint(120, -50, frame, image, view, true), { x: 0.5, y: 0 })
  const a = imagePoint(20, 40, frame, image, view), b = imagePoint(220, 140, frame, image, view)
  assert.deepEqual(cropBetween(a, b), { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
})
test('배경 자동 추정은 수동 좌표 없이 실행하고 수동 지정은 좌표를 검증한다', () => {
  assert.doesNotThrow(() => validateSplitOptions({ crop: FULL_CROP, autoBackground: true, tolerance: 35 }))
  assert.throws(() => validateSplitOptions({ crop: FULL_CROP, autoBackground: false, tolerance: 35 }))
  assert.throws(() => validateSplitOptions({ crop: FULL_CROP, autoBackground: true, tolerance: NaN }))
})
test('드래그 중 이벤트 대상의 locationX가 바뀌어도 손가락 이동량을 따른다', () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/StickerSplitPreview.js', import.meta.url), 'utf8'), {
    filename: 'StickerSplitPreview.js', configFile: false, babelrc: false,
    presets: [[expo.resolve('babel-preset-expo'), { jsxRuntime: 'automatic' }]],
    plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  let cursor = 0; const slots = [], m = { exports: {} }, crops = [], interactions = []
  const jsx = (type, props) => ({ type, props })
  new Function('require', 'module', 'exports', code)(id => {
    if (id.startsWith('@babel/runtime/')) return expo(id)
    if (id === 'react') return { useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value }] }, useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } } }
    if (id.includes('jsx-runtime')) return { jsx, jsxs: jsx }
    if (id === 'react-native') return { View: 'View', Image: 'Image', StyleSheet: { create: x => x, absoluteFill: {} } }
    if (id === 'react-native-svg') return { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect' }
    if (id.endsWith('/theme')) return { colors: {} }
    if (id.endsWith('stickerSplit.js')) return { cropBetween, imagePoint }
    throw new Error(`Unexpected preview dependency ${id}`)
  }, m, m.exports)
  const props = { source: { uri: 'file:///source', width: 200, height: 100 }, parts: [], selected: [], crop: FULL_CROP,
    background: null, mode: 'crop', working: false, view: { zoom: 1, x: 0, y: 0 }, onView() {}, onCrop: x => crops.push(x), onPoint() {}, onInteraction: x => interactions.push(x) }
  const render = () => { cursor = 0; return m.exports.default(props) }
  let tree = render(); tree.props.onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } }); tree = render()
  const input = () => render().props.children.at(-1).props
  const event = (pageX, pageY, locationX, locationY, touches = []) => ({ nativeEvent: { pageX, pageY, locationX, locationY, touches } })
  input().onResponderGrant(event(120, 260, 20, 60))
  input().onResponderMove(event(200, 300, 999, 999))
  input().onResponderRelease(event(200, 300, 888, 888))
  assert.deepEqual(crops, [{ x: 0.1, y: 0.1, width: 0.4, height: 0.4 }])
  assert.deepEqual(interactions, [true, false])
  // A second finger must discard a crop instead of publishing it on release.
  input().onResponderGrant(event(120, 260, 20, 60))
  input().onResponderStart(event(120, 260, 20, 60, [{ pageX: 120, pageY: 260 }, { pageX: 160, pageY: 280 }]))
  input().onResponderRelease(event(200, 300, 888, 888))
  assert.equal(crops.length, 1)
})
test('NaN·페이지 밖·면적 없는 입력은 네이티브 실행 전에 거부한다', () => {
  const valid = { crop: FULL_CROP, backgroundX: 0.1, backgroundY: 0.1, tolerance: 35 }
  assert.doesNotThrow(() => validateSplitOptions(valid))
  for (const patch of [{ tolerance: NaN }, { backgroundX: -1 }, { crop: { ...FULL_CROP, x: 1 } }, { crop: { ...FULL_CROP, height: 0 } }]) assert.throws(() => validateSplitOptions({ ...valid, ...patch }))
})
test('폴더 저장 실패는 새로 가져온 파일만 되돌리고 원래 오류를 전달한다', async () => {
  const fresh = [{ mediaFileId: 'fresh', src: 'media:fresh', width: 2, height: 3 }]
  const fail = new Error('disk full'), removed = []
  await assert.rejects(saveSplitSelection({ parts: [{ uri: 'file:///part.png', width: 2, height: 3 }], name: ' 새 폴더 ',
    importFiles: async (assets, options) => { assert.equal(options.usage, 'sticker'); assert.equal(assets[0].fileName, '새 폴더-1.png'); return fresh },
    publish: async () => { throw fail }, discard: async items => removed.push(...items) }), error => error === fail)
  assert.deepEqual(removed, fresh)
})
test('저장 확정은 기존 미디어 참조와 비율만 전달하고 성공 파일은 제거하지 않는다', async () => {
  const result = await saveSplitSelection({ parts: [{ uri: 'file:///dot.png', width: 1, height: 1 }], name: '별', folderId: 'existing',
    importFiles: async () => [{ mediaFileId: 'dot', src: 'media:dot', width: 1, height: 1 }],
    publish: async (id, name, items) => { assert.equal(id, 'existing'); assert.equal(name, '별'); assert.equal(items[0].aspect, 1); assert.equal(items[0].src, 'media:dot'); return id },
    discard: async () => assert.fail('successful files must remain') })
  assert.equal(result, 'existing')
})
test('수입 중 실패·빈 선택에서는 폴더를 추가하지 않는다', async () => {
  for (const parts of [[], [{ uri: 'bad' }]]) await assert.rejects(saveSplitSelection({ parts, name: '폴더', importFiles: async () => { throw new Error('import failed') }, publish: () => assert.fail(), discard: () => assert.fail() }))
})
test('모듈 없는 Expo Go에서 native facade 로드·지원 확인은 안전하며 처리 호출은 차단한다', async () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const babel = expo('@babel/core')
  const source = readFileSync(new URL('../src/editor/services/stickerSplit.native.js', import.meta.url), 'utf8')
  const { code } = babel.transformSync(source, { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const m = { exports: {} }, calls = []
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id === 'react-native') return { Platform: { OS: 'ios' } }
    if (id === 'expo') return { requireOptionalNativeModule: () => null }
    if (id.endsWith('stickerSplit.js')) return { splitAvailable, validateSplitOptions }
    if (id.endsWith('mediaPicker')) return { selectImages: () => calls.push('picker') }
    return {}
  }, m, m.exports, true)
  assert.equal(m.exports.stickerSplit.available, false)
  await assert.rejects(m.exports.stickerSplit.pick())
  assert.throws(() => m.exports.stickerSplit.analyze('file:///test', { crop: FULL_CROP, backgroundX: 0, backgroundY: 0, tolerance: 35 }))
  assert.deepEqual(calls, [])
})
test('Android 1200만 화소 입력은 전체 PNG 변환 없이 복사하고 네이티브 방향 정보를 사용한다', async () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/stickerSplit.native.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  let asset = { uri: 'file:///photo.jpg', fileName: 'photo.jpg', width: 4000, height: 3000, fileSize: 2000 }
  const calls = [], m = { exports: {} }
  class File { constructor(...args) { this.uri = args.join('/') } get size() { return 2000 } async copy(target) { calls.push('copy') } }
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id === 'react-native') return { Platform: { OS: 'android' } }
    if (id === 'expo') return { requireOptionalNativeModule: () => ({ ...module, imageInfo: async () => { calls.push('imageInfo'); return JSON.stringify({ width: 3000, height: 4000 }) } }) }
    if (id === 'expo-crypto') return { randomUUID: () => 'job' }
    if (id === 'expo-file-system') return { File, Paths: { cache: 'file:///cache' } }
    if (id === 'expo-image-manipulator') return { manipulateAsync: () => assert.fail('must not fully decode a large Android source') }
    if (id.endsWith('stickerSplit.js')) return { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, validateSplitOptions }
    if (id.endsWith('mediaPicker')) return { selectImages: async () => ({ assets: [asset] }) }
    throw new Error(`Unexpected dependency ${id}`)
  }, m, m.exports, true)
  const result = await m.exports.stickerSplit.pick()
  assert.equal(result.width, 3000); assert.equal(result.height, 4000); assert.equal(result.name, 'photo')
  assert.deepEqual(calls, ['copy', 'imageInfo'])
  asset = { ...asset, width: 8000, height: 8000 }
  await assert.rejects(m.exports.stickerSplit.pick(), /IMAGE_TOO_LARGE/)
  assert.deepEqual(calls, ['copy', 'imageInfo'])
})
test('작은 점을 삭제하는 크기 필터는 없고 한도 초과는 오류로 안내한다', () => {
  assert.match(splitError(new Error('TOO_MANY_PARTS')), /4,096/)
  assert.match(splitError(new Error('IMAGE_TOO_LARGE')), /800만/)
  assert.match(splitError(new Error('IMAGE_TOO_LARGE')), /3,200만/)
  assert.match(splitError(new Error('STICKER_TOO_LARGE')), /한 스티커/)
  assert.match(splitError(new Error('INSUFFICIENT_SCRATCH_SPACE')), /저장 공간/)
  assert.match(splitError(new Error('CANCELLED')), /취소/)
})

async function decorHarness(storage, failWrite = false) {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/hooks/useCustomDecor.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  let cursor = 0, effects = [], deps = [], states = [], uuid = 0
  const m = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return {
      useCallback: fn => fn,
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
      useEffect(fn, next) { const index = cursor++; if (!deps[index] || next.some((value, n) => value !== deps[index][n])) { effects.push(fn); deps[index] = next } },
    }
    if (id.endsWith('/common')) return { createId: () => `id-${++uuid}` }
    if (id.endsWith('/mediaStore')) return { hydrateMedia: async () => {} }
    if (id.endsWith('/mediaReferences.js')) return { mediaId: item => item?.mediaFileId }
    if (id.endsWith('/storage')) return { STORAGE_KEYS: { customDecor: 'decor' }, loadJSON: async (_key, fallback) => storage.value ?? fallback,
      saveJSON: async (_key, value) => { if (failWrite) return false; storage.value = structuredClone(value); return true } }
    throw new Error(`unexpected import ${id}`)
  }, m, m.exports)
  const render = () => { cursor = 0; const api = m.exports.useCustomDecor(); const tasks = effects; effects = []; tasks.forEach(fn => fn()); return api }
  render(); await new Promise(resolve => setImmediate(resolve)); const api = render()
  await new Promise(resolve => setImmediate(resolve))
  return { api, render }
}
test('생성 폴더 저장 후 새 보관함 세션에서 기존 폴더와 함께 복원한다', async () => {
  const storage = { value: { folders: [{ id: 'old', name: '기존', items: [{ src: 'media:old', mediaFileId: 'old' }] }] } }
  const first = await decorHarness(storage)
  const id = await first.api.saveGenerated(null, '새 별', [{ src: 'media:dot', mediaFileId: 'dot', aspect: 1 }])
  first.render(); await new Promise(resolve => setImmediate(resolve))
  const second = await decorHarness(storage)
  assert.equal(second.api.items.folders[0].id, 'old')
  assert.equal(second.api.items.folders.find(f => f.id === id).items[0].mediaFileId, 'dot')
})
test('생성 폴더 저장 실패는 UI 목록을 추가하지 않고 재시도 가능하게 남긴다', async () => {
  const storage = { value: { folders: [] } }
  const harness = await decorHarness(storage, true)
  await assert.rejects(harness.api.saveGenerated(null, '별', [{ src: 'media:dot', mediaFileId: 'dot' }]), /저장/)
  assert.deepEqual(harness.render().items.folders, [])
})
