import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as text from '../src/editor/utils/text.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/controls/TextFontDropdown.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

// open 상태를 고정해 TextFontDropdown 을 한 번 그린다(훅은 흉내 낸다)
function render(open) {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { ...React, useRef: () => ({ current: null }), useState: initial => [initial === false ? open : initial, () => {}], useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
    if (id === 'react-native') return { Platform: { OS: 'android' }, Pressable: 'pressable', ScrollView: 'scroll', StyleSheet: { create: styles => styles }, Text: 'text', View: 'view' }
    if (id === 'react-native-svg') return { __esModule: true, default: 'svg', Path: 'path' }
    if (id.endsWith('/shared/theme')) return { bubble: {}, colors: new Proxy({}, { get: () => '#000' }) }
    if (id.endsWith('/aiDisclosure.js')) return { AI_FONT_LABEL: 'AI' }
    if (id.endsWith('/PopoverMenu')) return { __esModule: true, default: 'popover' }
    if (id.endsWith('/utils/text')) return text
    return require(id)
  }, module, module.exports)
  module.exports.default({ value: 'nanum-gothic', onChange() {} })
}

test('글꼴 선택 칸은 닫혀 있으면 지금 글꼴만 요청하고, 열리면 목록의 글꼴을 요청한다', () => {
  const requested = []
  text.setTextFontRequester(font => requested.push(font.id))
  try {
    render(false) // 칸이 화면에 올라오기만 한 상태: 모든 글꼴 파일을 읽지 않는다
    assert.deepEqual([...new Set(requested)], ['nanum-gothic'])
    requested.length = 0
    render(true)
    assert.deepEqual([...new Set(requested)].sort(), text.TEXT_FONTS.map(font => font.id).sort())
  } finally { text.setTextFontRequester(null) }
})
