import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as text from '../src/editor/utils/text.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextSettings.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function render(platform, settings) {
  let styleControls
  const presses = [], changes = []
  const container = ({ children }) => React.createElement('div', null, children)
  const native = {
    Platform: { OS: platform }, StyleSheet: { create: s => s }, View: container, ScrollView: container, Text: container,
    TextInput: () => null,
    Pressable: ({ children, accessibilityLabel, onPress }) => {
      presses.push({ label: accessibilityLabel, onPress })
      return React.createElement('div', null, children)
    },
  }
  const module = { exports: {} }
  const localRequire = id => {
    if (id === 'react-native') return native
    if (id === 'react-native-svg') return { __esModule: true, default: container, Path: () => null }
    if (id === '../../shared/useFormFactor') return { useFormFactor: () => ({ isPhone: false }) }
    if (id === '../../shared/theme') return { colors: {} }
    if (id === '../utils/text') return text
    if (id === '../hooks/useTextFont') return { useTextFont: () => '' }
    if (id === './ToolPanel') return {
      Segmented: props => { if (props.items.some(item => item.id === 'italic')) styleControls = props; return null },
      ToolPanelHeader: () => null, toolPanelStyles: {},
    }
    if (id === './controls/MyColorPresets' || id === './controls/Slider') return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.default, {
    settings: { ...text.DEFAULT_TEXT_SETTINGS, ...settings }, onChange: patch => changes.push(patch), onClose() {},
  }))
  return { styleControls, presses, changes, html }
}

test('iOS 기본 고딕의 새 기울임은 선택할 수 없고 기존 설정은 명시적으로 해제한다', () => {
  const result = render('ios', { font: 'sans', italic: true })
  assert.equal(result.styleControls.items.find(item => item.id === 'italic').disabled, true)
  assert.equal(result.styleControls.selected('italic'), false)
  result.styleControls.onPress('italic')
  assert.deepEqual(result.changes, [])
  assert.match(result.html, /한글에는 적용되지 않을 수 있어요/)
  result.presses.find(item => item.label === '기존 기울임 설정 해제').onPress()
  assert.deepEqual(result.changes, [{ italic: false }])
  assert.equal(text.textStyle({ font: 'sans', italic: true }, 1, 'ios').fontStyle, 'italic')
})

test('Android와 웹 기본 고딕의 기울임은 계속 사용할 수 있다', () => {
  for (const platform of ['android', 'web']) {
    const result = render(platform, { font: 'sans' })
    assert.equal(result.styleControls.items.find(item => item.id === 'italic').disabled, false)
    result.styleControls.onPress('italic')
    assert.deepEqual(result.changes, [{ italic: true }])
  }
})
