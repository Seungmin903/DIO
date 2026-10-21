import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as text from '../src/editor/utils/text.js'
import * as textFormats from '../src/editor/utils/textFormats.js'
import * as textRanges from '../src/editor/utils/textRanges.js'

const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const babel = fromExpo('@babel/core')
const source = readFileSync(new URL('../src/editor/components/TextEditor.js', import.meta.url), 'utf8')
const { code } = babel.transformSync(source, {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})

// 실제 TextEditor JSX를 렌더링한다. OS 입력은 모사하지 않고 input props 계약만 검증한다.
function renderEditor(platform) {
  let inputProps
  const saves = [], cancels = []
  const native = {
    Platform: { OS: platform }, Keyboard: { dismiss() {} },
    StyleSheet: { create: (styles) => styles },
    View: ({ children }) => React.createElement('div', null, children),
    Text: ({ children }) => React.createElement('span', null, children),
    Pressable: ({ children }) => React.createElement('button', null, children),
    TextInput: (props) => {
      inputProps = props
      return platform === 'android'
        ? React.createElement('div', null, props.children)
        : React.createElement('textarea', { defaultValue: props.defaultValue }, props.children)
    },
  }
  const module = { exports: {} }
  const editorRequire = (id) => {
    if (id === 'react-native') return native
    if (id === '../../shared/theme') return { colors: {} }
    if (id === '../utils/text') return text
    if (id === '../hooks/useTextFont') return require('../src/editor/hooks/useTextFont.js')
    if (id === '../utils/textRanges') return textRanges
    if (id === '../utils/textFormats') return textFormats
    if (id === '../services/textClipboard') return { copyText: async () => {}, useTextClipboardAvailable: () => false }
    if (id === './TextActionBar' || id === './TextLinkDialog') return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(editorRequire, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.default, {
    object: { id: 'text', text: '한글 RED', x: 10, y: 20, w: 320, h: 40, colorRanges: [{ start: 3, end: 6, color: '#DD887A' }] },
    zoom: 1, boundary: { current: null }, paletteBounds: { current: null },
    onPaletteChange() {}, onSave: (...args) => saves.push(args), onCancel: () => cancels.push(true),
  }))
  return { html, inputProps, saves, cancels }
}

for (const platform of ['web', 'ios']) {
  test(`${platform}: defaultValue 입력 경로에 false 자식을 전달하지 않아 텍스트 생성이 중단되지 않는다`, () => {
    const { html, inputProps } = renderEditor(platform)
    assert.equal(inputProps.children, null)
    assert.equal(inputProps.defaultValue, '한글 RED')
    assert.ok(html.includes('<textarea>한글 RED</textarea>'))
  })
}

test('android: defaultValue 없이 부분 색상 자식을 전달한다', () => {
  const { inputProps } = renderEditor('android')
  assert.equal(inputProps.defaultValue, undefined)
  const segments = inputProps.children.props.children
  assert.deepEqual(segments.map((segment) => segment.props.children), ['한글 ', 'RED'])
  assert.equal(segments[1].props.style.color, '#DD887A')
})

test('web: blur는 최종 문자열·범위를 한 번만 저장하며 취소 후에는 저장하지 않는다', () => {
  const { inputProps, saves } = renderEditor('web')
  inputProps.onBlur({ target: { value: '한글 RED\n완료' } })
  inputProps.onBlur({ target: { value: '한글 RED\n완료' } })
  assert.deepEqual(saves, [['한글 RED\n완료', [{ start: 3, end: 9, color: '#DD887A' }], []]])
  const cancelled = renderEditor('web')
  cancelled.inputProps.onKeyDown({ key: 'Escape', stopPropagation() {} })
  cancelled.inputProps.onBlur({ target: { value: '취소할 내용' } })
  assert.equal(cancelled.cancels.length, 1)
  assert.deepEqual(cancelled.saves, [])
})
