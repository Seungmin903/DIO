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
    '../../utils/common': { clamp: (x, lo, hi) => Math.min(hi, Math.max(lo, x)) }, '../../utils/photoCropGeometry.js': geometry, '../../hooks/useMediaUri': { useMediaUri: () => 'image' }, '../../hooks/usePan': { usePan: handlers => handlers } }
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
  const edge = nodes(cropTree).find(n => n.props?.handle?.key === 'e')
  const handle = edge.type(edge.props)
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
  const edge = nodes(element.type(element.props)).find(n => n.props?.handle?.key === 's')
  const handle = edge.type(edge.props); handle.props.onStart(); handle.props.onMove(0, -100)
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
