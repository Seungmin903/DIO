import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as geometry from '../src/editor/utils/photoCropGeometry.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const close = (a, b) => assert.ok(Math.abs(a - b) < 0.001, `${a} != ${b}`)

function fixture() {
  const states = [], refs = []; let si = 0, ri = 0, applied
  const react = {
    useState(initial) { const i = si++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }] },
    useRef(initial) { const i = ri++; return refs[i] ??= { current: initial } },
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  const native = { Image: 'Image', Platform: { OS: 'ios', select: values => values.ios ?? values.default }, Pressable: 'Pressable', Text: 'Text', View: 'View', useWindowDimensions: () => ({ width: 1000, height: 800 }), StyleSheet: { create: value => value, absoluteFill: {}, hairlineWidth: 1 } }
  const constants = { CROP_RATIOS: [{ id: '16:9', name: '16:9', value: 16 / 9 }, { id: '3:4', name: '3:4', value: 3 / 4 }], POLAROID_RATIOS: [], PHOTO_SHAPES: [], CROP_ZOOM_MAX: 9 }
  const objects = { isBorderFrame: () => false, photoInnerBox: () => ({ width: 400, height: 300 }), ratioValueOf: id => constants.CROP_RATIOS.find(r => r.id === id)?.value, resizeAroundCenter: (_, w, h) => ({ w, h }) }
  const mocks = { react, 'react/jsx-runtime': jsx, 'react-native': native, '../../../shared/theme': { colors: {}, shadow: {} }, '../../constants': constants, '../../utils/objects': objects,
    '../../utils/common': { clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) }, '../../utils/photoCropGeometry.js': geometry, '../../hooks/useMediaUri': { useMediaUri: () => 'image', useSvgImageUri: () => 'image' }, '../../hooks/usePan': { usePan: handlers => handlers } }
  const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/panels/PhotoCropper.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? { __esModule: true, default: id }, mod, mod.exports)
  const photo = { id: 'photo', frame: 'none', w: 400, h: 300, imageWidth: 1600, imageHeight: 1200, crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
  const render = () => { si = 0; ri = 0; const modal = mod.exports.default({ photo, onApply: value => { applied = value }, onCancel() {} }); return modal.props.children.type(modal.props.children.props) }
  return { render, get applied() { return applied } }
}

test('실제 자르기 화면에서 비율 선택 → 확대 → 비율 전환 → 적용이 연결된다', () => {
  const ui = fixture()
  const chip = (tree, label) => nodes(tree).find(n => n.props?.label === label && n.props?.onPress)
  const frame = tree => nodes(tree).find(n => n.type?.name === 'FreeCrop').props
  let tree = ui.render(); chip(tree, '16:9').props.onPress()
  tree = ui.render(); const before = frame(tree)
  nodes(tree).find(n => n.props?.label === '확대' && n.props?.onChange).props.onChange(2)
  tree = ui.render(); const zoomed = frame(tree)
  close((before.rect.u1 - before.rect.u0) * before.full.width, (zoomed.rect.u1 - zoomed.rect.u0) * zoomed.full.width)
  close((before.rect.v1 - before.rect.v0) * before.full.height, (zoomed.rect.v1 - zoomed.rect.v0) * zoomed.full.height)
  close(before.full.left + (before.rect.u0 + before.rect.u1) / 2 * before.full.width, zoomed.full.left + (zoomed.rect.u0 + zoomed.rect.u1) / 2 * zoomed.full.width)
  close(before.full.top + (before.rect.v0 + before.rect.v1) / 2 * before.full.height, zoomed.full.top + (zoomed.rect.v0 + zoomed.rect.v1) / 2 * zoomed.full.height)
  chip(tree, '3:4').props.onPress(); tree = ui.render()
  const portrait = frame(tree).rect
  close(geometry.freeZoom(portrait), 2)
  const apply = nodes(tree).find(n => n.type === 'Pressable' && n.props?.accessibilityRole === 'button' && nodes(n).some(c => c.props?.children === '적용'))
  apply.props.onPress()
  const restored = geometry.visibleRect(ui.applied.crop, 3 / 4, 4 / 3)
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(restored[key], portrait[key])
})

