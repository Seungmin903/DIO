import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/ObjectView.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('function TextContent('), source.indexOf('/* ---------- 꾸미기 옵션'))
const { code } = expo('@babel/core').transformSync(`${body}\nmodule.exports = TextContent`, {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const makeText = new Function('require', 'module', 'Text', 'View', 'Platform', 'DRAWN_DECORATION', 'useState', 'useRef', 'useLayoutEffect', 'textLayoutKey', 'textSettings', 'textStyle', 'richTextSegments', 'segmentTextStyle', code)

test('페이지 준비 후 텍스트 뷰가 새로 배치되어 크기가 같아도 측정 콜백이 연결된다', () => {
  const module = { exports: {} }, measured = []
  makeText(require, module, 'Text', 'View', { OS: 'ios' }, false, value => [value, () => {}], value => ({ current: value }), () => {}, object => String(object.w),
    () => ({ lineSpacing: 1 }), () => ({ fontSize: 12 }), text => [{ text }], () => ({}))
  const object = { id: 'text-1', w: 100, text: '같은 높이' }
  const render = (textMeasureReady, onTextMeasure) => module.exports({ object, width: 100, height: 40, zoom: 2, onTextMeasure, textMeasureReady })
  const loading = render(false, null)
  const ready = render(true, (id, height) => measured.push({ id, height }))
  assert.equal(loading.key, 'loading')
  assert.equal(loading.props.onLayout, undefined)
  assert.equal(ready.key, 'ready')
  ready.props.onLayout({ nativeEvent: { layout: { height: 40 } } })
  assert.deepEqual(measured, [{ id: 'text-1', height: 20 }])
  assert.equal(render(true, null).key, ready.key) // 드래그 중 측정을 잠시 꺼도 뷰를 다시 만들지 않는다.
  assert.equal(render(true, () => {}).key, ready.key)
})

test('크기 조절 후 onLayout이 다시 오지 않아도 재측정하고 중복·이전 측정은 무시한다', () => {
  const module = { exports: {} }, refs = [], effects = [], measured = []
  let refIndex = 0, effectIndex = 0, pending = [], delayed
  const useRef = value => refs[refIndex++] ??= { current: value }
  const useLayoutEffect = (fn, deps) => {
    const index = effectIndex++, old = effects[index]
    if (!old || deps.some((value, i) => value !== old.deps[i])) pending.push(() => { old?.cleanup?.(); effects[index] = { deps, cleanup: fn() } })
  }
  makeText(require, module, 'Text', 'View', { OS: 'ios' }, false, value => [value, () => {}], useRef, useLayoutEffect,
    object => String(object.w), () => ({ lineSpacing: 1 }), () => ({ fontSize: 12 }), text => [{ text }], () => ({}))
  const report = (id, h) => measured.push({ id, h })
  const render = (width, callback) => {
    refIndex = 0; effectIndex = 0
    const element = module.exports({ object: { id: 't', w: width, text: 'test' }, width, height: 40, zoom: 2, onTextMeasure: callback, textMeasureReady: true })
    element.props.ref.current = { measure: fn => { delayed = fn } }
    pending.splice(0).forEach(fn => fn())
    return element
  }
  render(100, null)
  const ready = render(120, report)
  delayed(0, 0, 120, 40)
  assert.deepEqual(measured, [{ id: 't', h: 20 }])
  ready.props.onLayout({ nativeEvent: { layout: { height: 40 } } })
  assert.equal(measured.length, 1)
  render(130, report)
  const stale = delayed
  render(130, null)
  stale(0, 0, 130, 80)
  assert.equal(measured.length, 1)
})

test('좁아진 상자의 내용이 기존 높이보다 길어도 전체 측정 높이를 전달한다', () => {
  const module = { exports: {} }, measured = []
  makeText(require, module, 'Text', 'View', { OS: 'ios' }, false, value => [value, () => {}], value => ({ current: value }), () => {}, object => String(object.w),
    () => ({ lineSpacing: 1 }), () => ({ fontSize: 12 }), text => [{ text }], () => ({}))
  const element = module.exports({ object: { id: 'narrow', w: 40, text: '여러 줄 텍스트' }, width: 80, height: 40, zoom: 2, onTextMeasure: (id, h) => measured.push({ id, h }), textMeasureReady: true })
  element.props.onLayout({ nativeEvent: { layout: { height: 120 } } })
  assert.deepEqual(measured, [{ id: 'narrow', h: 60 }])
})

test('웹에서 손글씨 폰트가 늦게 도착하면 같은 상자 크기에서도 다시 측정한다', () => {
  const module = { exports: {} }, measured = []
  let fontFamily = 'sans-serif'
  makeText(require, module, 'Text', 'View', { OS: 'web' }, false, value => [value, () => {}], value => ({ current: value }), () => {},
    object => String(object.w), () => ({ lineSpacing: 1 }), () => ({ fontSize: 12, fontFamily }), text => [{ text }], () => ({}))
  const object = { id: 'handwriting', w: 100, h: 40, font: 'personal-123', text: '손글씨' }
  const render = onTextMeasure => module.exports({ object, width: 100, height: 40, zoom: 2, onTextMeasure, textMeasureReady: true })
  const fallback = render(null)
  assert.equal(fallback.props.onLayout, undefined)
  fontFamily = 'DIOHW_123'
  const ready = render((id, h) => measured.push({ id, h }))
  assert.notEqual(fallback.key, ready.key)
  ready.props.onLayout({ nativeEvent: { layout: { height: 40 } } })
  assert.deepEqual(measured, [{ id: 'handwriting', h: 20 }])
})

test('비동기 측정은 최신 콜백을 쓰고 상자 높이가 바뀌면 같은 실측값도 다시 전달한다', () => {
  const module = { exports: {} }, refs = [], effects = [], received = []
  let ri = 0, ei = 0, pending = [], delayed
  const useRef = value => refs[ri++] ??= { current: value }
  const effect = (fn, deps) => {
    const i = ei++, old = effects[i]
    if (!old || deps.some((v, n) => v !== old.deps[n])) pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() } })
  }
  makeText(require, module, 'Text', 'View', { OS: 'ios' }, false, value => [value, () => {}], useRef, effect,
    object => String(object.w), () => ({ lineSpacing: 1 }), () => ({ fontSize: 12 }), text => [{ text }], () => ({}))
  const render = (boxHeight, callback) => {
    ri = 0; ei = 0
    const element = module.exports({ object: { id: 't', w: 80, h: boxHeight, text: 'test' }, width: 80, height: boxHeight, zoom: 1, onTextMeasure: callback, textMeasureReady: true })
    element.props.ref.current = { measure: fn => { delayed = fn } }
    pending.splice(0).forEach(fn => fn())
  }
  render(100, () => received.push('old'))
  const first = delayed
  render(100, (id, h) => received.push([id, h]))
  first(0, 0, 80, 60)
  assert.deepEqual(received, [['t', 60]])
  render(40, (id, h) => received.push([id, h]))
  delayed(0, 0, 80, 60)
  assert.deepEqual(received, [['t', 60], ['t', 60]])
})
