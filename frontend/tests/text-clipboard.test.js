import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as text from '../src/editor/utils/text.js'
import * as textKeyboard from '../src/editor/utils/textKeyboard.js'
import * as formats from '../src/editor/utils/textFormats.js'
import * as photoStrip from '../src/editor/utils/photoStrip.js'
import * as ranges from '../src/editor/utils/textRanges.js'
import * as placement from '../src/editor/utils/popoverPlacement.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'

const require = createRequire(import.meta.url)
const expoRequire = createRequire(require.resolve('expo/package.json'))
const babel = expoRequire('@babel/core')
function load(file, mocks, exportName = 'default') {
  const { code } = babel.transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expoRequire.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expoRequire.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id] ?? require(id), module, module.exports)
  return module.exports[exportName]
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  return [node.props?.children].flat(Infinity).map((child) => find(child, predicate)).find(Boolean)
}

test('클립보드 존재 여부는 변경·앱 복귀에 갱신되고 실제 문자열은 읽지 않는다', async () => {
  let effect, available = false, hasText = false, changed, resumed, removed = 0
  const useAvailable = load('../src/editor/services/textClipboard.js', {
    react: { useState: () => [false, (value) => { available = value }], useEffect: (callback) => { effect = callback } },
    'react-native': { Platform:{OS:'android'}, AppState: { addEventListener: (_event, callback) => { resumed = callback; return { remove() { removed++ } } } } },
    'expo-clipboard': { hasStringAsync: async () => hasText,
      getStringAsync: () => assert.fail('표시 여부 확인 시 문자열을 읽으면 안 된다'),
      addClipboardListener: (callback) => { changed = callback; return { remove() { removed++ } } },
    },
  }, 'useTextClipboardAvailable')
  assert.equal(useAvailable(), false)
  const cleanup = effect()
  await Promise.resolve()
  assert.equal(available, false)
  hasText = true
  await changed()
  assert.equal(available, true)
  hasText = false
  resumed('active')
  await Promise.resolve()
  assert.equal(available, false)
  cleanup()
  assert.equal(removed, 2)
})
function editor(readText = async () => '붙임😀\n둘째 줄', canPaste = true, objectText = '앞뒤', copied = [], platform = 'web') {
  const effects = [], cleanups = [], saves = [], messages = []
  let palette, nativeValue
  const hooks = {
    useRef: (current) => ({ current }),
    useState: (value) => [value, () => {}],
    useEffect: (effect) => effects.push(effect),
  }
  const Editor = load('../src/editor/components/TextEditor.js', {
    '../utils/textKeyboard': textKeyboard,
    react: hooks,
    'react-native': { Platform: { OS: platform }, Keyboard: { dismiss() {}, addListener() {} }, StyleSheet: { create: (s) => s }, View: 'View', Text: 'Text', TextInput: 'TextInput' },
    '../../shared/theme': { colors: {} }, '../utils/text': text, '../hooks/useTextFont': { useTextFont: () => 0 },
    '../utils/textRanges': ranges, '../utils/textFormats': formats,
    '../services/textClipboard': { readText, copyText: async (value) => { copied.push(value) }, useTextClipboardAvailable: () => canPaste },
    './TextActionBar': { default: 'ActionBar', TextRangePanel: 'RangePanel', __esModule: true }, './TextLinkDialog': { default: 'LinkDialog', __esModule: true },
  })
  const node = Editor({ object: { id: 't', text: objectText, x: 0, y: 0, w: 320, h: 40 }, zoom: 1,
    boundary: {}, paletteBounds: {}, onPaletteChange: (value) => { palette = value },
    onSave: (...args) => saves.push(args), onToast: (message) => messages.push(message), onCancel() {},
  })
  const input = find(node, (n) => n.type === 'TextInput').props
  // 웹 말풍선(TextActionBar) 경로: 입력칸 값과 커서를 직접 바꾼다. 앱 경로는 setNativeProps 로 바꾼다
  input.ref.current = { focus() {}, value: objectText, setSelectionRange(start, end) { nativeValue = { text: this.value, selection: { start, end } } },
    setNativeProps: (props) => { nativeValue = props }, measureInWindow() {} }
  const oldCAF = globalThis.cancelAnimationFrame
  globalThis.cancelAnimationFrame = () => {}
  const oldRAF = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = () => 0
  try { effects.forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup) }) }
  finally { globalThis.requestAnimationFrame = oldRAF; globalThis.cancelAnimationFrame = oldCAF }
  const actions = palette ? find(palette.content, (n) => n.type === 'ActionBar').props : null
  return { input, actions, saves, messages, value: () => nativeValue }
}