test('확대한 자유 자르기에서 변 손잡이를 누를 때 작은 정사각형이 튀지 않는다', () => {
  const ui = fixture()
  const chip = (tree, label) => nodes(tree).find(n => n.props?.label === label && n.props?.onPress)
  let tree = ui.render(); chip(tree, '자유').props.onPress(); tree = ui.render()
  const freeCrop = nodes(tree).find(n => n.type?.name === 'FreeCrop')
  // 4:3 이미지에서 픽셀 기준 정사각형: 세로 기준은 0.14, 가로 기준은 0.105.
  const square = { u0: 0.4, v0: 0.4, u1: 0.505, v1: 0.54 }
  freeCrop.props.onChange(square); tree = ui.render()
  const element = nodes(tree).find(n => n.type?.name === 'FreeCrop')
  const cropTree = element.type(element.props)
  // 작은 틀에서는 변 막대를 그리지 않는다(지라 607, 손잡이 겹침). 같은 손잡이 부품으로 변 'e' 를 만들어 크기 계산만 본다
  const corner = nodes(cropTree).find(n => n.props?.handle?.key === 'se')
  const handle = corner.type({ ...corner.props, handle: { key: 'e', sx: 1, sy: 0 } })
  handle.props.onStart(); handle.props.onMove(0, 0)
  const after = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.rect
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(after[key], square[key])
})

test('자유 자르기 꼭짓점을 늘렸다 같은 거리만큼 줄이면 기존 정사각형으로 돌아온다', () => {
  const ui = fixture(), tree = ui.render()
  nodes(tree).find(n => n.props?.label === '자유' && n.props?.onPress).props.onPress()
  const square = { u0: 0.4, v0: 0.4, u1: 0.505, v1: 0.54 }
  nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.onChange(square)
  const gesture = (dx, dy) => {
    const element = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop')
    const edge = nodes(element.type(element.props)).find(n => n.props?.handle?.key === 'se')
    const handle = edge.type(edge.props); handle.props.onStart(); handle.props.onMove(dx, dy)
  }
  gesture(30, 30); gesture(-30, -30)
  const after = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.rect
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(after[key], square[key])
})

test('작은 자유 영역의 위아래를 얇게 줄여도 확대 막대가 현재 값을 벗어나지 않는다', () => {
  const ui = fixture(); let tree = ui.render()
  nodes(tree).find(n => n.props?.label === '자유' && n.props?.onPress).props.onPress()
  const square = { u0: 0.4, v0: 0.4, u1: 0.505, v1: 0.54 }
  nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.onChange(square)
  const element = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop')
  const corner = nodes(element.type(element.props)).find(n => n.props?.handle?.key === 'se')
  const handle = corner.type({ ...corner.props, handle: { key: 's', sx: 0, sy: 1 } }); handle.props.onStart(); handle.props.onMove(0, -100)
  tree = ui.render()
  const rect = nodes(tree).find(n => n.type?.name === 'FreeCrop').props.rect
  assert.ok(rect.v1 - rect.v0 < 0.002)
  const slider = nodes(tree).find(n => n.props?.label === '확대' && n.props?.onChange)
  assert.ok(slider.props.value > 9)
  assert.ok(slider.props.max >= slider.props.value)
  slider.props.onChange(slider.props.value)
  tree = ui.render()
  const afterSlider = nodes(tree).find(n => n.type?.name === 'FreeCrop').props.rect
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(afterSlider[key], rect[key])
  const apply = nodes(tree).find(n => n.type === 'Pressable' && n.props?.accessibilityRole === 'button' && nodes(n).some(c => c.props?.children === '적용'))
  apply.props.onPress()
  const restored = geometry.visibleRect(ui.applied.crop, ui.applied.aspect, 4 / 3)
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(restored[key], rect[key])
})

test('작은 자유 영역을 고정 비율로 바꾼 뒤 꼭짓점을 눌러도 튀지 않는다', () => {
  const ui = fixture(); let tree = ui.render()
  nodes(tree).find(n => n.props?.label === '자유' && n.props?.onPress).props.onPress()
  nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.onChange({ u0: 0.4, v0: 0.4, u1: 0.45, v1: 0.48 })
  tree = ui.render(); nodes(tree).find(n => n.props?.label === '3:4' && n.props?.onPress).props.onPress()
  const element = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop')
  const before = element.props.rect
  const corner = nodes(element.type(element.props)).find(n => n.props?.handle?.key === 'se')
  const handle = corner.type(corner.props); handle.props.onStart(); handle.props.onMove(0, 0)
  const after = nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.rect
  for (const key of ['u0', 'v0', 'u1', 'v1']) close(after[key], before[key])
})

