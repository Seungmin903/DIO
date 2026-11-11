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
  if (id.endsWith('/FontStatusMark')) return { __esModule: true, default: 'mark', FONT_PENDING_TEXT: {}, fontNeedsDownload: status => ['download', 'downloading', 'error'].includes(status), fontStatusA11y: status => ({ download: ', 받지 않은 글꼴', downloading: ', 받는 중', error: ', 받지 못함' })[status] ?? '' }
  if (id.endsWith('/utils/text')) return text
  if (id.endsWith('/templates/paperFont.js')) return paperFont
}
// open 상태를 고정해 한 번 그린다(훅은 흉내 낸다). 글꼴 상태 구독에 넘긴 snapshot 함수들을 돌려준다
function render(relative, props, open, extra = () => undefined) {
  const snapshots = []
  const hooks = { ...React, useEffect: () => {}, useRef: () => ({ current: null }), useState: initial => [initial === false ? open : initial, () => {}], useSyncExternalStore: (_subscribe, snapshot) => { snapshots.push(snapshot); return snapshot() } }
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

// 그린 결과(React 요소 나무)에서 화면 읽기 이름이 label 로 시작하는 누를 수 있는 항목을 찾는다
const findPressable = (node, label) => {
  if (!node || typeof node !== 'object') return null
  if (Array.isArray(node)) { for (const child of node) { const found = findPressable(child, label); if (found) return found } return null }
  if (node.props?.onPress && node.props.accessibilityLabel?.startsWith(label)) return node
  return findPressable(node.props?.children, label)
}
// 원격 글꼴 받기 상태를 대역으로 정한다(받기 → downloaded 에 기록). 목록은 실제 text.js 의 textFontStatus 를 쓴다
const withFileStates = (states, run) => {
  const downloaded = []
  text.setTextFontDownloader({ fileState: (font) => states[font.id] ?? 'bundled', download: async (font) => { downloaded.push(font.id) } })
  try { return run(downloaded) } finally { text.setTextFontDownloader({ fileState: null, download: null }) }
}
const draw = (relative, props, extra = () => undefined, { open = true } = {}) => {
  const hooks = { ...React, useEffect: effect => { effect() }, useRef: () => ({ current: null }), useState: initial => [initial === false ? open : initial, () => {}], useSyncExternalStore: (_subscribe, snapshot) => snapshot() }
  return load(relative, id => id === 'react' ? hooks : nativeModules(id) ?? extra(id)).default(props)
}

test('S15P31F106-743: 글꼴 선택 칸에서 받지 않은 원격 글꼴을 누르면 고르지 않고 받기만 하고, 받는 중에는 아무 일도 하지 않는다', () => withFileStates({ 'gowun-dodum': 'remote', maruburi: 'downloading' }, downloaded => {
  const chosen = []
  const tree = draw('../src/editor/components/controls/TextFontDropdown.js', { value: 'nanum-gothic', onChange: id => chosen.push(id) })
  const remote = findPressable(tree, '고운돋움'), busy = findPressable(tree, '마루부리'), ready = findPressable(tree, '나눔명조')
  assert.match(remote.props.accessibilityLabel, /받지 않은 글꼴/)
  remote.props.onPress()
  assert.deepEqual([chosen, downloaded], [[], ['gowun-dodum']])
  busy.props.onPress()
  assert.deepEqual([chosen, downloaded], [[], ['gowun-dodum']], '받는 중에는 고르지도 다시 받지도 않는다')
  assert.equal(busy.props.accessibilityState.busy, true)
  ready.props.onPress()
  assert.deepEqual(chosen, ['nanum-myeongjo'], '받은(앱에 든) 글꼴은 그대로 고른다')
}))

test('S15P31F106-743: 속지 글꼴 칸도 받지 않은 원격 글꼴은 받기만 하고, 받은 글꼴은 고른다', () => withFileStates({ 'gowun-dodum': 'remote' }, downloaded => {
  const chosen = []
  const chips = id => id.endsWith('/components/PaperFontChips') ? load('../src/editor/components/PaperFontChips.js', nativeModules) : undefined
  const tree = draw('../src/diary/components/PaperFontDropdown.js', { value: 'nanum-gothic', onChange: id => chosen.push(id) }, chips)
  findPressable(tree, '속지 글꼴 고운돋움').props.onPress()
  assert.deepEqual([chosen, downloaded], [[], ['gowun-dodum']])
  findPressable(tree, '속지 글꼴 나눔명조').props.onPress()
  assert.deepEqual(chosen, ['nanum-myeongjo'])
}))

test('꾸미기 공방 속지 글꼴 칸(autoDownload)은 고른 글꼴을 받지 않았으면 바로 받고, 다른 곳 · 받지 못한 글꼴은 자동으로 받지 않는다', () => {
  const chips = id => id.endsWith('/components/PaperFontChips') ? load('../src/editor/components/PaperFontChips.js', nativeModules) : undefined
  const file = '../src/diary/components/PaperFontDropdown.js'
  withFileStates({ 'gowun-dodum': 'remote' }, downloaded => {
    const tree = draw(file, { value: 'gowun-dodum', onChange() {}, autoDownload: true }, chips, { open: false })
    assert.deepEqual(downloaded, ['gowun-dodum'], '공방: 칸이 보이면 고른 글꼴을 받는다')
    assert.match(findPressable(tree, '속지 글꼴 고운돋움').props.accessibilityLabel, /받지 않은 글꼴/, '칸에도 받기 전 상태가 보인다')
  })
  withFileStates({ 'gowun-dodum': 'remote' }, downloaded => {
    draw(file, { value: 'gowun-dodum', onChange() {} }, chips, { open: false })
    assert.deepEqual(downloaded, [], '편집 화면 · 새 다이어리 속지 설정은 자동으로 받지 않는다')
  })
  withFileStates({ 'gowun-dodum': 'downloading', 'nanum-gothic': 'bundled' }, downloaded => {
    draw(file, { value: 'gowun-dodum', onChange() {}, autoDownload: true }, chips, { open: false })
    draw(file, { value: 'nanum-gothic', onChange() {}, autoDownload: true }, chips, { open: false })
    assert.deepEqual(downloaded, [], '받는 중 · 앱에 든 글꼴은 다시 받지 않는다')
  })
  text.markTextFontFailed('GowunDodum')
  withFileStates({ 'gowun-dodum': 'remote' }, downloaded => {
    draw(file, { value: 'gowun-dodum', onChange() {}, autoDownload: true }, chips, { open: false })
    assert.deepEqual(downloaded, [], '받지 못한 글꼴은 자동으로 다시 받지 않는다(오프라인에서 끝없이 받지 않게)')
  })
})

test('꾸미기 공방(StudioPaperStyle)만 속지 글꼴 자동 받기를 켠다(소스 확인)', () => {
  const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(read('../src/diary/components/StudioPaperStyle.js'), /<PaperFontDropdown autoDownload /)
  for (const path of ['../src/diary/components/PaperOptions.js', '../src/editor/components/PaperColorSettings.js']) assert.doesNotMatch(read(path), /autoDownload/, path)
})