test('웹: 복사한 텍스트가 있으면 커서에서 붙여넣고, 글도 클립보드도 없으면 편집 바를 숨긴다', async () => {
  assert.equal(editor(async () => '', false, '').actions, null)
  // 시스템 글자 메뉴를 끄므로 클립보드가 비어도 글이 있으면 모두 선택을 띄운다
  const empty = editor(async () => '', false)
  assert.equal(empty.actions.canPaste, false)
  assert.equal(empty.actions.hasText, true)
  const e = editor()
  assert.equal(e.actions.canPaste, true)
  assert.equal(e.actions.hasSelection, false)
  e.input.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 1 } } })
  await e.actions.onPaste()
  assert.equal(e.value().text, '앞붙임😀\n둘째 줄뒤')
  assert.deepEqual(e.value().selection, { start: 10, end: 10 })
  e.input.onEndEditing({ nativeEvent: { text: e.value().text } })
  assert.equal(e.saves[0][0], e.value().text)
})

test('선택 문자열을 교체하고 빈 클립보드와 접근 거부는 내용을 변경하지 않는다', async () => {
  const e = editor(async () => '새 글')
  e.input.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 2 } } })
  await e.actions.onPaste()
  assert.equal(e.value().text, '새 글')
  for (const read of [async () => '', async () => { throw new Error('denied') }]) {
    const failed = editor(read)
    await failed.actions.onPaste()
    assert.equal(failed.value(), undefined)
    assert.equal(failed.messages.length, 1)
  }
})

test('클립보드 응답 전 커서 이동·편집 완료 시 늦은 붙여넣기를 차단한다', async () => {
  for (const finish of [false, true]) {
    let resolve
    const e = editor(() => new Promise((done) => { resolve = done }))
    const pending = e.actions.onPaste()
    if (finish) e.input.onEndEditing({ nativeEvent: { text: '앞뒤' } })
    else e.input.onSelectionChange({ nativeEvent: { selection: { start: 1, end: 1 } } })
    resolve('늦은 글')
    await pending
    assert.equal(e.value(), undefined)
  }
})

test('상자 전체 복제는 서식·회전·크기를 보존하고 Undo/Redo·문서 직렬화 후 유지된다', () => {
  const original = { ...text.createText({ id: 't', text: '서식😀', x: 100, y: 100 }), rotation: 25,
    colorRanges: [{ start: 0, end: 2, color: '#DD887A' }], styleRanges: [{ start: 0, end: 2, fontSize: 32 }] }
  const before = createInitialState({ id: 'doc', pages: [{ id: 'page', objects: [original] }] })
  const next = editorReducer(before, { type: 'duplicateObjects', ids: ['t'] })
  const copy = getCurrentPage(next).objects[1]
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.x, original.x)
  assert.notEqual(copy.y, original.y)
  const { id, x, y, locked, groupId, ...rest } = copy
  const { id: oldId, x: oldX, y: oldY, ...expected } = original
  assert.deepEqual(rest, expected)
  assert.deepEqual(getCurrentPage(editorReducer(next, { type: 'undo' })).objects, [original])
  const restored = editorReducer(editorReducer(next, { type: 'undo' }), { type: 'redo' })
  assert.deepEqual(restored.doc, next.doc)
  assert.deepEqual(JSON.parse(JSON.stringify(createInitialState(JSON.parse(JSON.stringify(next.doc))).doc)), JSON.parse(JSON.stringify(next.doc)))
})

