import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, imagePoint, cropBetween, FULL_CROP, validateSplitOptions, splitError, previewLoadMatches } from '../src/editor/utils/stickerSplit.js'
import { saveSplitSelection, splitSaveError } from '../src/editor/utils/stickerSplitSave.js'
import { MediaError } from '../src/editor/utils/mediaPolicy.js'
import { stickerSplit as web } from '../src/editor/services/stickerSplit.js'
import * as cropUtils from '../src/editor/utils/stickerSplitCrop.js'

const module = { apiVersion: 3, analyze() {}, merge() {}, cancel() {}, async cleanup() {} }
test('Expo Go·웹·구형 모듈·비활성화 환경은 자동 분리만 비활성화한다', () => {
  for (const patch of [{ module: null }, { module: { ...module, apiVersion: 2 } }, { module: { ...module, apiVersion: 1 } }, { module: { apiVersion: 0 } }, { platform: 'web' }, { disabled: true }]) {
    assert.equal(splitAvailable({ platform: 'ios', module, ...patch }), false)
  }
  assert.equal(splitAvailable({ platform: 'ios', module }), true)
  assert.equal(splitAvailable({ platform: 'android', module }), true)
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

test('배경 허용 범위는 0부터 150까지 허용하고 범위 밖은 거부한다', () => {
  for (const tolerance of [0, 5, 10, 150]) assert.doesNotThrow(() => validateSplitOptions({ crop: FULL_CROP, autoBackground: true, tolerance }))
  for (const tolerance of [-1, 151]) assert.throws(() => validateSplitOptions({ crop: FULL_CROP, autoBackground: true, tolerance }))
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
    if (id.endsWith('stickerSplit.js')) return { cropBetween, imagePoint, previewLoadMatches }
    if (id.endsWith('stickerSplitCrop.js')) return cropUtils
    throw new Error(`Unexpected preview dependency ${id}`)
  }, m, m.exports)
  const props = { source: { uri: 'file:///source', width: 200, height: 100 }, parts: [], selected: [], crop: FULL_CROP,
    background: null, mode: 'crop', working: false, view: { zoom: 1, x: 0, y: 0 }, onView() {}, onCrop: x => crops.push(x), onPoint() {}, onInteraction: x => interactions.push(x) }
  const render = () => { cursor = 0; return m.exports.default(props) }
  let tree = render(); tree.props.onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } }); tree = render()
  tree.props.children[0].props.onLoad(); tree = render()
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
test('Android는 실제 형식의 확장자와 방향 보정 미리보기를 사용하고 원본 크기는 유지한다', async () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/stickerSplit.native.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  let asset = { uri: 'file:///photo.jpg', fileName: 'photo.jpg', width: 4000, height: 3000, fileSize: 2000 }
  const calls = [], m = { exports: {} }
  class File { constructor(...args) { this.uri = args.join('/') } get size() { return 2000 } async copy() { calls.push('copy') } async move() { calls.push('move') } }
  new Function('require', 'module', 'exports', '__DEV__', code)(id => {
    if (id === 'react-native') return { Platform: { OS: 'android' } }
    if (id === 'expo') return { requireOptionalNativeModule: () => ({ ...module, completeRegionVersion: 1,
      inspectInput: async () => { calls.push('inspect'); return 'jpg' },
      prepareImage: async () => { calls.push('prepare'); if (asset.width * asset.height > MAX_SPLIT_PIXELS) throw new Error('IMAGE_TOO_LARGE'); return JSON.stringify({ width: 3000, height: 4000, previewUri: 'file:///preview.png', previewWidth: 768, previewHeight: 1024 }) },
    }) }
    if (id === 'expo-crypto') return { randomUUID: () => 'job' }
    if (id === 'expo-file-system') return { File, Paths: { cache: 'file:///cache' } }
    if (id === 'expo-image-manipulator') return { manipulateAsync: () => assert.fail('must not fully decode a large Android source') }
    if (id.endsWith('stickerSplit.js')) return { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, validateSplitOptions }
    if (id.endsWith('mediaPicker')) return { selectImages: async () => ({ assets: [asset] }) }
    throw new Error(`Unexpected dependency ${id}`)
  }, m, m.exports, true)
  const result = await m.exports.stickerSplit.pick()
  assert.equal(result.width, 3000); assert.equal(result.height, 4000); assert.equal(result.name, 'photo')
  assert.equal(result.previewUri, 'file:///preview.png'); assert.match(result.uri, /\.jpg$/)
  assert.deepEqual(calls, ['copy', 'inspect', 'move', 'prepare'])
  asset = { ...asset, width: 8000, height: 8000 }
  await assert.rejects(m.exports.stickerSplit.pick(), /IMAGE_TOO_LARGE/)
  assert.deepEqual(calls, ['copy', 'inspect', 'move', 'prepare', 'copy', 'inspect', 'move', 'prepare'])
})
test('후보·입력·출력·작업 공간 한도 초과는 오류로 안내한다', () => {
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
  let cursor = 0, effects = [], deps = [], states = [], cleanups = [], uuid = 0
  const m = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return {
      useCallback: fn => fn,
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }] },
      useEffect(fn, next) { const index = cursor++; if (!deps[index] || next.some((value, n) => value !== deps[index][n])) { effects.push({ index, fn }); deps[index] = next } },
    }
    if (id.endsWith('/common')) return { createId: () => `id-${++uuid}` }
    if (id.endsWith('/mediaStore')) return { hydrateMedia: async () => {} }
    if (id.endsWith('/mediaReferences.js')) return { mediaId: item => item?.mediaFileId }
    if (id.endsWith('/storage')) return { STORAGE_KEYS: { customDecor: 'decor', stickerCategory: 'category' }, loadJSON: async (key, fallback) => (key === 'category' ? storage.category : storage.value) ?? fallback,
      saveJSON: async (key, value) => {
        if (key === 'category') {
          ;(storage.categoryWrites ??= []).push(structuredClone(value))
          if (storage.categoryWrite) return storage.categoryWrite(value)
          if (storage.categoryFail) return false
          storage.category = structuredClone(value); return true
        }
        ;(storage.writes ??= []).push(structuredClone(value))
        if (storage.write) return storage.write(value)
        if (failWrite || storage.fail) return false
        storage.value = structuredClone(value); return true
      } }
    throw new Error(`unexpected import ${id}`)
  }, m, m.exports)
  const render = () => { cursor = 0; const api = m.exports.useCustomDecor(); const tasks = effects; effects = []; tasks.forEach(({ index, fn }) => { cleanups[index]?.(); cleanups[index] = fn() }); return api }
  const unmount = () => { cleanups.forEach(fn => fn?.()); effects = []; deps = []; states = []; cleanups = [] }
  render(); await new Promise(resolve => setImmediate(resolve)); const api = render()
  await new Promise(resolve => setImmediate(resolve))
  return { api: render(), render, unmount }
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

