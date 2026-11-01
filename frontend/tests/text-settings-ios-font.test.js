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

function render(platform, settings, onStepper = () => {}) {
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
    if (id === '../hooks/usePalettes') return {} // 공방 프리셋 저장소가 없으면 기본 글자 색을 쓴다
    if (id === '../../handwriting/studioBus.js') return { openFontStudio() {} }
    if (id === './ToolPanel') return {
      Segmented: props => { if (props.items.some(item => item.id === 'italic')) styleControls = props; return null },
      ToolPanelHeader: () => null, toolPanelStyles: {},
    }
    if (id === './controls/NumberStepper') return { __esModule: true, default: props => { onStepper(props); return null } }
    if (id === './controls/MyColorPresets' || id === './controls/Slider') return { __esModule: true, default: () => null }
    // 글꼴 칸은 공용 드롭다운(TextFontDropdown): 지금 글꼴 이름만 그린다
    if (id === './controls/TextFontDropdown') return { __esModule: true, default: props => React.createElement('div', null, text.getTextFonts().find(font => font.id === text.resolveFontId(props.value))?.label) }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.default, {
    settings: { ...text.DEFAULT_TEXT_SETTINGS, ...settings }, onChange: patch => changes.push(patch), onClose() {},
  }))
  return { styleControls, presses, changes, html }
}

test('예전 기본 고딕은 나눔고딕으로 보이고, 기울임은 어느 기기에서도 선택할 수 있다', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const result = render(platform, { font: 'sans' })
    assert.equal(result.styleControls.items.find(item => item.id === 'italic').disabled, false)
    result.styleControls.onPress('italic')
    assert.deepEqual(result.changes, [{ italic: true }])
    assert.match(result.html, /나눔고딕/)
    assert.doesNotMatch(result.html, /기본 고딕|기존 기울임|지원하지 않아요/)
  }
})

test('기울임은 굵게와 달리 글꼴이 바뀌어도 늘 선택할 수 있고 굵게만 지원 여부를 알린다', () => {
  const result = render('ios', { font: 'nanum-pen', italic: true })
  assert.equal(result.styleControls.items.find(item => item.id === 'italic').disabled, false)
  assert.equal(result.styleControls.items.find(item => item.id === 'bold').disabled, true)
  assert.equal(result.styleControls.selected('italic'), true)
  assert.match(result.html, /굵게를 지원하지 않아요/)
  assert.doesNotMatch(result.html, /기울임을 지원하지 않아요/)
})

test('자간 · 줄간격은 접지 않고 한 줄 2단으로 보이며 숫자와 −·+ 로만 바꾼다', () => {
  const steppers = []
  const result = render('android', { font: 'nanum-gothic' }, props => steppers.push(props))
  assert.deepEqual(steppers.map(item => item.label), ['자간', '줄간격'])
  assert.equal(result.presses.some(item => item.label === '간격'), false)
  steppers[0].onChange(0.123); steppers[1].onChange(1.456)
  assert.deepEqual(result.changes, [{ letterSpacing: 0.12 }, { lineSpacing: 1.46 }])
})
