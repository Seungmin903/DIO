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
const renderEditorWith = (platform, props) => renderEditor(platform, {}, 1, null, props)
function renderEditor(platform, overrides = {}, zoom = 1, textProps = null, extraProps = {}) {
  let inputProps
  const saves = [], cancels = []
  const native = {
    Platform: { OS: platform }, Keyboard: { dismiss() {} },
    StyleSheet: { create: (styles) => styles },
    View: ({ children }) => React.createElement('div', null, children),
    Text: (props) => { textProps?.push(props); return React.createElement('span', { 'data-measure': props.onTextLayout ? 'lines' : undefined }, props.children) },
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
    if (id === '../utils/textKeyboard') return require('../src/editor/utils/textKeyboard.js')
    if (id === '../hooks/useTextFont') return require('../src/editor/hooks/useTextFont.js')
    if (id === '../utils/textRanges') return textRanges
    if (id === '../utils/textFormats') return textFormats
    if (id === '../services/textClipboard') return { copyText: async () => {}, useTextClipboardAvailable: () => false }
    if (id === './TextActionBar' || id === './TextLinkDialog') return { __esModule: true, default: () => null }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(editorRequire, module, module.exports)
  const html = renderToStaticMarkup(React.createElement(module.exports.default, {
    object: { id: 'text', text: '한글 RED', x: 10, y: 20, w: 320, h: 40, colorRanges: [{ start: 3, end: 6, color: '#DD887A' }], ...overrides },
    zoom, boundary: { current: null }, paletteBounds: { current: null },
    onPaletteChange() {}, onSave: (...args) => saves.push(args), onCancel: () => cancels.push(true), ...extraProps,
  }))
  return { html, inputProps, saves, cancels }
}

test('실제 입력창은 새 상자의 드래그 높이 대신 글자 높이를 사용하고 기존 확장 높이는 유지한다', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const fresh = renderEditor(platform, { h: 180, fontSize: 18, lineSpacing: 1.5 }, 0.5)
    assert.equal(fresh.inputProps.style[1].height, 13.5)
    const existing = renderEditor(platform, { h: 180, fontSize: 18, lineSpacing: 1.5, existing: true }, 0.5)
    assert.equal(existing.inputProps.style[1].height, 90)
  }
})

for (const platform of ['web', 'ios']) {
  test(`${platform}: defaultValue 입력 경로에 false 자식을 전달하지 않아 텍스트 생성이 중단되지 않는다`, () => {
    const { html, inputProps } = renderEditor(platform)
    assert.equal(inputProps.children, null)
    assert.equal(inputProps.defaultValue, '한글 RED')
    assert.ok(html.includes('<textarea>한글 RED</textarea>'))
  })
}

test('S15P31F106-482: 숨은 측정 글은 끝 줄바꿈 뒤 빈 줄을 보이지 않는 글자로 세우고, 글자만큼 넓어지는 상자에서는 입력창 폭으로 줄을 바꾼다', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const tail = renderEditor(platform, { text: '첫 줄\n' })
    assert.match(tail.html, /<span data-measure="lines">(?:(?!<\/span><\/span>).)*\u200B/su, `${platform}: 끝 줄바꿈이면 측정 글 끝에 U+200B`)
    const flat = renderEditor(platform, { text: '첫 줄\n둘째' })
    assert.doesNotMatch(flat.html, /\u200B/u, `${platform}: 끝이 줄바꿈이 아니면 덧붙이지 않는다`)
  }
  // 측정 글 폭: 고정 폭 상자는 상자 폭(좌우 1), 글자만큼 넓어지는 상자는 입력창 폭 · 자리
  const captured = []
  const auto = renderEditor('ios', { autoWidth: true, w: 240, baseWidth: 240, maxWidth: 400, textAlign: 'center' }, 0.5, captured)
  const measure = captured.find(props => props.onTextLayout)
  assert.deepEqual(measure.style[1], { left: -39, right: 'auto', width: 200 })
  assert.equal(auto.inputProps.style[1].width, 200)
  const fixed = renderEditor('ios', { w: 240, baseWidth: 240 }, 0.5, captured)
  assert.equal(captured.filter(props => props.onTextLayout).at(-1).style[1], null)
  assert.ok(fixed.inputProps.onContentSizeChange)
})

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

