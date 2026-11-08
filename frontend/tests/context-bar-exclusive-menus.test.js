import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as common from '../src/editor/utils/common.js'
import * as pen from '../src/editor/utils/penSettings.js'
import * as formats from '../src/editor/utils/textFormats.js'
import * as photoStrip from '../src/editor/utils/photoStrip.js'
import * as text from '../src/editor/utils/text.js'
import * as placement from '../src/editor/utils/popoverPlacement.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/ContextBar.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
// 순서 메뉴(OrderMenu)와 옵션 패널(moreOpen)은 한 번에 하나만 열려야 한다
function bar(moreOpen) {
  const states = [], events = []
  let cursor = 0
  const load = (id) => {
    if (id === 'react') return { useState: (initial) => { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], (v) => { states[i] = v }] } }
    if (id === 'react-native') return { View: 'view', Text: 'text', Pressable: 'button', ScrollView: 'scroll', StyleSheet: { create: (s) => s } }
    if (id.endsWith('/common')) return common
    if (id.endsWith('/popoverPlacement')) return placement
    if (id.endsWith('/penSettings')) return pen
    if (id.endsWith('/text')) return text
    if (id.endsWith('/textFormats')) return formats
    if (id.endsWith('/photoStrip')) return photoStrip
    if (id.endsWith('/utils/objects')) return { hasPhotoMedia: o => Boolean(o?.src || o?.mediaFileId), emptyPhotoSlots: () => [] }
    if (id.endsWith('/FadeScroll')) return { __esModule: true, default: 'scroll' }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/constants')) return { PAGE_WIDTH: 1280, PAGE_HEIGHT: 800 }
    if (id.startsWith('.')) return { __esModule: true, default: 'OrderIcon' }
    return require(id)
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const object = { id: 's1', type: 'sticker', x: 100, y: 100, width: 120, height: 120 }
  const props = { objects: [object], allObjects: [object], zoom: 1, dispatch() {}, moreOpen, onToggleMore: () => events.push('more'), onCompactMenu() {}, onToast() {} }
  const nodes = []
  const walk = (value) => {
    if (!value || typeof value !== 'object') return; if (Array.isArray(value)) return value.forEach(walk); if (typeof value.type === 'function' && value.type.name !== 'default') { nodes.push(value); return walk(value.type(value.props)) }
    nodes.push(value); walk(value.props?.children) }
  const render = () => { cursor = 0; nodes.length = 0; walk(module.exports.default(props)); return nodes }
  const find = (label) => render().find((n) => n.props?.accessibilityLabel === label)
  return { events, render, find, orderOpen: () => render().some((n) => typeof n.type === 'function' && n.type.name === 'OrderMenu') }
}

test('순서 메뉴가 열린 채 옵션을 누르면 순서 메뉴를 닫고 옵션만 연다', () => {
  const b = bar(false)
  b.find('순서').props.onPress()
  assert.equal(b.orderOpen(), true)
  b.find('옵션').props.onPress()
  assert.equal(b.orderOpen(), false)
  assert.deepEqual(b.events, ['more'])
})

test('옵션 패널이 열린 채 순서를 누르면 옵션을 닫고 순서만 연다', () => {
  const b = bar(true)
  b.find('순서').props.onPress()
  assert.deepEqual(b.events, ['more'])
  assert.equal(b.orderOpen(), true)
})