const settleDecor = () => new Promise(resolve => setImmediate(resolve))
test('마지막 스티커 칩은 닫았다 열기·새 세션에 복원하며 기존 보관함 데이터를 보존한다', async () => {
  const storage = { value: { folders: [{ id: 'old', name: '내 폴더', items: [] }], categoryOrder: ['twemoji'], favorites: [] } }
  const first = await decorHarness(storage)
  first.api.setStickerCategory('folder:old'); first.render(); await settleDecor()
  const reopened = await decorHarness(storage)
  assert.equal(reopened.api.lastStickerCategory, 'folder:old')
  assert.deepEqual(reopened.api.items.categoryOrder, ['twemoji'])
  assert.equal(reopened.api.items.folders[0].id, 'old')
  reopened.api.setStickerCategory('twemoji'); reopened.render(); await settleDecor()
  assert.equal((await decorHarness(storage)).api.lastStickerCategory, 'twemoji')
})
test('칩 변경은 보관함을 다시 쓰지 않으며 설정 저장 실패가 보관함 오류를 만들지 않는다', async () => {
  const storage = { value: initialDecor() }, h = await decorHarness(storage)
  const before = storage.writes.length, snapshot = h.api.items
  storage.categoryFail = true
  h.api.setStickerCategory('twemoji'); h.render(); await settleDecor()
  assert.equal(storage.writes.length, before)
  assert.equal(h.render().items, snapshot)
  assert.equal(h.render().lastStickerCategory, 'twemoji')
  assert.equal(h.render().saveError, null)
  storage.categoryFail = false
  h.render().setStickerCategory('twemoji'); h.render(); await settleDecor()
  assert.equal((await decorHarness(storage)).api.lastStickerCategory, 'twemoji')
})
test('구형 칩 값과 기본값을 복원하고 별도 설정이 있으면 우선한다', async () => {
  const legacy = { ...initialDecor(), lastStickerCategory: 'folder:old' }
  assert.equal((await decorHarness({ value: legacy })).api.lastStickerCategory, 'folder:old')
  assert.equal((await decorHarness({ value: initialDecor() })).api.lastStickerCategory, null)
  assert.equal((await decorHarness({ value: legacy, category: { category: 'twemoji' } })).api.lastStickerCategory, 'twemoji')
  assert.equal((await decorHarness({ value: legacy, category: { category: null } })).api.lastStickerCategory, null)
})
test('칩 설정 예외는 처리하며 기존 보관함 저장 실패 안내를 덮어쓰지 않는다', async () => {
  const storage = { value: initialDecor(), fail: true, categoryWrite: async () => { throw new Error('disk full') } }
  const h = await decorHarness(storage)
  const before = h.render().saveError, writes = storage.writes.length
  assert.match(before, /저장하지 못했어요/)
  h.api.setStickerCategory('twemoji'); h.render(); await settleDecor()
  assert.equal(h.render().saveError, before)
  assert.equal(h.render().lastStickerCategory, 'twemoji')
  assert.equal(storage.writes.length, writes)
})
test('칩 설정은 연속 입력 순서대로 쓰며 실패해도 다음 선택을 저장한다', async () => {
  const pending = [], storage = { value: initialDecor(), categoryWrite: value => new Promise(resolve => pending.push({ value, resolve })) }
  const h = await decorHarness(storage)
  h.api.setStickerCategory('twemoji'); h.api.setStickerCategory('folder:old'); h.render(); await settleDecor()
  assert.equal(pending.length, 1)
  pending[0].resolve(false); await settleDecor()
  assert.equal(pending[1].value.category, 'folder:old')
  pending[1].resolve(true); await settleDecor()
  assert.equal(h.render().lastStickerCategory, 'folder:old')
  assert.equal(h.render().saveError, null)
})
test('저장 오류는 내부 코드·경로·cause를 노출하지 않고 한국어 재시도 안내로 변환한다', () => {
  for (const code of ['PNG_WRITE_FAILED', 'INVALID_CANDIDATE', 'DECODE_FAILED', 'UnknownException']) {
    const message = splitSaveError(new Error(`${code}: /data/user/0/private.png`, { cause: new Error('secret') }))
    assert.match(message, /[가-힣]/)
    assert.doesNotMatch(message, /private|secret|FAILED|Exception|\/data/)
  }
  assert.match(splitSaveError(new Error('PNG_WRITE_FAILED')), /저장 공간/)
  assert.match(splitSaveError(new Error('INVALID_CANDIDATE')), /다시 분리/)
  assert.match(splitSaveError(new Error('STICKER_TOO_LARGE')), /800만/)
  assert.equal(splitSaveError(new Error('같은 이름의 폴더가 있어요.')), '같은 이름의 폴더가 있어요.')
  const media = new MediaError('MEDIA_READ_FAILED', '선택한 파일을 읽지 못했어요.', new Error('/private/source'))
  assert.equal(splitSaveError(media), media.message)
})
const initialDecor = () => ({ folders: [{ id: 'old', name: '기존', items: [{ src: 'media:old', mediaFileId: 'old' }] }] })
test('일반 폴더 생성·이름 변경·이미지 추가·삭제 실패를 알리고 재시도하면 현재 내용을 보존한다', async () => {
  const changes = [
    api => api.addFolder('새 폴더'),
    api => api.renameFolder('old', '수정한 이름'),
    api => api.addToFolder('old', [{ src: 'media:new', mediaFileId: 'new' }]),
    api => api.removeFromFolder('old', { mediaFileId: 'old' }),
    api => api.removeFolder('old'),
  ]
  for (const change of changes) {
    const storage = { value: initialDecor() }, h = await decorHarness(storage)
    const before = structuredClone(storage.value)
    storage.fail = true
    change(h.api); h.render(); await settleDecor()
    let api = h.render()
    assert.match(api.saveError, /저장하지 못했어요/)
    assert.equal(api.savePending, false)
    assert.deepEqual(storage.value, before)
    const current = structuredClone(api.items)
    assert.notDeepEqual(current, before)
    storage.fail = false
    assert.equal(await api.retrySave(), true)
    api = h.render()
    assert.equal(api.saveError, null); assert.equal(api.savePending, false)
    assert.deepEqual(storage.value, current)
    h.unmount()
  }
})
test('실패 후 더 편집해도 재시도는 실패 당시 복사본 대신 최신 목록을 저장한다', async () => {
  const storage = { value: initialDecor() }, h = await decorHarness(storage)
  storage.fail = true
  h.api.renameFolder('old', '첫 이름'); h.render(); await settleDecor()
  const staleApi = h.render()
  staleApi.renameFolder('old', '최종 이름')
  staleApi.addToFolder('old', [{ src: 'media:new', mediaFileId: 'new' }])
  h.render(); await settleDecor()
  assert.match(h.render().saveError, /저장/)
  storage.fail = false
  assert.equal(await staleApi.retrySave(), true)
  assert.equal(storage.value.folders[0].name, '최종 이름')
  assert.deepEqual(storage.value.folders[0].items.map(x => x.mediaFileId), ['new', 'old'])
  h.unmount()
})
test('저장 API가 예외를 던져도 사용자 안내로 처리하고 다음 재시도가 정상 진행된다', async () => {
  const storage = { value: initialDecor() }, h = await decorHarness(storage)
  storage.write = async () => { throw new Error('EIO: internal storage failure') }
  h.api.renameFolder('old', '재시도할 내용'); h.render(); await settleDecor()
  const api = h.render()
  assert.match(api.saveError, /저장하지 못했어요/)
  assert.doesNotMatch(api.saveError, /EIO/)
  delete storage.write
  assert.equal(await api.retrySave(), true)
  assert.equal(h.render().saveError, null)
  assert.equal(storage.value.folders[0].name, '재시도할 내용')
  h.unmount()
})
test('재시도 중 중복 누름은 한 번만 저장하고 실패 안내는 성공 뒤 해제한다', async () => {
  const storage = { value: initialDecor() }, h = await decorHarness(storage)
  storage.fail = true
  h.api.addFolder('저장 대기'); h.render(); await settleDecor()
  const api = h.render(), startCount = storage.writes.length
  let finish
  storage.write = value => new Promise(resolve => { finish = ok => { if (ok) storage.value = structuredClone(value); resolve(ok) } })
  const first = api.retrySave(), second = api.retrySave()
  assert.equal(first, second)
  assert.equal(h.render().savePending, true)
  assert.match(h.render().saveError, /저장/)
  await settleDecor()
  assert.equal(storage.writes.length, startCount + 1)
  finish(false); assert.equal(await first, false)
  assert.match(h.render().saveError, /저장/)
  const next = api.retrySave(); await settleDecor()
  finish(true); assert.equal(await next, true)
  assert.equal(h.render().saveError, null)
  assert.equal(h.render().savePending, false)
  h.unmount()
})
test('연속 변경의 이전 저장 결과가 최신 요청의 실패·진행 상태를 덮지 않는다', async () => {
  for (const olderSuccess of [true, false]) {
    const storage = { value: initialDecor() }, h = await decorHarness(storage), jobs = []
    storage.write = value => new Promise(resolve => jobs.push(ok => { if (ok) storage.value = structuredClone(value); resolve(ok) }))
    h.api.renameFolder('old', '이전 변경'); h.render(); await settleDecor()
    h.render().renameFolder('old', '최신 변경'); h.render()
    assert.equal(jobs.length, 1)
    jobs[0](olderSuccess); await settleDecor()
    assert.equal(jobs.length, 2)
    assert.equal(h.render().savePending, true)
    assert.equal(h.render().saveError, null)
    jobs[1](!olderSuccess); await settleDecor()
    const latest = h.render()
    assert.equal(latest.savePending, false)
    if (olderSuccess) assert.match(latest.saveError, /저장/)
    else { assert.equal(latest.saveError, null); assert.equal(storage.value.folders[0].name, '최신 변경') }
    assert.equal(latest.items.folders[0].name, '최신 변경')
    h.unmount()
  }
})
test('보관함 재진입에서도 저장 실패와 편집 내용이 유지되고 복구 후 새 세션에서 복원한다', async () => {
  const storage = { value: initialDecor() }, h = await decorHarness(storage)
  storage.fail = true
  h.api.renameFolder('old', '아직 저장 전'); h.render(); await settleDecor()
  h.unmount()
  h.render(); await settleDecor()
  let api = h.render()
  assert.equal(api.items.folders[0].name, '아직 저장 전')
  assert.match(api.saveError, /저장/)
  assert.equal(storage.value.folders[0].name, '기존')
  storage.fail = false
  assert.equal(await api.retrySave(), true)
  h.unmount()
  const restarted = await decorHarness(storage)
  assert.equal(restarted.api.items.folders[0].name, '아직 저장 전')
  assert.equal(restarted.api.saveError, null)
  restarted.unmount()
})