test('9배를 넘는 자르기에서 확대 막대 범위는 드래그가 끝날 때까지 유지된다', () => {
  const ui = fixture(); let tree = ui.render()
  nodes(tree).find(n => n.props?.label === '자유' && n.props?.onPress).props.onPress()
  nodes(ui.render()).find(n => n.type?.name === 'FreeCrop').props.onChange({ u0: 0.4, v0: 0.4, u1: 0.45, v1: 0.45 })
  const slider = () => nodes(ui.render()).find(n => n.props?.label === '확대' && n.props?.onChange).props
  close(slider().max, 20)
  slider().onStart(); slider().onChange(12)
  close(slider().max, 20)
  slider().onChange(18)
  close(slider().value, 18)
  slider().onEnd()
  close(slider().max, 18)
})

test('실제 Slider와 usePan은 드래그 시작, 종료와 취소를 전달한다', () => {
  const react = {
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useRef: value => ({ current: value }), useEffect() {},
    useLayoutEffect: effect => { effect() }, useContext: () => null,
  }
  const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) }
  const native = { AppState: null, PanResponder: { create: handlers => ({ panHandlers: handlers }) }, Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: value => value } }
  function load(path, mocks) {
    const code = expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] }).code
    const mod = { exports: {} }
    new Function('require', 'module', 'exports', code)(id => mocks[id] ?? { __esModule: true, default: id }, mod, mod.exports)
    return mod.exports
  }
  const pan = load('../src/editor/hooks/usePan.js', { react, 'react-native': native, './usePalmRejection': { PalmRejectionContext: {}, usePalmRejectingPan: () => ({}) }, '../utils/penPointerInput.js': { createPenPointerInput: () => ({ active: false, cancel() {} }) }, '../utils/stylus': { setPenPointerActive() {} } })
  const slider = load('../src/editor/components/controls/Slider.js', { react, 'react/jsx-runtime': jsx, 'react-native': native, '../../hooks/usePan': pan, '../../utils/common': { clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) }, '../../../shared/theme': { colors: {} } }).default
  const starts = [], ends = [], changes = []
  const tree = slider({ value: 10, min: 1, max: 20, step: 0.1, onStart: () => starts.push(true), onEnd: event => ends.push(event), onChange: value => changes.push(value) })
  const track = nodes(tree).find(n => n.props?.onPanResponderGrant)
  assert.ok(track)
  track.props.onPanResponderGrant({ nativeEvent: { locationX: 14 } })
  track.props.onPanResponderMove({ nativeEvent: {} }, { dx: 5, dy: 0 })
  track.props.onPanResponderRelease()
  track.props.onPanResponderGrant({ nativeEvent: { locationX: 14 } })
  track.props.onPanResponderTerminate()
  assert.equal(starts.length, 2)
  assert.equal(ends.length, 2)
  assert.equal(ends[0].cancelled, undefined)
  assert.equal(ends[1].cancelled, true)
  assert.ok(changes.length >= 2)
})

test('607: 작은 틀은 손잡이가 겹치지 않게 덜 쓰는 쪽을 숨긴다(꼭짓점은 늘 하나 이상)', async () => {
  const { readFileSync } = await import('node:fs')
  const src = readFileSync(new URL('../src/editor/components/panels/PhotoCropper.js', import.meta.url), 'utf8')
  const body = src.slice(src.indexOf('export function visibleFreeHandles'), src.indexOf('/** 사진 전체 위에 자르는 틀.'))
  const handles = src.slice(src.indexOf('const FREE_HANDLES = ['), src.indexOf(']', src.indexOf('const FREE_HANDLES = [')) + 1)
  const visible = new Function(`const HANDLE = 18, BAR_LONG = 24, GAP_MIN = 6; ${handles}; ${body.replace('export ', '')}; return visibleFreeHandles`)()
  const keys = (w, h, lock) => visible(w, h, lock).map(handle => handle.key).sort().join(',')
  assert.equal(keys(300, 200), 'e,n,ne,nw,s,se,sw,w')
  // 얇은 테이프 틀(높이 30): 꼭짓점 넷 + 위아래 막대, 옆 막대는 꼭짓점과 겹쳐 뺀다
  assert.equal(keys(300, 30), 'n,ne,nw,s,se,sw')
  // 더 얇으면(20) 아래 꼭짓점만
  assert.equal(keys(300, 20), 'n,s,se,sw')
  // 아주 작으면 오른쪽 아래 꼭짓점 하나
  assert.equal(keys(20, 20), 'se')
  // 비율 잠금은 꼭짓점만
  assert.equal(keys(300, 30, true), 'ne,nw,se,sw')
})