test('텍스트 상자 선택 바의 복제 버튼은 문자열 복사를 호출하지 않는다', () => {
  const actions = []
  const ContextBar = load('../src/editor/components/canvas/ContextBar.js', {
    react: { useState: (value) => [value, () => {}] },
    'react-native': { Linking: {}, StyleSheet: { create: (s) => s }, View: 'View', ScrollView: 'ScrollView' },
    '../../../shared/theme': { colors: {}, shadow: {} },
    '../../constants': { PAGE_WIDTH: 1280, PAGE_HEIGHT: 800 },
    '../../utils/common': { clamp: (value, min, max) => Math.max(min, Math.min(max, value)), unionBounds: () => ({ left: 10, right: 330, top: 10, bottom: 50, cx: 170 }) },
    '../controls/Icon': { __esModule: true, default: 'Icon' },
    '../controls/FadeScroll': { __esModule: true, default: 'ScrollView' },
    '../LassoSelectionMenu': { __esModule: true, default: 'Lasso' },
    '../../utils/penSettings': { EDITOR_COLORS: [] },
    '../../hooks/usePalettes': {}, // 공방 프리셋 저장소가 없으면 기본 펜 색을 쓴다
    '../../utils/popoverPlacement': placement,
    '../../utils/textFormats': formats,
    '../../utils/photoStrip': photoStrip,
    '../../utils/objects': { hasPhotoMedia: o => Boolean(o?.src || o?.mediaFileId), emptyPhotoSlots: () => [] },
  })
  const tree = ContextBar({ objects: [{ id: 'text', type: 'text', text: '원문' }], zoom: 1,
    dispatch: (action) => actions.push(action), onCopyText: () => assert.fail('문자열 복사를 호출하면 안 된다'),
  })
  assert.equal(find(tree, (n) => n.props?.label === '복사'), undefined)
  find(tree, (n) => n.props?.label === '복제').props.onPress()
  assert.deepEqual(actions, [{ type: 'duplicateObjects', ids: ['text'] }])
})

test('웹 글 편집은 미지원 클립보드 구독을 호출하지 않고 안전하게 정리된다',async()=>{
 let effect,available=false,hasText=false,removed=0
 const mocks={
  react:{useState:()=>[false,value=>available=value],useEffect:fn=>effect=fn},
  'react-native':{Platform:{OS:'web'},AppState:{addEventListener:()=>({remove:()=>removed++})}},
  'expo-clipboard':{hasStringAsync:async()=>hasText,setStringAsync:async()=>{hasText=true},addClipboardListener:()=>assert.fail('웹에서 native 구독을 호출하면 안 된다')},
 }
 const hook=load('../src/editor/services/textClipboard.js',mocks,'useTextClipboardAvailable')
 hook();const cleanup=effect();await Promise.resolve();assert.equal(available,false)
 // 웹은 AppState 구독만 정리한다.
 cleanup();assert.equal(removed,1)
})

test('시스템 글자 메뉴 대신 모두 선택 · 잘라내기를 제공한다', async () => {
  const copied = []
  const e = editor(undefined, true, '앞뒤', copied)
  e.actions.onSelectAll()
  assert.deepEqual(e.value().selection, { start: 0, end: 2 })
  e.input.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 1 } } })
  e.actions.onCut()
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(copied, ['앞'])
  assert.equal(e.value().text, '뒤')
  assert.deepEqual(e.value().selection, { start: 0, end: 0 })
})

test('앱: 클립보드 · 고르기는 시스템 메뉴에 맡기고 글자를 고르지 않으면 아무 창도 띄우지 않는다', () => {
  for (const platform of ['ios', 'android']) assert.equal(editor(undefined, true, '앞뒤', [], platform).actions, null)
})

test('잘라내기는 복사하는 사이 선택이 바뀌어도 복사한 범위만 지우고, 그사이 글이 바뀌면 지우지 않는다', async () => {
  const copied = []
  const e = editor(undefined, true, '앞뒤옆', copied)
  e.input.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 1 } } })
  e.actions.onCut()
  e.input.onSelectionChange({ nativeEvent: { selection: { start: 2, end: 3 } } })
  await new Promise((done) => setTimeout(done, 0))
  assert.deepEqual(copied, ['앞'])
  assert.equal(e.value().text, '뒤옆')

  const fCopied = []
  const f = editor(undefined, true, '앞뒤', fCopied)
  f.input.onSelectionChange({ nativeEvent: { selection: { start: 0, end: 1 } } })
  f.actions.onCut()
  f.input.onChangeText('앞뒤!')
  await new Promise((done) => setTimeout(done, 0))
  // 복사는 끝났지만 그사이 글이 바뀌어 지우지 않는다: 입력칸에 아무것도 쓰지 않고 잘라냄 알림도 없다
  assert.deepEqual(fCopied, ['앞'])
  assert.equal(f.value(), undefined)
  assert.deepEqual(f.messages, [])
})
