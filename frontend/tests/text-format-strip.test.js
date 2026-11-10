import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DEFAULT_TEXT_SETTINGS } from '../src/editor/utils/text.js'

const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const { code } = fromExpo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextFormatStrip.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})

const FONTS = [{ id: 'system', label: '기본' }, { id: 'nanum-gothic', label: '나눔고딕' }, { id: 'maruburi', label: '마루부리' }]
// 실제 JSX 를 그려 항목 구성 · 적용 패치를 본다. 팔레트 · 글꼴 목록 · 글꼴 상태는 대역으로 둔다
function load({ recent = [] } = {}) {
  const module = { exports: {} }
  const pressed = [], opened = [], recorded = []
  const native = {
    Platform: { OS: 'ios' },
    StyleSheet: { create: (styles) => styles },
    View: ({ children, accessibilityLabel }) => React.createElement('div', { 'aria-label': accessibilityLabel }, children),
    Text: ({ children, accessibilityLabel }) => React.createElement('span', { 'aria-label': accessibilityLabel }, children),
    Pressable: ({ children, accessibilityLabel, accessibilityState, onPress, disabled }) => { pressed.push([accessibilityLabel, onPress]); return React.createElement('button', { 'aria-label': accessibilityLabel, 'aria-selected': accessibilityState?.selected ? 'true' : undefined, 'aria-expanded': accessibilityState?.expanded ? 'true' : undefined, disabled }, children) },
  }
  const loader = (name) => {
    if (name === 'react-native') return native
    if (name === 'react-native-svg') return { __esModule: true, default: ({ children }) => React.createElement('svg', null, children), Path: () => React.createElement('path'), Circle: ({ fill }) => React.createElement('circle', { fill }) }
    if (name === '../../shared/theme') return { colors: {}, shadow: { float: {} } }
    if (name === '../utils/text') return {
      TEXT_COLORS: ['#111111', '#222222'], italicTransform: () => [], textStyleReady: () => true, textStyleSupport: () => ({ bold: true }),
      textFontChangePatch: (settings, id) => ({ font: id }), fontLabel: (font) => font.label, getTextFonts: () => FONTS, getPickableTextFonts: () => FONTS.slice(0, 2),
      resolveFontId: (id) => id ?? 'system', subscribeTextFonts: () => () => {}, textFontStateSnapshot: () => '', textStyle: () => ({ fontFamily: 'x' }),
    }
    if (name === '../hooks/usePalettes') return { usePalette: () => null }
    if (name === '../../diary/components/PresetColorEditor') return { useColorWindow: () => ({ open: (ref, props) => { opened.push(props) }, element: null, isOpen: false }) }
    if (name === '../hooks/usePaperColorRecents.js') return { usePaperColorRecents: () => recent, recordPaperColor: (...args) => recorded.push(args) }
    // 속지 색 줄과 같은 규칙(실제 모듈은 paper-color-row.test.js 가 본다): 최근 색 → 견본 순, 지금 색은 늘 보임
    if (name === '../utils/paperColorRow.js') return { paperColorRow: (recentColors, presets, current, size) => { const seen = []; for (const c of [...recentColors, ...presets.map(([, c]) => c)]) { const k = c.toUpperCase(); if (!seen.includes(k)) seen.push(k) } let shown = seen.slice(0, size); const now = current?.toUpperCase(); if (now && !shown.includes(now)) shown = [now, ...shown].slice(0, size); return shown.map(color => ({ color, name: color })) } }
    if (name === './controls/Icon') return { __esModule: true, default: ({ name }) => React.createElement('i', { 'data-icon': name }) }
    if (name === './controls/FadeScroll') return { __esModule: true, default: ({ children }) => React.createElement('div', { 'data-scroll': 'horizontal' }, children) }
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(loader, module, module.exports)
  return { Strip: module.exports.default, pressed, opened, recorded }
}
const labels = (html) => [...html.matchAll(/aria-label="([^"]+)"/g)].map(([, label]) => label)
const base = { ...DEFAULT_TEXT_SETTINGS, font: 'nanum-gothic', fontSize: 28, color: '#222222', textAlign: 'center', bold: true, letterSpacing: 0, lineSpacing: 1.3 }

test('S15P31F106-482: 서식 줄은 글꼴 · 크기 −/+ · 스타일 · 색(무지개 고리) · 자간 · 줄간격을 한 줄에 두고, 자간 · 줄간격은 숫자 없이, 정렬은 두지 않는다', () => {
  const { Strip } = load()
  const html = renderToStaticMarkup(React.createElement(Strip, { settings: base, onChange() {} }))
  const found = labels(html)
  for (const label of ['글꼴 나눔고딕', '글씨 축소', '글자 크기 28', '글씨 확대', '굵게', '기울임', '밑줄', '취소선', '글자 색 고르기', '자간 좁게', '자간 넓게', '줄간격 좁게', '줄간격 넓게']) assert.ok(found.includes(label), label)
  for (const gone of ['자간 0', '글자 자간 0', '줄간격 130', '글자 줄간격 130', '서식']) assert.equal(found.includes(gone), false, `${gone}: 자간 · 줄간격은 숫자 없이 −/+ 만, 서식 켜고 끄기 버튼은 없다`)
  assert.ok(found.indexOf('글씨 축소') < found.indexOf('굵게'), '크기는 글꼴 바로 다음')
  for (const gone of ['왼쪽 정렬', '가운데 정렬', '오른쪽 정렬', '양쪽 정렬']) assert.equal(found.includes(gone), false, '정렬은 두지 않는다(글자 폭 상자에서는 차이가 없다)')
  assert.match(html, /aria-label="굵게" aria-selected="true"/)
  assert.match(html, /<circle fill="#222222">/, '무지개 고리 가운데 점은 지금 글자 색')
  assert.equal(found.includes('글꼴 고르기'), false, '글꼴 줄은 닫힌 채 시작한다'); assert.equal(found.includes('글자 색 견본'), false, '색 줄도 닫힌 채 시작한다')
  assert.doesNotMatch(html, /<input/, '숫자 입력 칸을 두지 않는다 — 다른 입력에 포커스가 가면 고치던 글상자가 닫힌다')
})

test('S15P31F106-482: 글꼴을 누르면 위에 글꼴 칩 줄(선택 가능한 글꼴만), 무지개를 누르면 색 견본 줄이 펼쳐지고 창(Modal)은 쓰지 않는다', () => {
  const { Strip } = load()
  const fontRow = renderToStaticMarkup(React.createElement(Strip, { settings: base, onChange() {}, defaultPanel: 'font' }))
  assert.ok(labels(fontRow).includes('글꼴 고르기')); assert.ok(labels(renderToStaticMarkup(React.createElement(Strip, { settings: base, onChange() {}, defaultPanel: 'color' }))).includes('글자 색 견본'))
  assert.deepEqual(labels(fontRow).filter(l => /^글꼴 /.test(l) && l !== '글꼴 고르기'), ['글꼴 기본', '글꼴 나눔고딕', '글꼴 나눔고딕'], '칩 둘(숨긴 글꼴 제외) + 현재 글꼴 버튼')
  assert.match(fontRow, /aria-label="글꼴 나눔고딕" aria-selected="true"/)
  assert.match(fontRow, /aria-label="글꼴 나눔고딕" aria-expanded="true"/, '글꼴 버튼은 펼침 상태')
  const colorRow = renderToStaticMarkup(React.createElement(Strip, { settings: base, onChange() {}, defaultPanel: 'color' }))
  assert.deepEqual(labels(colorRow).filter(l => /^글자 색 #/.test(l)), ['글자 색 #111111', '글자 색 #222222'])
  assert.match(colorRow, /aria-label="글자 색 #222222" aria-selected="true"/)
  assert.ok(labels(colorRow).includes('글자 색 직접 고르기'), '견본 끝에 직접 고르기(+)')
  const customShown = renderToStaticMarkup(React.createElement(Strip, { settings: { ...base, color: '#ABCDEF' }, onChange() {}, defaultPanel: 'color' }))
  assert.match(customShown, /aria-label="글자 색 #ABCDEF" aria-selected="true"/, '견본에 없는 지금 색은 맨 앞 칸으로 보인다')
  // 직접 고른 색은 기기에 기억돼 왼쪽에서 들어오고 끝 색이 밀려난다
  const { Strip: StripRecent } = load({ recent: ['#ABCDEF'] })
  const recentRow = renderToStaticMarkup(React.createElement(StripRecent, { settings: { ...base, color: '#111111' }, onChange() {}, defaultPanel: 'color' }))
  assert.deepEqual(labels(recentRow).filter(l => /^글자 색 #/.test(l)), ['글자 색 #ABCDEF', '글자 색 #111111'], '#222222 이 밀려난다')
  assert.doesNotMatch(fontRow + colorRow, /PopoverMenu|Modal/)
})

test('S15P31F106-482: 버튼은 상자 전체 서식 패치를 범위 안에서 만든다', () => {
  const { Strip, pressed } = load()
  const patches = []
  const settings = { ...base, textAlign: 'left', bold: false, italic: false, color: '#111111', letterSpacing: 0.5, lineSpacing: 1 }
  renderToStaticMarkup(React.createElement(Strip, { settings, onChange: (patch) => patches.push(patch), defaultPanel: 'color' }))
  const press = (label) => pressed.find(([name]) => name === label)[1]()
  press('글씨 확대'); press('글씨 축소'); press('굵게'); press('기울임'); press('글자 색 #222222'); press('자간 넓게'); press('자간 좁게'); press('줄간격 좁게'); press('줄간격 넓게')
  assert.deepEqual(patches, [{ fontSize: 30 }, { fontSize: 26 }, { bold: true }, { italic: true }, { color: '#222222' }, { letterSpacing: 0.5 }, { letterSpacing: 0.49 }, { lineSpacing: 1 }, { lineSpacing: 1.05 }])
  // 크기는 8~96 에서 멈춘다
  const { Strip: StripEdge, pressed: pressedEdge } = load()
  const edge = []
  renderToStaticMarkup(React.createElement(StripEdge, { settings: { ...base, fontSize: 95 }, onChange: (patch) => edge.push(patch) }))
  pressedEdge.find(([name]) => name === '글씨 확대')[1]()
  assert.deepEqual(edge, [{ fontSize: 96 }])
  const { Strip: Strip2, pressed: pressed2 } = load()
  const fontPatches = []
  renderToStaticMarkup(React.createElement(Strip2, { settings: base, onChange: (patch) => fontPatches.push(patch), defaultPanel: 'font' }))
  pressed2.find(([name]) => name === '글꼴 기본')[1]()
  assert.deepEqual(fontPatches, [{ font: 'system' }], '글꼴 칩은 글꼴 바꾸기 패치(textFontChangePatch)를 쓴다')
})

test('S15P31F106-482: 직접 고르기는 색 창을 열며 떠 있는 동안 편집 유지(onHold)를 알리고, 확정 · 닫기에서 푼다', () => {
  const { Strip, pressed, opened, recorded } = load()
  const holds = [], patches = []
  renderToStaticMarkup(React.createElement(Strip, { settings: base, onChange: (patch) => patches.push(patch), onHold: (held) => holds.push(held), defaultPanel: 'color' }))
  pressed.find(([name]) => name === '글자 색 직접 고르기')[1]()
  assert.deepEqual(holds, [true]); assert.equal(opened.length, 1); assert.equal(opened[0].value, '#222222')
  assert.equal(opened[0].doneLabel, '완료', '색 창에 완료 버튼')
  opened[0].onChange('#123456'); opened[0].onDone('#123456')
  assert.deepEqual(patches, [{ color: '#123456' }, { color: '#123456' }]); assert.deepEqual(holds, [true, false])
  assert.deepEqual(recorded, [['text', '#123456']], '고른 색을 최근 색으로 기억한다')
  opened[0].onClose(); assert.deepEqual(holds, [true, false, false])
})
