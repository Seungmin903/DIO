import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as text from '../src/editor/utils/text.js'
import * as paperFont from '../src/editor/templates/paperFont.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))

// 소스를 바벨로 바꿔 가짜 모듈로 불러온다. resolve(id) 가 undefined 를 돌려주면 진짜 require 로 넘긴다
function load(relative, resolve) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => resolve(id) ?? require(id), module, module.exports)
  return module.exports
}
const nativeModules = id => {
  if (id === 'react-native') return { Platform: { OS: 'android' }, Pressable: 'pressable', ScrollView: 'scroll', StyleSheet: { create: styles => styles }, Text: 'text', View: 'view' }
  if (id === 'react-native-svg') return { __esModule: true, default: 'svg', Path: 'path' }
  if (id.endsWith('/shared/theme')) return { bubble: {}, colors: new Proxy({}, { get: () => '#000' }) }
  if (id.endsWith('/shared/AppIcon')) return { __esModule: true, default: 'icon' }
  if (id.endsWith('/aiDisclosure.js')) return { AI_FONT_LABEL: 'AI' }
  if (id.endsWith('/PopoverMenu')) return { __esModule: true, default: 'popover' }
  if (id.endsWith('/utils/text')) return text
  if (id.endsWith('/templates/paperFont.js')) return paperFont
}
// open 상태를 고정해 한 번 그린다(훅은 흉내 낸다). 글꼴 상태 구독에 넘긴 snapshot 함수들을 돌려준다
function render(relative, props, open, extra = () => undefined) {
  const snapshots = []
  const hooks = { ...React, useRef: () => ({ current: null }), useState: initial => [initial === false ? open : initial, () => {}], useSyncExternalStore: (_subscribe, snapshot) => { snapshots.push(snapshot); return snapshot() } }
  load(relative, id => id === 'react' ? hooks : nativeModules(id) ?? extra(id)).default(props)
  return snapshots
}
const withRequests = run => {
  const requested = []
  text.setTextFontRequester(font => requested.push(font.id))
  try { return run(requested) } finally { text.setTextFontRequester(null) }
}
const ids = requested => [...new Set(requested)].sort()

test('글꼴 선택 칸은 닫혀 있으면 지금 글꼴만 요청하고, 열리면 목록의 글꼴을 요청한다', () => withRequests(requested => {
  const file = '../src/editor/components/controls/TextFontDropdown.js', props = { value: 'nanum-gothic', onChange() {} }
  render(file, props, false) // 칸이 화면에 올라오기만 한 상태: 모든 글꼴 파일을 읽지 않는다
  assert.deepEqual(ids(requested), ['nanum-gothic'])
  requested.length = 0
  render(file, props, true)
  assert.deepEqual(ids(requested), text.TEXT_FONTS.map(font => font.id).sort())
}))

test('글꼴 선택 칸은 글꼴을 불러오면 다시 그린다(구독 값이 바뀐다)', () => {
  const [snapshot] = render('../src/editor/components/controls/TextFontDropdown.js', { value: 'nanum-gothic', onChange() {} }, false)
  const before = snapshot()
  text.markTextFontLoaded('NanumGothic')
  assert.notEqual(snapshot(), before)
  const loaded = snapshot()
  text.markTextFontFailed('PoorStory')
  assert.notEqual(snapshot(), loaded) // 실패도 상태 변화다
})

test('속지 글꼴 칸은 닫혀 있으면 지금 글꼴만 요청하고, 열리면 목록의 글꼴을 요청하며, 글꼴을 불러오면 다시 그린다', () => withRequests(requested => {
  const file = '../src/diary/components/PaperFontDropdown.js', props = { value: 'nanum-gothic', onChange() {} }
  const chips = id => id.endsWith('/components/PaperFontChips') ? load('../src/editor/components/PaperFontChips.js', nativeModules) : undefined
  const [snapshot] = render(file, props, false, chips)
  assert.deepEqual(ids(requested), ['nanum-gothic'])
  requested.length = 0
  render(file, props, true, chips)
  assert.deepEqual(ids(requested), paperFont.PAPER_FONTS.map(font => font.id).sort())
  const before = snapshot()
  text.markTextFontLoaded('GowunBatang')
  assert.notEqual(snapshot(), before)
}))
