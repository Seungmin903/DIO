import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as groups from '../src/editor/utils/stickerSplitGroups.js'
import { initialStickerGrouping } from '../src/editor/utils/stickerInitialGrouping.js'
import * as split from '../src/editor/utils/stickerSplit.js'
import { saveSplitSelection, splitSaveError } from '../src/editor/utils/stickerSplitSave.js'
import * as cropUtils from '../src/editor/utils/stickerSplitCrop.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const codeCache = new Map()
function harness(path, dependencies = {}) {
  if (!codeCache.has(path)) codeCache.set(path, expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/${path}`, import.meta.url), 'utf8'), {
    filename: path, configFile: false, babelrc: false, presets: [[expo.resolve('babel-preset-expo'), { jsxRuntime: 'automatic' }]],
    plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  }).code)
  let cursor = 0, effects = [], states = [], deps = [], cleanups = [], timerId = 0
  const timers = new Map(), m = { exports: {} }, jsx = (type, props) => ({ type, props })
  const react = {
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], next => { states[i] = typeof next === 'function' ? next(states[i]) : next }] },
    useRef(initial) { const i = cursor++; return states[i] ??= { current: initial } },
    useMemo(fn, next) { const i = cursor++; if (!deps[i] || next.some((value, n) => value !== deps[i][n])) { states[i] = fn(); deps[i] = next }; return states[i] },
    useEffect(fn, next) { const i = cursor++; if (!deps[i] || next.some((v, n) => v !== deps[i][n])) { effects.push({ i, fn }); deps[i] = next } },
  }
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', '__DEV__', codeCache.get(path))(id => {
    if (id in dependencies) return dependencies[id]
    if (id === 'react') return react
    if (id === 'expo/virtual/env') return { env: {} }
    if (id.startsWith('@babel/runtime/')) return expo(id)
    if (id.includes('jsx-runtime')) return { jsx, jsxs: jsx }
    if (id === 'react-native') return { View: 'View', Image: 'Image', Text: 'Text', Pressable: 'Pressable', StyleSheet: { create: v => v, absoluteFill: {} } }
    if (id === 'react-native-svg') return { __esModule: true, default: 'Svg', Circle: 'Circle', Path: 'Path', Rect: 'Rect', Text: 'SvgText' }
    if (id.endsWith('/theme')) return { colors: {}, radius: {}, DISABLED_OPACITY: 0.4 }
    if (id.endsWith('/stickerSplit.js')) return split
    if (id.endsWith('/stickerSplitGroups.js')) return groups
    if (id.endsWith('/stickerInitialGrouping.js')) return { initialStickerGrouping }
    if (id.endsWith('/stickerSplitCrop.js')) return cropUtils
    throw new Error(`unexpected dependency ${id}`)
  }, m, m.exports, fn => { timers.set(++timerId, fn); return timerId }, id => timers.delete(id), true)
  return {
    exports: m.exports,
    render(...args) { cursor = 0; const value = m.exports.default(...args); const tasks = effects; effects = []; for (const { i, fn } of tasks) { cleanups[i]?.(); cleanups[i] = fn() }; return value },
    timers() { const tasks = [...timers.values()]; timers.clear(); tasks.forEach(fn => fn()) },
    unmount() { cleanups.forEach(fn => fn?.()) },
  }
}
const settle = () => new Promise(resolve => setImmediate(resolve))
test('초기 묶음은 즉시 표시하고 같은 거리를 중복 조회하지 않으며 사용자 조정 이력을 유지한다', async () => {
  const h = editingHarness()
  h.render().reset(candidates.map(p => p.id), { parts: candidates, distance: 2, edges: [['a', 'b']] })
  assert.equal(h.render().distance, 2); assert.equal(h.render().ready, true)
  assert.equal(h.render().groups.length, 2); assert.equal(h.render().canUndo, false)
  h.timers(); assert.equal(h.jobs.length, 0)
  h.render().setDistance(3); h.render(); h.timers(); h.jobs[0].resolve([['a', 'b'], ['b', 'c']]); await settle()
  assert.equal(h.render().groups.length, 1)
  h.render().undo(); assert.equal(h.render().distance, 2)
  h.render().reset(candidates.map(p => p.id), { distance: 3 }); h.render(); h.timers()
  assert.equal(h.render().distance, 3); assert.equal(h.render().ready, false)
  h.unmount()
})
const candidates = ['a', 'b', 'c'].map((id, i) => ({ id, x: i * 3, y: 0, width: 1, height: 1 }))
const image = { width: 200, height: 100 }
function editingHarness(enabled = true) {
  const jobs = [], cancelled = [], cleaned = [], tracked = { current: [] }
  const service = { selectionEditing: enabled, groupEdges(parts, distance) {
    const job = { id: `job${jobs.length}`, parts, distance }
    job.promise = new Promise((resolve, reject) => { job.resolve = resolve; job.reject = reject }); jobs.push(job); return job
  }, cancel: id => cancelled.push(id), cleanup: async ids => cleaned.push(...ids) }
  const h = harness('hooks/useStickerSplitEditing.js', { '../services/stickerSplit': { stickerSplit: service } })
  const render = () => h.render(candidates, image, split.FULL_CROP, tracked)
  render().reset(['a', 'b', 'c'])
  return { ...h, render, jobs, cancelled, cleaned, tracked }
}
test('자동·수동 묶음을 원래 조각으로 분리하고 선택·이력·나머지 묶음을 보존한다', async () => {
  const h = editingHarness()
  h.render().reset(['a', 'b', 'c'], { parts: candidates, distance: 1, edges: [['a', 'b']] })
  h.render().splitSelected(['a', 'b']); assert.equal(h.render().groups.length, 3)
  assert.deepEqual(h.render().selected, ['a', 'b', 'c']); assert.equal(h.render().distance, 1)
  h.timers(); assert.equal(h.jobs.length, 0)
  h.render().undo(); assert.equal(h.render().groups.length, 2)
  h.render().redo(); assert.equal(h.render().groups.length, 3)
  h.render().mergeSelected(['a', 'b']); assert.equal(h.render().groups.length, 2)
  h.render().splitSelected(['a', 'b']); assert.equal(h.render().groups.length, 3)
  h.render().setDistance(2); h.render(); h.timers(); h.jobs[0].resolve([['a', 'b']]); await settle()
  assert.equal(h.render().groups.length, 2)
  h.unmount()
})
test('분리된 조각의 제외·복구와 미지원 환경의 수동 묶음 분리를 유지한다', async () => {
  const h = editingHarness(false)
  h.render().mergeSelected(['a', 'b']); assert.equal(h.render().groups.length, 2)
  h.render().splitSelected(['a', 'b']); assert.equal(h.render().groups.length, 3)
  h.render().setSelected(['b', 'c']); h.render().setSelected(['a', 'b', 'c'])
  assert.equal(h.render().groups.length, 3)
  h.render().splitSelected(['a']); assert.equal(h.render().groups.length, 3)
  h.render().reset(['a', 'b', 'c']); assert.equal(h.render().canUndo, false)
  assert.equal(h.jobs.length, 0); h.unmount()
})
test('새 거리·선택 요청이 이전 결과를 무시하고 최신 미리보기 준비 전 저장을 차단한다', async () => {
  const h = editingHarness()
  h.render().setDistance(1); assert.equal(h.render().ready, false); h.timers()
  h.render().setDistance(2); h.render(); h.timers()
  assert.equal(h.jobs[1].distance, 2); assert.deepEqual(h.cancelled, ['job0'])
  h.jobs[1].resolve([['a', 'b']]); await settle()
  assert.equal(h.render().groups.length, 2); assert.equal(h.render().ready, true)
  h.jobs[0].resolve([['a', 'b'], ['b', 'c']]); await settle()
  assert.equal(h.render().groups.length, 2)
  h.render().setSelected(['a', 'c']); assert.equal(h.render().ready, false); h.timers()
  assert.deepEqual(h.jobs[2].parts.map(p => p.id), ['a', 'c'])
  h.jobs[2].resolve([]); await settle(); assert.equal(h.render().groups.length, 2)
  h.unmount()
})
test('슬라이더 미리보기는 이력을 쌓지 않고 손을 뗀 값만 한 번 기록하며 취소하면 복원한다', () => {
  const h = editingHarness()
  let api = h.render(); api.previewDistance(1); api = h.render(); api.previewDistance(3)
  api = h.render(); assert.equal(api.distance, 3); api.cancelDistance()
  api = h.render(); assert.equal(api.distance, 0)
  api.setDistance(4); api = h.render(); api.undo()
  api = h.render(); assert.equal(api.distance, 0); api.redo(); assert.equal(h.render().distance, 4)
  h.unmount()
})
test('묶음 재계산 중에는 마지막 확정 목록을 유지하고 완료 시 번호·정렬을 함께 갱신한다', async () => {
  const h = editingHarness()
  h.render().setDistance(1); h.render(); h.timers(); h.jobs[0].resolve([['a', 'b']]); await settle()
  const confirmed = h.render().groups
  assert.deepEqual(confirmed.map(g => g.members.map(p => p.id)), [['a', 'b'], ['c']])
  h.render().setDistance(2); assert.equal(h.render().groups, confirmed); assert.equal(h.render().ready, false)
  h.timers(); h.jobs[1].resolve([['a', 'b'], ['b', 'c']]); await settle()
  assert.equal(h.render().groups.length, 1); assert.equal(h.render().groups[0].number, 1)
  h.unmount()
})
test('직접 묶기는 지정한 객체만 묶고 나머지 저장 선택과 실행 취소를 보존한다', () => {
  const h = editingHarness()
  h.render().mergeSelected(['a', 'b'])
  assert.deepEqual(h.render().selected, ['a', 'b', 'c'])
  assert.deepEqual(h.render().groups.map(g => g.members.map(p => p.id)), [['a', 'b'], ['c']])
  h.render().undo(); assert.equal(h.render().groups.length, 3)
  h.render().redo(); assert.equal(h.render().groups.length, 2)
  h.unmount()
})

test('분리 브러시 한 획은 선택을 보존하고 묶음 해제 이력을 한 번만 남긴다', () => {
  const h = editingHarness()
  h.render().reset(['a','b','c'], { parts: candidates, distance: 2, edges: [['a','b'],['b','c']] })
  h.render().splitSelected(groups.splitBrushTargets(h.render().groups, ['b']))
  assert.deepEqual(h.render().groups.map(group => group.members.map(part => part.id)), [['a','c'],['b']]); assert.deepEqual(h.render().selected, ['a','b','c'])
  h.render().undo(); assert.equal(h.render().groups.length, 1); assert.equal(h.render().canUndo, false)
  h.render().redo(); assert.equal(h.render().groups.length, 2)
  h.unmount()
})

test('수동 묶음도 닿은 객체만 빠지고 나머지는 묶음과 분리 상태를 유지한다', () => {
  const h = editingHarness(false)
  h.render().mergeSelected(['a','b','c']); h.render().splitSelected(['a'])
  assert.deepEqual(h.render().groups.map(group => group.members.map(part => part.id)), [['b','c'],['a']])
  h.render().setSelected(['a','c']); h.render().setSelected(['a','b','c'])
  assert.deepEqual(h.render().groups.map(group => group.members.map(part => part.id)), [['b','c'],['a']])
  h.render().splitSelected(['b'])
  assert.equal(h.render().groups.length, 3)
  h.unmount()
})
test('계산 실패는 미리보기 준비로 오인하지 않고 새 거리 요청·0·새 분석으로 복구한다', async () => {
  const h = editingHarness()
  h.render().setDistance(1); h.render(); h.timers(); h.jobs[0].reject(new Error('disk failure')); await settle()
  assert.equal(h.render().ready, false); assert.ok(h.render().error)
  h.render().retry(); h.render(); h.timers(); assert.equal(h.render().pending, true)
  h.jobs[1].resolve([['a', 'b']]); await settle(); assert.equal(h.render().ready, true)
  h.render().setDistance(0); assert.equal(h.render().ready, true)
  h.render().reset(['a']); const api = h.render(); assert.equal(api.error, ''); assert.equal(api.canUndo, false)
  h.unmount()
})

function facade(os, module, overrides = {}) {
  let uuid = 0
  return harness('services/stickerSplit.native.js', {
    'react-native': { Platform: { OS: os } }, expo: { requireOptionalNativeModule: () => module },
    'expo-crypto': { randomUUID: () => `job-${uuid++}` }, 'expo-image-manipulator': {}, 'expo-file-system': {}, '../utils/mediaPicker': {}, ...overrides,
  }).exports.stickerSplit
}
test('실제 native facade는 Android capability만 켜며 iOS·구형·Expo Go는 기존 API를 유지한다', () => {
  const module = { apiVersion: 3, selectionEditingVersion: 1, completeRegionVersion: 1, inspectInput() {}, prepareImage() {}, analyze() {}, merge() {}, cleanup() {}, cancel() {}, groupEdges() {}, brushHits() {} }
  assert.equal(facade('android', module).selectionEditing, true)
  assert.equal(facade('ios', module).selectionEditing, false)
  const old = facade('android', { ...module, selectionEditingVersion: undefined })
  assert.equal(old.available, true); assert.equal(old.selectionEditing, false)
  const oldCrop = facade('android', { ...module, completeRegionVersion: undefined })
  assert.equal(oldCrop.available, false); assert.match(oldCrop.reason, /업데이트/)
  const go = facade('android', null); assert.equal(go.available, false); assert.equal(go.selectionEditing, false)
})

function regionPreview() {
  const crops = [], readiness = [], h = harness('components/panels/StickerSplitPreview.js')
  const props = { source: { uri: 'file:///source', previewUri: 'file:///preview', previewWidth: 1024, previewHeight: 512, width: 400, height: 200 },
    crop: split.FULL_CROP, cropDefined: false, adjustableCrop: true, parts: [], selected: [], mode: 'crop', view: { zoom: 1, x: 0, y: 0 },
    onReady: (...value) => readiness.push(value), onView() {}, onInteraction() {}, onCrop(rect) { crops.push(rect); props.crop = rect; props.cropDefined = true } }
  const render = () => h.render(props), input = () => render().props.children.at(-1).props
  const load = () => render().props.children[0].props.onLoad()
  render().props.onLayout({ nativeEvent: { layout: { width: 400, height: 300 } } })
  return { props, render, input, load, crops, readiness }
}
test('영역 프레임은 첫 생성 이후 이동·조정하며 손을 떼기 전에는 확정하지 않는다', () => {
  const h = regionPreview(); h.load()
  h.input().onResponderGrant(event(150, 275, 50, 75))
  h.input().onResponderMove(event(350, 375)); assert.equal(h.crops.length, 0)
  h.input().onResponderRelease(event(350, 375))
  assert.deepEqual(h.crops[0], { x: 0.125, y: 0.125, width: 0.5, height: 0.5 })
  h.input().onResponderGrant(event(250, 325, 150, 125))
  h.input().onResponderMove(event(270, 335)); assert.equal(h.crops.length, 1)
  h.input().onResponderRelease(event(270, 335))
  assert.ok(Math.abs(h.crops[1].x - 0.175) < 1e-8); assert.ok(Math.abs(h.crops[1].y - 0.175) < 1e-8)
  assert.equal(h.crops[1].width, 0.5)
  h.input().onResponderGrant(event(480, 440, 380, 240)); h.input().onResponderMove(event(400, 400)); h.input().onResponderRelease(event(400, 400))
  assert.equal(h.crops.length, 2)
})
test('프레임 조정 중 입력 취소·두 손가락 전환은 확정 영역을 보존한다', () => {
  const h = regionPreview(); h.props.crop = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }; h.props.cropDefined = true; h.load()
  h.input().onResponderGrant(event(200, 300, 100, 100)); h.input().onResponderMove(event(160, 280)); h.input().onResponderTerminate()
  assert.equal(h.crops.length, 0)
  h.input().onResponderGrant(event(200, 300, 100, 100)); h.input().onResponderMove(event(160, 280))
  h.input().onResponderStart(event(200, 300, 100, 100, [{ pageX: 200, pageY: 300 }, { pageX: 240, pageY: 300 }]))
  h.input().onResponderRelease(event(160, 280)); assert.equal(h.crops.length, 0)
  assert.deepEqual(h.props.crop, { x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
})
test('첫 로딩·이미지 교체·잘못된 크기·재시도에서 늦은 응답을 무시하고 입력을 차단한다', () => {
  const h = regionPreview()
  assert.equal(!!h.input().onStartShouldSetResponder(), false)
  const firstLoad = h.render().props.children[0].props.onLoad
  h.props.source = { ...h.props.source, uri: 'file:///next', previewUri: 'file:///next-preview' }
  h.render(); firstLoad(); assert.equal(!!h.input().onStartShouldSetResponder(), false)
  const staleLoad = h.render().props.children[0].props.onLoad
  staleLoad({ nativeEvent: { source: { width: 512, height: 1024 } } })
  assert.equal(!!h.input().onStartShouldSetResponder(), false)
  find(h.render(), node => node.props?.accessibilityLabel === '미리보기 다시 시도').props.onPress()
  h.render(); staleLoad(); assert.equal(!!h.input().onStartShouldSetResponder(), false)
  h.load(); assert.equal(!!h.input().onStartShouldSetResponder(), true)
  assert.deepEqual(h.readiness.at(-1), ['file:///next', true])
  h.render().props.children[0].props.onError(); assert.equal(!!h.input().onStartShouldSetResponder(), false)
  assert.deepEqual(h.readiness.at(-1), ['file:///next', false])
})
test('2000px PNG의 성공 이벤트가 1000px로 와도 오류를 표시하지 않고 분리를 허용한다', () => {
  const h = regionPreview()
  h.props.source = { ...h.props.source, width: 2000, height: 2000, previewWidth: 2000, previewHeight: 2000 }
  h.render().props.children[0].props.onLoad({ nativeEvent: { source: { width: 1000, height: 1000 } } })
  assert.equal(!!h.input().onStartShouldSetResponder(), true)
  assert.deepEqual(h.readiness.at(-1), ['file:///source', true])
  assert.equal(find(h.render(), node => node.props?.accessibilityLabel === '미리보기 다시 시도'), null)
})
test('이미지 선택 취소·형식 검사 실패는 변환을 시작하지 않고 임시 복사본만 정리한다', async () => {
  let cancelled = true, deleted = 0, prepared = 0
  class File { constructor(...values) { this.uri = values.join('/') } get size() { return 100 } get exists() { return true } async copy() {} delete() { deleted++ } }
  const api = facade('android', { apiVersion: 3, completeRegionVersion: 1, analyze() {}, merge() {}, cancel() {}, async cleanup() {},
    inspectInput: async () => { throw new Error('SVG_SPLIT_UNSUPPORTED') }, prepareImage: async () => { prepared++ },
  }, { 'expo-file-system': { File, Paths: { cache: 'file:///cache' } }, '../utils/mediaPicker': { selectImages: async () => cancelled ? { canceled: true } : { assets: [{ uri: 'file:///sheet.svg' }] } } })
  assert.equal(await api.pick(), null); assert.equal(deleted, 0)
  cancelled = false; await assert.rejects(api.pick(), /SVG_SPLIT_UNSUPPORTED/)
  assert.equal(prepared, 0); assert.equal(deleted, 1)
})
test('종료 시 분석 결과를 읽는 묶음 작업까지 기다린 후 임시 파일을 지운다', async () => {
  let finishAnalyze, finishGroup
  const removed = [], api = facade('android', {
    apiVersion: 3, completeRegionVersion: 1, inspectInput() {}, prepareImage() {}, analyze: () => new Promise(resolve => { finishAnalyze = resolve }),
    groupEdges: () => new Promise(resolve => { finishGroup = resolve }), merge() {}, cancel() {}, cleanup: async id => removed.push(id),
  })
  const analyze = api.analyze('file:///sheet', { crop: split.FULL_CROP, autoBackground: true, tolerance: 35 }), group = api.groupEdges([], 2)
  await settle(); finishAnalyze('{"parts":[]}'); await analyze.promise
  const cleanup = api.cleanup([analyze.id, group.id]); await settle(); assert.deepEqual(removed, [])
  finishGroup('[]'); await cleanup; assert.deepEqual(removed, [analyze.id, group.id])
})

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const item of node) { const hit = find(item, predicate); if (hit) return hit }; return null }
  if (predicate(node)) return node
  return find(node.props?.children, predicate) || find(node.props?.ListHeaderComponent, predicate)
}
test('탭은 배경·포함 제외·묶기·확인 순서이며 선택한 탭을 다시 눌러도 유지한다', () => {
  const values = [], h = harness('components/panels/StickerSplitTools.js', { '../controls/Icon': { __esModule: true, default: 'Icon' } })
  const props = { section: 'background', onChange: value => values.push(value), hasResults: true, summaries: { results: '18개' }, children: 'panel' }
  let tree = h.render(props)
  const tabs = tree.props.children[0].props.children
  assert.equal(tabs.length, 4)
  assert.deepEqual(tabs.map(node => node.props.accessibilityLabel), ['배경 조정', '포함·제외', '객체 묶기', '스티커 확인'])
  assert.ok(tabs.every(node => node.props.accessibilityRole === 'tab'))
  assert.equal(tabs[3].props.children.props.children, '스티커 확인')
  tabs[2].props.onPress(); assert.deepEqual(values, ['grouping'])
  props.section = 'grouping'; tree = h.render(props)
  assert.equal(tree.props.children[1].props.children[1], 'panel')
  assert.equal(tree.props.children[0].props.children.filter(node => node.props.accessibilityState.selected).length, 1)
  tree.props.children[0].props.children[2].props.onPress(); assert.equal(values.length, 1)
  props.hasResults = false; props.section = 'background'; tree = h.render(props)
  assert.deepEqual(tree.props.children[0].props.children.map(node => node.props.disabled), [false, true, true, true])
  props.section = 'results'; props.hasResults = true; tree = h.render(props)
  const status = find(tree, node => node.props?.testID === 'sticker-tool-status')
  assert.equal(status.props.children[0].props.children, '총 개수')
  assert.equal(status.props.children[1].props.children.props.children, '18개')
})

test('버튼 작업 모드 문자열이 Android disabled·selected 상태로 직접 전달되지 않는다', () => {
  const h = harness('components/panels/StickerSplitTools.js', { '../controls/Icon': { __esModule: true, default: 'Icon' } })
  for (const component of [h.exports.SplitAction, h.exports.SplitIconAction]) {
    for (const value of ['split', 'merge', true, false]) {
      const props = component({ label: '검증', disabled: value, active: value }).props
      assert.equal(props.disabled, Boolean(value))
      assert.equal(props.accessibilityState.disabled, Boolean(value))
      assert.equal(props.accessibilityState.selected, Boolean(value))
    }
  }
})
test('묶음 썸네일은 측정 이후 구성 이미지들을 같은 상대 배치로 표시한다', () => {
  const h = harness('components/panels/StickerGroupThumbnail.js')
  const group = { id: 'group', x: 0, y: 0, width: 20, height: 10, members: [{ id: 'a', uri: 'a', x: 0, y: 0, width: 5, height: 10 }, { id: 'b', uri: 'b', x: 15, y: 0, width: 5, height: 10 }] }
  const props = { group }
  h.render(props).props.onLayout({ nativeEvent: { layout: { width: 116, height: 66 } } })
  const images = h.render(props).props.children[1]
  assert.equal(images.length, 2)
  assert.equal(images[0].props.style[1].left, 8); assert.equal(images[1].props.style[1].left, 83)
  assert.equal(images[0].props.style[1].width, 25)
})
test('실제 모달은 미리보기 준비를 기다리고 저장 실패 후 같은 묶음을 재시도한다', async () => {
  let selected = [], ready = true, failed = true, closes = 0, published = 0, discarded = 0, merges = 0
  const cleaned = [], alerts = []
  let pickError = false, pickCancelled = true, picks = 0, analyses = 0
  const tolerances = []
  let splitDone = false, splitCalls = 0, brushHitIds = []
  const parts = candidates.map(p => ({ ...p, uri: `file:///${p.id}.png`, area: 1 }))
  const editing = { enabled: true, get selected() { return selected }, get ready() { return ready },
    get groups() { return groups.sortedStickerGroups(groups.splitGroups(parts, selected, splitDone ? [] : [['a', 'b']])) },
    reset(value = []) { selected = value }, setSelected(value) { selected = typeof value === 'function' ? value(selected) : value }, distance: 0,
    splitSelected(ids) { if (!ids.length) return; assert.deepEqual(ids, ['a']); splitDone = true; splitCalls++ }, canUndo: true, undo() { splitDone = false },
  }
  const h = harness('components/panels/StickerSplitModal.js', {
    'react-native': { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', useWindowDimensions: () => ({ width: 360, height: 800 }), Alert: { alert: (...values) => alerts.push(values) }, StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    '../controls/EditorModal': { __esModule: true, default: 'EditorModal' }, './StickerSplitPreview': { __esModule: true, default: 'Preview' },
    './StickerSplitSlider': { __esModule: true, default: 'Slider' }, '../controls/PenSafeTextInput': { __esModule: true, default: 'Input' },
    './StickerSplitTools': { __esModule: true, default: 'Tools', SplitAction: 'Action', SplitIconAction: 'IconAction' },
    './StickerGroupThumbnail': { __esModule: true, default: 'Thumbnail' },
    '../../hooks/useStickerSplitEditing': { __esModule: true, default: () => editing },
    '../../utils/stickerSplitSave.js': { saveSplitSelection, splitSaveError },
    '../../services/stickerSplit': { stickerSplit: { completeRegions: true, pick: async () => { picks++; if (pickError) throw new Error('SVG_SPLIT_UNSUPPORTED'); if (pickCancelled) return null; return { ...image, uri: 'file:///sheet' } }, cleanup: async ids => cleaned.push(...ids), cancel() {}, disposeSource() {},
      analyze: (_uri, options) => { analyses++; tolerances.push(options.tolerance); return { id: 'analyze', promise: Promise.resolve({ parts }) } },
      brushHits: () => ({ id: 'brush', promise: Promise.resolve(brushHitIds) }),
      merge(members) { merges++; assert.deepEqual(members.map(p => p.id), ['a', 'b']); return { id: `merge${merges}`, promise: Promise.resolve({ uri: 'file:///ab.png', width: 4, height: 1 }) } },
    } },
    '../../services/mediaStore': { importMedia: async assets => assets.map((asset, i) => ({ ...asset, src: asset.uri, mediaFileId: `new${i}` })), discardGeneratedMedia: async () => { discarded++ } },
  })
  const props = { initialName: '별', onClose: () => { closes++ }, onSave: async (_folder, _name, items) => { if (failed) throw new Error('PNG_WRITE_FAILED /private/result.png', { cause: new Error('/private/source.png') }); assert.equal(items.length, 2); published++ } }
  const render = () => h.render(props), action = label => find(render(), node => node.props?.label === label).props
  const opening = render().props.onShow()
  render().props.onShow(); await opening
  assert.equal(picks, 1); assert.equal(find(render(), node => node.type === 'Preview'), null)
  pickCancelled = false
  await action('이미지 선택').onPress()
  render().props.onShow(); assert.equal(picks, 2)
  assert.equal(find(render(), node => node.type === 'Tools').props.section, 'background')
  assert.equal(find(render(), node => node.props?.label === '배경 허용 범위').props.min, 0)
  assert.equal(find(render(), node => node.props?.label === '배경 허용 범위').props.value, 10)
  assert.deepEqual(find(render(), node => node.type === 'Preview').props.crop, split.FULL_CROP)
  assert.equal(find(render(), node => node.type === 'Preview').props.cropDefined, true)
  assert.ok(action('영역 조정'))
  assert.equal(action('분리하기').disabled, true)
  find(render(), node => node.type === 'Preview').props.onReady('file:///sheet', true)
  await action('분리하기').onPress()
  assert.deepEqual(tolerances, [10])
  assert.equal(find(render(), node => node.type === 'Tools').props.section, 'results')
  const cards = () => find(render(), node => node.type === 'FlatList').props
  find(render(), node => node.type === 'Tools').props.onChange('grouping')
  action('직접 분리').onPress()
  assert.equal(find(render(), node => node.type === 'Preview').props.mode, 'brush-split')
  assert.ok(find(render(), node => node.props?.label === '분리 브러시 굵기'))
  await find(render(), node => node.type === 'Preview').props.onBrush([{ x: 1, y: 1 }], 6, 'split')
  assert.equal(splitCalls, 0)
  const cardAction = item => find(cards().renderItem({ item }), node => node.type === 'Pressable' && node.props.accessibilityRole === 'button').props
  const cardCheck = item => find(cards().renderItem({ item }), node => node.props.accessibilityRole === 'checkbox').props
  brushHitIds = ['a']
  await find(render(), node => node.type === 'Preview').props.onBrush([{ x: 1, y: 1 }], 6, 'split')
  assert.equal(splitCalls, 1); assert.equal(selected.length, 3)
  find(render(), node => node.type === 'Tools').props.onChange('results')
  assert.equal(cards().data.length, 3)
  action('실행 취소').onPress()
  assert.equal(cards().data.length, 2)
  const firstGroup = cards().data[0], firstCard = cardAction(firstGroup)
  firstCard.onPressIn(); firstCard.onPress(); assert.deepEqual(selected, ['a', 'b', 'c'])
  assert.equal(find(render(), node => node.type === 'Preview').props.focusedGroupId, firstGroup.id)
  const offsets = [], listProps = cards(); listProps.ref.current = { scrollToOffset: value => offsets.push(value) }
  listProps.ListHeaderComponent.props.onLayout({ nativeEvent: { layout: { height: 300 } } })
  find(render(), node => node.type === 'Preview').props.onPoint({ x: 0.0325, y: 0.005 })
  assert.equal(offsets.length, 1); assert.equal(find(render(), node => node.type === 'Preview').props.focusedGroupId, 'c')
  cardCheck(firstGroup).onPress(); assert.deepEqual(selected, ['c'])
  find(render(), node => node.type === 'Preview').props.onPoint({ x: 0.0025, y: 0.005 })
  assert.equal(find(render(), node => node.type === 'Tools').props.section, 'selection')
  action('이 객체 포함').onPress(); assert.deepEqual(selected, ['c', 'a'])
  find(render(), node => node.type === 'Tools').props.onChange('results')
  action('목록 더보기').onPress(); action('모두 선택').onPress(); assert.equal(selected.length, 3)
  const longCard = cardAction(cards().data[0])
  longCard.onPressIn(); longCard.onLongPress(); longCard.onPress(); assert.equal(selected.length, 3)
  action('확대 닫기').onPress()
  find(render(), node => node.type === 'Tools').props.onChange('selection')
  action('추가 브러시').onPress()
  find(render(), node => node.props?.label === '선택 브러시 굵기').props.onCommit(40)
  find(render(), node => node.type === 'Tools').props.onChange(null)
  assert.equal(find(render(), node => node.type === 'Preview').props.mode, 'review')
  find(render(), node => node.type === 'Tools').props.onChange('selection'); action('추가 브러시').onPress()
  assert.equal(find(render(), node => node.props?.label === '선택 브러시 굵기').props.value, 40)
  find(render(), node => node.type === 'Tools').props.onChange('background')
  find(render(), node => node.props?.label === '배경 허용 범위').props.onPreview(40)
  assert.equal(find(render(), node => node.props?.label === '배경 허용 범위').props.value, 40)
  find(render(), node => node.props?.label === '배경 허용 범위').props.onCancel()
  assert.equal(find(render(), node => node.props?.label === '배경 허용 범위').props.value, 10)
  assert.equal(action('2개 저장').disabled, false)
  action('영역 조정').onPress()
  assert.equal(find(render(), node => node.props?.label === '확대'), null)
  assert.equal(find(render(), node => node.props?.label === '축소'), null)
  find(render(), node => node.type === 'Preview').props.onCrop({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  assert.equal(analyses, 1); assert.equal(action('다시 분리하기').disabled, false)
  action('다시 분리하기').onPress(); assert.equal(alerts.length, 1)
  await alerts[0][2][1].onPress(); assert.equal(analyses, 2)
  action('영역 조정').onPress()
  assert.deepEqual(find(render(), node => node.type === 'Preview').props.crop, { x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  assert.equal(find(render(), node => node.type === 'Preview').props.cropDefined, true)
  assert.equal(find(render(), node => node.props?.label === '전체 영역'), null)
  assert.equal(find(render(), node => node.props?.label === '다른 영역 추가'), null)
  find(render(), node => node.type === 'Tools').props.onChange('background')
  find(render(), node => node.props?.label === '배경 허용 범위').props.onCommit(0)
  assert.equal(find(render(), node => node.props?.label === '배경 허용 범위').props.value, 0)
  action('다시 분리하기').onPress(); await alerts.at(-1)[2][1].onPress()
  assert.equal(tolerances.at(-1), 0)
  find(render(), node => node.type === 'Tools').props.onChange(null)
  pickError = true; await action('이미지 바꾸기').onPress()
  assert.equal(find(render(), node => node.type === 'Preview').props.source.uri, 'file:///sheet')
  assert.equal(selected.length, 3)
  ready = false; assert.equal(action('2개 저장').disabled, true)
  await action('2개 저장').onPress(); assert.equal(merges, 0)
  ready = true
  const warn = console.warn; console.warn = () => {}
  try { await action('2개 저장').onPress() } finally { console.warn = warn }
  assert.equal(closes, 0); assert.equal(discarded, 1); assert.equal(selected.length, 3)
  assert.deepEqual(cleaned, ['merge1'])
  const notice = find(render(), node => node.props?.accessibilityRole === 'alert')
  assert.match(notice.props.children, /저장 공간/)
  assert.doesNotMatch(notice.props.children, /PNG_WRITE_FAILED|private|상세:/)
  failed = false; await action('2개 저장').onPress()
  assert.equal(published, 1); assert.equal(closes, 1); assert.equal(merges, 2)
})
test('구형 Android·iOS·Expo Go 분기는 새 네이티브 메서드를 호출하지 않는다', () => {
  const h = editingHarness(false)
  assert.equal(h.render().enabled, false); assert.equal(h.render().ready, true)
  h.render().setDistance(2); h.render(); h.timers(); assert.equal(h.jobs.length, 0)
  h.render().mergeSelected(['a', 'b']); assert.equal(h.render().groups.length, 2); assert.equal(h.jobs.length, 0)
  h.unmount()
})

test('모달은 첫 분석의 초기 묶기를 기다리고 취소·재분리·미지원 환경에서는 설정을 지킨다', async () => {
  for (const scenario of ['success', 'cancel', 'unsupported']) {
    const parts = Array.from({ length: 120 }, (_, i) => ({ id: `p${i}`, uri: `file:///p${i}.png`, x: i * 2, y: 0, width: 1, height: 1 }))
    let selected = [], distance = 0, edges = [], firstResolve, queries = 0, analyses = 0
    const cleaned = [], cancelled = []
    const makeEdges = pixels => parts.slice(1, parts.length - (pixels < 23 ? 80 : 40) + 1).map(p => [parts[0].id, p.id])
    const editing = { enabled: scenario !== 'unsupported', ready: true, get selected() { return selected }, get distance() { return distance },
      get groups() { return groups.sortedStickerGroups(groups.splitGroups(parts, selected, edges)) },
      reset(ids = [], initial) { selected = ids; distance = initial?.distance ?? 0; edges = initial?.edges ?? [] },
      setDistance(value) { distance = value },
    }
    const h = harness('components/panels/StickerSplitModal.js', {
      'react-native': { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', FlatList: 'FlatList', ActivityIndicator: 'ActivityIndicator', useWindowDimensions: () => ({ width: 360, height: 800 }), Alert: { alert: (_title, _text, buttons) => buttons[1].onPress() }, StyleSheet: { create: x => x } },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
      '../controls/EditorModal': { __esModule: true, default: 'EditorModal' }, './StickerSplitPreview': { __esModule: true, default: 'Preview' },
      './StickerSplitSlider': { __esModule: true, default: 'Slider' }, '../controls/PenSafeTextInput': { __esModule: true, default: 'Input' },
      './StickerSplitTools': { __esModule: true, default: 'Tools', SplitAction: 'Action', SplitIconAction: 'IconAction' },
      './StickerGroupThumbnail': { __esModule: true, default: 'Thumbnail' }, '../../hooks/useStickerSplitEditing': { __esModule: true, default: () => editing },
      '../../utils/stickerSplitSave.js': { saveSplitSelection, splitSaveError },
      '../../services/mediaStore': {},
      '../../services/stickerSplit': { stickerSplit: { completeRegions: true, pick: async () => ({ width: 1000, height: 1000, uri: 'file:///sheet' }),
        analyze() { analyses++; return { id: `analysis${analyses}`, promise: Promise.resolve({ parts }) } },
        groupEdges(_parts, pixels) {
          const index = ++queries
          return { id: `query${index}`, promise: index === 1 ? new Promise(resolve => { firstResolve = () => resolve(makeEdges(pixels)) }) : Promise.resolve(makeEdges(pixels)) }
        }, cleanup: async ids => cleaned.push(...ids), cancel: id => cancelled.push(id), disposeSource() {} } },
    })
    const render = () => h.render({ initialName: '초기', onClose() {} }), action = label => find(render(), n => n.props?.label === label)?.props
    await render().props.onShow()
    find(render(), n => n.type === 'Preview').props.onReady('file:///sheet', true)
    const running = action('분리하기').onPress(); await settle()
    if (scenario === 'unsupported') {
      await running; assert.equal(queries, 0); assert.equal(distance, 0); assert.ok(action('120개 저장')); continue
    }
    assert.equal(action('초기 묶음 계산 중').disabled, true); assert.equal(selected.length, 0)
    if (scenario === 'cancel') action('작업 취소').onPress()
    firstResolve(); await running
    if (scenario === 'cancel') {
      assert.deepEqual(cancelled, ['query1']); assert.equal(queries, 1); assert.equal(selected.length, 0)
      assert.match(find(render(), n => n.props?.accessibilityRole === 'alert').props.children, /취소/)
    } else {
      assert.equal(distance, 2.3); assert.equal(selected.length, 120); assert.equal(action('40개 저장').disabled, false)
      assert.ok(queries <= 8); assert.equal(cleaned.filter(id => id.startsWith('query')).length, queries)
      const before = queries
      editing.setDistance(3)
      find(render(), n => n.type === 'Tools').props.onChange('region')
      find(render(), n => n.type === 'Preview').props.onCrop({ x: 0, y: 0, width: 0.8, height: 0.8 })
      action('다시 분리하기').onPress(); await settle()
      assert.equal(analyses, 2); assert.equal(queries, before); assert.equal(distance, 3)
    }
  }
})

const event = (pageX, pageY, locationX = 999, locationY = 999, touches = []) => ({ nativeEvent: { pageX, pageY, locationX, locationY, touches } })
function previewHarness(mode = 'brush-remove') {
  const strokes = [], interactions = [], h = harness('components/panels/StickerSplitPreview.js')
  const props = { source: { ...image, uri: 'file:///sheet' }, parts: [], selected: [], crop: split.FULL_CROP, mode, working: false, brushSize: 24,
    view: { zoom: 2, x: 0, y: 0 }, onView() {}, onInteraction: value => interactions.push(value), onBrush: (...args) => strokes.push(args) }
  h.render(props).props.onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } })
  h.render(props).props.children[0].props.onLoad()
  const input = () => h.render(props).props.children.at(-1).props
  return { input, strokes, interactions }
}

test('배경 지정색 태그는 핀 옆에 표시하고 가장자리에서 프레임 안으로 맞추며 화면 밖 핀은 숨긴다', () => {
  const h = harness('components/panels/StickerSplitPreview.js')
  const props = { source: { ...image, uri: 'file:///sheet' }, parts: [], selected: [], crop: split.FULL_CROP,
    mode: 'background', background: { x: 1, y: 1 }, working: false, view: { zoom: 1, x: 0, y: 0 }, onInteraction() {} }
  h.render(props).props.onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } })
  assert.equal(find(h.render(props), node => node.props?.testID === 'sticker-background-tag'), null)
  h.render(props).props.children[0].props.onLoad()
  let tag = find(h.render(props), node => node.props?.testID === 'sticker-background-tag')
  assert.equal(find(tag, node => node.type === 'Text').props.children, '배경 지정색')
  assert.equal(find(tag, node => node.props?.testID === 'sticker-background-swatch').props.children.props.viewBox, '199 99 1 1')
  tag.props.onLayout({ nativeEvent: { layout: { width: 100, height: 36 } } })
  tag = find(h.render(props), node => node.props?.testID === 'sticker-background-tag')
  assert.ok(tag.props.style[1].left >= 8 && tag.props.style[1].left + 100 <= 192)
  assert.ok(tag.props.style[1].top >= 8 && tag.props.style[1].top + 36 <= 192)
  props.view = { zoom: 2, x: 0, y: 0 }
  assert.equal(find(h.render(props), node => node.props?.testID === 'sticker-background-tag'), null)
})