test('같은 폴더 이름으로 새로 저장해도 ID와 내용이 분리되며 빈 이름은 거부한다', async () => {
  const storage = { value: { folders: [{ id: 'old', name: '여행', items: [{ emoji: '🌼' }] }] } };
  const h = await decorHarness(storage);
  const id = await h.api.saveGenerated(null, ' 여행 ', [{ emoji: '⭐' }]);
  h.render(); await new Promise(resolve => setImmediate(resolve));
  const folders = h.render().items.folders;
  assert.notEqual(id, 'old');
  assert.deepEqual(folders.map(f => f.name), ['여행', '여행']);
  assert.equal(folders.find(f => f.id === 'old').items[0].emoji, '🌼');
  assert.equal(folders.find(f => f.id === id).items[0].emoji, '⭐');
  await assert.rejects(h.render().saveGenerated(null, '  ', [{ emoji: '⭐' }]), /이름/);
  h.api.removeFolder(id); h.render();
  assert.deepEqual(h.render().items.folders.map(f => f.id), ['old']);
  h.unmount();
});

test('일반 폴더 생성·이름 변경도 중복을 허용하고 대상 ID의 내용만 변경한다', async () => {
  const storage={value:{folders:[{id:'old',name:'여행',items:[{emoji:'🌼'}]}]}};
  const h=await decorHarness(storage);
  const id=h.api.addFolder('여행');h.render();
  const another=h.render().addFolder('다른 이름');h.render();
  h.render().renameFolder(another,'여행');h.render();
  await new Promise(resolve=>setImmediate(resolve));
  const folders=h.render().items.folders;
  assert.deepEqual(folders.map(f=>f.name),['여행','여행','여행']);
  assert.equal(new Set(folders.map(f=>f.id)).size,3);
  assert.deepEqual(folders.find(f=>f.id==='old').items,[{emoji:'🌼'}]);
  assert.notEqual(id,another);
  h.unmount();
});