test('글자만큼 넓어지는 상자: 입력창을 최대 폭으로 넓혀 폭이 늦게 따라와도 한 줄이 둘로 접히지 않는다', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const auto = renderEditor(platform, { autoWidth: true, w: 240, baseWidth: 240, maxWidth: 400 }, 0.5)
    assert.equal(auto.inputProps.style[1].width, 200)
    assert.equal(auto.inputProps.style[1].marginLeft, 0)
    const centered = renderEditor(platform, { autoWidth: true, w: 240, baseWidth: 240, maxWidth: 400, textAlign: 'center' }, 0.5)
    assert.equal(centered.inputProps.style[1].width, 200)
    assert.equal(centered.inputProps.style[1].marginLeft, -40)
    const fixed = renderEditor(platform, { w: 240, baseWidth: 240 }, 0.5)
    assert.equal(fixed.inputProps.style[1].width, undefined)
    assert.equal(fixed.inputProps.style[1].marginLeft, undefined)
  }
})

test('autoWidthInputLayout: 맞춤에 따라 입력창을 상자 기준 자리로 민다', () => {
  assert.deepEqual(text.autoWidthInputLayout(100, 480, 'left'), { width: 480, marginLeft: 0 })
  assert.deepEqual(text.autoWidthInputLayout(100, 480, 'center'), { width: 480, marginLeft: -190 })
  assert.deepEqual(text.autoWidthInputLayout(100, 480, 'right'), { width: 480, marginLeft: -380 })
  // 상자가 최대 폭보다 넓으면 줄이지 않는다
  assert.deepEqual(text.autoWidthInputLayout(500, 480, 'center'), { width: 500, marginLeft: 0 })
})

test('S15P31F106-482: 색 창이 떠 있는 동안(held) 입력창이 포커스를 잃어도 저장하지 않는다', () => {
  const { inputProps, saves } = renderEditor('web', { held: undefined })
  inputProps.onBlur({ target: { value: '쓰는 중' } })
  assert.equal(saves.length, 1, '평소에는 blur 에서 저장한다')
  const held = renderEditorWith('web', { held: true })
  held.inputProps.onBlur({ target: { value: '쓰는 중' } })
  assert.deepEqual(held.saves, [], '색 창이 떠 있으면 저장하지 않는다')
})

test('S15P31F106-482: 삭제 · 색 변경 · iOS 서식 재주입 연결(소스 확인)', () => {
  const editor = readFileSync(new URL('../src/editor/components/TextEditor.js', import.meta.url), 'utf8')
  const screen = readFileSync(new URL('../src/editor/screens/EditorScreen.js', import.meta.url), 'utf8')
  // 삭제는 저장을 막은 뒤 키보드를 내린다
  assert.match(screen, /onDelete=\{\(\) => \{ textCancelRef\.current\?\.\(\); Keyboard\.dismiss\(\);/)
  assert.match(editor, /const stop = \(\) => \{ cancelled\.current = true; keyboardStartup\.current\?\.\(\) \}/)
  // 편집 중 서식 변경은 문서가 아니라 고치는 상자만 바꾸고, 전체 색이면 부분 색을 비운다
  assert.match(screen, /if \(editingText\) \{ setTextEditing\(current => current && current\.id === editingText\.id \? \{ \.\.\.current, \.\.\.patch, \.\.\.\('color' in patch && \{ colorRanges: \[\] \}\) \} : current\); return \}/)
  assert.match(editor, /ranges\.current = \[\]\n\s*refresh\(\)\n\s*\}, \[object\.color\]\)/)
  // iOS: 서식이 바뀌면 같은 글을 두 번(U+200B 를 붙였다 뗀다) 다시 넣는다
  assert.equal((editor.match(/dispatchViewManagerCommand\(tag, 'setTextAndSelection'/g) || []).length, 2)
  assert.match(editor, /\[eventCount\.current, `\$\{draft\.current\}\\u200B`, start, end\]/)
})