test('브러시 모드에서는 원본 번호를 숨기고 확인 모드로 돌아오면 복원한다', () => {
  const h = harness('components/panels/StickerSplitPreview.js')
  const part = { id: 'a', x: 20, y: 20, width: 20, height: 20 }
  const props = { source: { ...image, uri: 'file:///sheet' }, parts: [part], selected: ['a'], groups: [{ ...part, number: 1, members: [part] }], crop: split.FULL_CROP,
    mode: 'review', working: false, view: { zoom: 1, x: 0, y: 0 }, onInteraction() {} }
  h.render(props).props.onLayout({ nativeEvent: { layout: { width: 200, height: 200 } } })
  h.render(props).props.children[0].props.onLoad()
  assert.ok(find(h.render(props), node => node.type === 'SvgText'))
  for (const mode of ['brush-add','brush-remove','brush-split']) {
    props.mode = mode; assert.equal(find(h.render(props), node => node.type === 'SvgText'), null)
  }
  props.mode = 'review'; assert.ok(find(h.render(props), node => node.type === 'SvgText'))
})

test('분리 브러시는 원본 좌표와 분리 모드를 한 획에 한 번 전달하고 두 손가락 취소는 반영하지 않는다', () => {
  const h = previewHarness('brush-split')
  h.input().onResponderGrant(event(150, 250, 50, 50))
  h.input().onResponderMove(event(190, 270))
  assert.equal(h.strokes.length, 0)
  h.input().onResponderRelease(event(190, 270))
  assert.equal(h.strokes.length, 1); assert.equal(h.strokes[0][2], 'split')
  assert.deepEqual(h.strokes[0][0][0], { x: 75, y: 25 })
  h.input().onResponderGrant(event(150, 250, 50, 50))
  h.input().onResponderStart(event(150, 250, 50, 50, [{ pageX: 150, pageY: 250 }, { pageX: 180, pageY: 250 }]))
  h.input().onResponderRelease(event(190, 270))
  assert.equal(h.strokes.length, 1)
})
test('확대·contain 여백에서도 브러시는 page 좌표를 원본 좌표로 환산하고 획마다 한 번 반영한다', () => {
  const h = previewHarness()
  h.input().onResponderGrant(event(150, 250, 50, 50))
  h.input().onResponderMove(event(190, 270))
  assert.equal(h.strokes.length, 0)
  h.input().onResponderRelease(event(190, 270))
  const [path, radius, add] = h.strokes[0]
  assert.deepEqual(path[0], { x: 75, y: 25 }); assert.deepEqual(path.at(-1), { x: 95, y: 35 })
  assert.equal(radius, 6); assert.equal(add, false); assert.deepEqual(h.interactions, [true, false])
})
test('두 손가락 전환·입력 취소는 브러시 선택을 적용하지 않는다', () => {
  const h = previewHarness()
  h.input().onResponderGrant(event(150, 250, 50, 50))
  h.input().onResponderStart(event(150, 250, 50, 50, [{ pageX: 150, pageY: 250 }, { pageX: 180, pageY: 250 }]))
  h.input().onResponderRelease(event(190, 270))
  h.input().onResponderGrant(event(150, 250, 50, 50)); h.input().onResponderTerminate()
  assert.equal(h.strokes.length, 0); assert.equal(h.interactions.at(-1), false)
})
test('브러시가 이미지 밖으로 나간 실제 좌표를 경계에 붙이지 않는다', () => {
  const h = previewHarness()
  h.input().onResponderGrant(event(150, 250, 50, 50)); h.input().onResponderMove(event(500, 100))
  h.input().onResponderRelease(event(500, 100))
  assert.ok(h.strokes[0][0].at(-1).x > image.width); assert.ok(h.strokes[0][0].at(-1).y < 0)
})
test('거리 슬라이더는 움직임 동안 미리보기만 하고 한 번 확정하거나 취소한다', () => {
  const preview = [], commits = [], interactions = [], cancels = []
  const h = harness('components/panels/StickerSplitSlider.js')
  const props = { label: '거리', value: 0, min: 0, max: 5, step: 0.1, onPreview: value => preview.push(value), onCommit: value => commits.push(value), onCancel: () => cancels.push(1), onInteraction: value => interactions.push(value) }
  const track = () => h.render(props).props.children[1].props
  track().onLayout({ nativeEvent: { layout: { width: 126 } } })
  track().onResponderGrant(event(113, 0, 13, 0)); track().onResponderMove(event(163, 0)); track().onResponderRelease()
  assert.deepEqual(commits, [2.5]); assert.deepEqual(preview, [0, 2.5]); assert.deepEqual(interactions, [true, false])
  track().onResponderGrant(event(113, 0, 13, 0)); track().onResponderMove(event(213, 0)); track().onResponderTerminate()
  assert.deepEqual(commits, [2.5]); assert.equal(cancels.length, 1); assert.equal(interactions.at(-1), false)
})