test('실제 facade는 release에서도 지원 모듈을 찾고 버전·필수 capability·비활성화를 검사한다', async () => {
  const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
  const source = readFileSync(new URL('../src/editor/services/stickerSplit.native.js', import.meta.url), 'utf8')
  const { code } = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const supported = { ...module, completeRegionVersion: 1, inspectInput() {}, prepareImage() {}, selectionEditingVersion: 1, groupEdges() {}, brushHits() {} }
  function load(native, { development = false, disabled = false, platform = 'android', throws = false } = {}) {
    const m = { exports: {} }, calls = []
    new Function('require', 'module', 'exports', '__DEV__', 'process', code)(id => {
      if (id === 'react-native') return { Platform: { OS: platform } }
      if (id === 'expo') return { requireOptionalNativeModule: name => { calls.push(name); if (throws) throw Error('missing'); return native } }
      if (id.endsWith('stickerSplit.js')) return { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, validateSplitOptions }
      if (id.endsWith('mediaPicker')) return { selectImages: async () => ({ canceled: true }) }
      return {}
    }, m, m.exports, development, { env: { EXPO_PUBLIC_DISABLE_STICKER_SPLIT: disabled ? '1' : undefined } })
    return { api: m.exports.stickerSplit, calls }
  }
  for (const development of [false, true]) {
    const { api, calls } = load(supported, { development })
    assert.equal(api.available, true)
    assert.equal(api.completeRegions, true)
    assert.equal(api.selectionEditing, true)
    assert.deepEqual(calls, ['DioStickerSplit'])
    assert.equal(await api.pick(), null, 'release도 실제 기능 진입 후 취소 처리가 가능하다')
  }
  for (const native of [null, { ...supported, apiVersion: 2 }, { ...supported, analyze: undefined }, { ...supported, completeRegionVersion: 0 }, { ...supported, prepareImage: undefined }]) {
    const { api } = load(native)
    assert.equal(api.available, false)
    await assert.rejects(api.pick())
  }
  const disabled = load(supported, { disabled: true })
  assert.equal(disabled.api.available, false)
  assert.deepEqual(disabled.calls, [], '명시적 비활성화는 모듈을 초기화하지 않는다')
  assert.equal(load(supported, { throws: true }).api.available, false)
  const limited = load({ ...supported, groupEdges: undefined }).api
  assert.equal(limited.available, true)
  assert.equal(limited.selectionEditing, false)
  assert.equal(load(module, { platform: 'ios' }).api.available, true)
  assert.equal(load(supported, { platform: 'web' }).api.available, false)
})

