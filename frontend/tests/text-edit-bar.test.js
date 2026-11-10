import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TEXT_EDIT_BAR_HEIGHT, textBoxOnStage, textEditBarPlacement } from '../src/editor/utils/textEditBar.js'

const stage = { width: 1000, height: 700 }
const place = (box, extra = {}) => textEditBarPlacement({ box, stage, barWidth: 360, ...extra })

test('S15P31F106-482: 작업 막대는 상자 위에 먼저, 위가 막히면 아래에, 아래가 키보드에 닿으면 다시 위 한계에 붙는다', () => {
  const box = { left: 100, top: 300, width: 320, height: 60 }
  assert.deepEqual(place(box), { left: 100, top: 300 - 6 - TEXT_EDIT_BAR_HEIGHT, below: false })
  // 위쪽 막대(topLimit 84)에 닿는 상자: 아래로
  assert.deepEqual(place({ ...box, top: 100 }, { topLimit: 84 }), { left: 100, top: 100 + 60 + 6, below: true })
  // 위도 아래도 모자라면(키보드가 바로 아래): 위 한계에 붙여 상자를 조금 가리더라도 잘리지 않게
  const cramped = place({ ...box, top: 100 }, { topLimit: 84, bottomLimit: 150 })
  assert.equal(cramped.top, 84); assert.equal(cramped.below, false)
  // 웹 선택 말풍선이 상자 위에 있으면 아래를 먼저 쓴다. 아래가 없으면 위로 돌아온다
  assert.equal(place(box, { preferBelow: true }).below, true)
  assert.equal(place(box, { preferBelow: true, bottomLimit: 380 }).below, false)
})

test('S15P31F106-482: 가로는 상자 왼쪽에 맞추되 작업창 안에 들어가게 민다', () => {
  assert.equal(place({ left: -40, top: 300, width: 320, height: 60 }).left, 8)
  assert.equal(place({ left: 900, top: 300, width: 320, height: 60 }).left, 1000 - 360 - 8)
  assert.equal(textEditBarPlacement({ box: { left: 0, top: 300, width: 10, height: 10 }, stage: { width: 300, height: 700 }, barWidth: 360 }).left, 8, '막대가 작업창보다 넓어도 왼쪽 8 에서 시작한다')
})

test('S15P31F106-482: 글상자 페이지 좌표를 확대 · 이동을 반영한 작업창 좌표로 바꾼다', () => {
  assert.deepEqual(textBoxOnStage({ x: 100, y: 50, w: 200, h: 40 }, { x: 10, y: 20 }, 0.5), { left: 60, top: 45, width: 100, height: 20 })
  assert.deepEqual(textBoxOnStage({ x: 0, y: 0 }, { x: 0, y: 0 }, 1), { left: 0, top: 0, width: 0, height: 0 }, '크기가 아직 없는 새 상자')
})

// 실제 JSX 를 그려 버튼 구성 · 눌림 연결을 본다
const require = createRequire(import.meta.url)
const fromExpo = createRequire(require.resolve('expo/package.json'))
const { code } = fromExpo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/TextEditBar.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[fromExpo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], fromExpo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function load() {
  const module = { exports: {} }
  const pressed = []
  const native = {
    StyleSheet: { create: (styles) => styles },
    View: ({ children }) => React.createElement('div', null, children),
    Text: ({ children }) => React.createElement('span', null, children),
    Pressable: ({ children, accessibilityLabel, accessibilityState, onPress }) => { pressed.push([accessibilityLabel, onPress]); return React.createElement('button', { 'aria-label': accessibilityLabel, 'aria-selected': accessibilityState?.selected ? 'true' : undefined }, children) },
  }
  const loader = (name) => {
    if (name === 'react-native') return native
    if (name === '../../shared/theme') return { colors: {}, shadow: { float: {} } }
    if (name === './controls/Icon') return { __esModule: true, default: ({ name }) => React.createElement('i', { 'data-icon': name }) }
    
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
    return require(name)
  }
  new Function('require', 'module', 'exports', code)(loader, module, module.exports)
  return { Bar: module.exports.default, pressed }
}

test('S15P31F106-482: 막대는 상자 동작만 — 완료 · 복제 · 삭제 순이고, 서식 켜고 끄기 · 글씨 크기는 두지 않는다(키보드 위 서식 줄이 맡는다)', () => {
  const calls = []
  const handlers = Object.fromEntries(['onDone', 'onDuplicate', 'onDelete'].map(name => [name, () => calls.push(name)]))
  const { Bar, pressed } = load()
  const html = renderToStaticMarkup(React.createElement(Bar, handlers))
  assert.deepEqual([...html.matchAll(/aria-label="([^"]+)"/g)].map(([, label]) => label), ['완료', '복제', '삭제'])
  for (const gone of ['서식', '글씨 축소', '글씨 확대']) assert.doesNotMatch(html, new RegExp(`aria-label="${gone}"`))
  // 삭제는 복제와 구분선으로 떨어져 있다(오터치로 상자가 사라지지 않게)
  assert.match(html, /aria-label="복제"[^]*?<\/button><div><\/div><button[^>]*aria-label="삭제"/)

  for (const [, onPress] of pressed) onPress()
  assert.deepEqual(calls, ['onDone', 'onDuplicate', 'onDelete'])
})