test('붙이는 순간 보관함이 닫혀도 최근 스티커 · 테이프 · 위젯이 남는다', async () => {
  const storage = { value: { folders: [] } }
  const harness = await decorHarness(storage)
  // 화면을 다시 그리지 않고 바로 닫는다: 붙이기와 닫기가 한 번에 처리되는 실제 흐름
  harness.api.markRecent({ builtin: 'moa-basic', name: '모아 기본' })
  harness.api.markRecentTape({ pattern: 'dots' })
  harness.api.markRecentWidget({ kind: 'memo', memo: 'moa', name: '모아 메모' })
  harness.unmount()
  await settleDecor()
  assert.equal(storage.value.recentStickers[0].builtin, 'moa-basic')
  assert.equal(storage.value.recentTapes[0].pattern, 'dots')
  assert.equal(storage.value.recentWidgets[0].memo, 'moa')
})

test('생성 폴더를 저장하는 동안 들어온 최근 기록이 사라지지 않는다', async () => {
  const storage = { value: { folders: [] } }
  const harness = await decorHarness(storage)
  let release
  const gate = new Promise(resolve => { release = resolve })
  storage.write = async value => { await gate; storage.value = structuredClone(value); return true }
  const saving = harness.api.saveGenerated(null, '별', [{ src: 'media:dot', mediaFileId: 'dot' }])
  harness.api.markRecent({ builtin: 'moa-basic', name: '모아 기본' })
  release()
  const id = await saving
  await settleDecor()
  const items = harness.render().items
  assert.equal(items.recentStickers[0].builtin, 'moa-basic')
  assert.ok(items.folders.some(f => f.id === id))
  assert.equal(storage.value.recentStickers[0].builtin, 'moa-basic')
  assert.ok(storage.value.folders.some(f => f.id === id))
})

test('최근 사진: 고른 순서로 앞에 두고 같은 사진은 옮기며 12장까지 남기고, 보관함을 바로 닫아도 저장한다', async () => {
  const storage = { value: { folders: [] } }
  const photo = n => ({ src: `media:p${n}`, mediaFileId: `p${n}`, name: `${n}.jpg`, width: 10, height: 20, extra: 'x' })
  const harness = await decorHarness(storage)
  harness.api.markRecentPhotos(Array.from({ length: 13 }, (_, n) => photo(n)))
  harness.api.markRecentPhotos([photo(5)])
  harness.unmount()
  await settleDecor()
  const saved = storage.value.recentPhotos
  assert.equal(saved.length, 12)
  assert.equal(saved[0].mediaFileId, 'p5')
  assert.equal(saved.filter(item => item.mediaFileId === 'p5').length, 1)
  assert.equal(saved[0].extra, undefined)
  assert.equal(saved[0].width, 10)
})
