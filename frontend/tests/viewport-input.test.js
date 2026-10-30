import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { panView, clampOffset } from '../src/editor/utils/viewport.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/Viewport.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const padding = { top: 84, bottom: 76, side: 28 }
function fixture(stage, hand, effects = false, interactionLocked = false) {
  const commits = [], module = { exports: {} }
  const cleanups = [], appState = [], stylus = { activePen: false }
  const load = id => {
    if (id === 'react') return { useRef: current => ({ current }), useState: value => [value, () => {}], useEffect(fn) { if (effects) { const cleanup = fn(); if (cleanup) cleanups.push(cleanup) } } }
    if (id === 'react-native') return { AppState: { addEventListener: (_name, fn) => { appState.push(fn); return { remove() { appState.splice(appState.indexOf(fn), 1) } } } }, Platform: { OS: 'ios', select: v => v.default }, View: 'view', Text: 'text', StyleSheet: { create: v => v } }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/stylus')) return { stylus, touchKind: t => t.kind ?? 'touch',
      notePointerDown() { stylus.activePen = true }, notePointerUp() { stylus.activePen = false }, resetStylusPointers() { stylus.activePen = false } }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const zoom = Math.min((stage.width - 56) / 1188, (stage.height - 160) / 840)
  const tree = module.exports.default({ interactionLocked, scale: 1, zoom, offset: { x: 100, y: 100 }, dragToPan: hand,
    onView: v => commits.push(v),
    resolvePan: (from, dx, dy) => ({ ...from, ...panView(from, dx, dy, zoom, stage, 1188, 840, padding) }),
    resolveZoom: (scale, point, screen) => ({ scale, zoom: zoom * scale,
      ...clampOffset({ x: screen.x - point.x * zoom * scale, y: screen.y - point.y * zoom * scale }, zoom * scale, stage, 1188, 840) }),
  })
  const event = i => {
    const a = { pageX: 100 + i * 3, pageY: 200 - i * 2 }
    return { nativeEvent: { ...a, touches: hand ? [a] : [a, { pageX: a.pageX + 40, pageY: a.pageY }] } }
  }
  return { commits, handlers: tree.props, appState, unmount: () => cleanups.forEach(fn => fn()), run() {
    tree.props.onResponderGrant(event(0))
    for (let i = 1; i <= 30; i += 1) tree.props.onResponderMove(event(i))
    assert.equal(commits.length, 0, '이동 중에는 부모 상태를 확정하지 않는다')
    tree.props.onResponderRelease()
    assert.equal(commits.length, 1)
    return commits[0]
  } }
}

for (const width of [700, 1000]) test(`Viewport 실제 핸들러는 렌더링 전 30회 입력을 누적하고 두 손가락 이동과 일치한다 (${width}px)`, () => {
  const stage = { width, height: 700 }
  const hand = fixture(stage, true).run()
  const pinch = fixture(stage, false).run()
  assert.ok(Math.abs(hand.x - 190) < 1e-9)
  assert.ok(Math.abs(hand.y - 40) < 1e-9)
  assert.ok(Math.abs(hand.x - pinch.x) < 1e-9)
  assert.ok(Math.abs(hand.y - pinch.y) < 1e-9)
  assert.equal(hand.scale, 1)
})

const fingers = (...touches) => ({ nativeEvent: { ...touches[0], touches } })
const finger = (identifier, pageX, kind = 'touch') => ({ identifier, pageX, pageY: 0, kind })

test('up 누락 뒤 백그라운드로 가면 펜 상태를 해제하고 두 손가락 확대가 복구된다', () => {
  const f = fixture({ width: 700, height: 700 }, false, true), h = f.handlers
  h.onPointerDownCapture({ nativeEvent: { pointerId: 1, pointerType: 'pen' } })
  const touches = fingers(finger(1, 0), finger(2, 100))
  assert.equal(h.onStartShouldSetResponderCapture(touches), false)
  f.appState[0]('background')
  assert.equal(h.onStartShouldSetResponderCapture(touches), true)
  f.unmount()
  assert.equal(f.appState.length, 0)
})

for (const endOnly of [false, true]) test(`핀치 재접촉은 현재 live 배율에서 시작한다 (${endOnly ? '해제 이벤트' : '한 손가락 이동'})`, () => {
  const f = fixture({ width: 700, height: 700 }, false), h = f.handlers
  h.onResponderGrant(fingers(finger(1, 0), finger(2, 100)))
  h.onResponderMove(fingers(finger(1, 0), finger(2, 200)))
  if (endOnly) h.onResponderEnd(fingers(finger(1, 0)))
  else h.onResponderMove(fingers(finger(1, 0)))
  h.onResponderMove(fingers(finger(1, 0), finger(3, 50)))
  h.onResponderRelease()
  assert.equal(f.commits[0].scale, 2)
})

test('펜과 손바닥 조합은 핀치로 가로채지 않는다', () => {
  const h = fixture({ width: 700, height: 700 }, false).handlers
  assert.equal(h.onStartShouldSetResponderCapture(fingers(finger(1, 0, 'pen'), finger(2, 100))), false)
  assert.equal(h.onStartShouldSetResponderCapture(fingers(finger(1, 0), finger(2, 100))), true)
})


test('고정 비교 Viewport는 핀치와 손바닥 이동을 수용하거나 확정하지 않는다', () => {
  for (const hand of [false, true]) {
    const f = fixture({ width: 1000, height: 700 }, hand, false, true), h = f.handlers
    const e = fingers(finger(1, 0), finger(2, 100))
    assert.equal(h.onStartShouldSetResponderCapture(e), false)
    assert.equal(h.onStartShouldSetResponder(), false)
    h.onResponderGrant(e)
    h.onResponderMove(fingers(finger(1, 100), finger(2, 400)))
    h.onResponderRelease()
    assert.equal(f.commits.length, 0)
  }
})

test('손바닥 도구로 움직이지 않고 오래 누르면 그 자리의 페이지 좌표를 알리고, 탭 · 끌기는 메뉴를 열지 않는다', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const module = { exports: {} }
  const load = id => {
    if (id === 'react') return { useRef: current => ({ current }), useState: value => [value, () => {}], useEffect() {} }
    if (id === 'react-native') return { AppState: { addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios', select: v => v.default }, View: 'view', Text: 'text', StyleSheet: { create: v => v } }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/stylus')) return { stylus: { activePen: false }, touchKind: () => 'touch', notePointerDown() {}, notePointerUp() {}, resetStylusPointers() {} }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const pressed = [], taps = []
  const h = module.exports.default({ scale: 1, zoom: 0.5, offset: { x: 100, y: 100 }, dragToPan: true, onView() {},
    resolvePan: (from, dx, dy) => ({ ...from, x: from.x + dx, y: from.y + dy }), resolveZoom: () => null,
    onTapEmpty: () => taps.push(1), onLongPress: point => pressed.push(point) }).props
  const touch = (pageX, pageY) => ({ nativeEvent: { pageX, pageY, touches: [{ pageX, pageY }] } })

  h.onResponderGrant(touch(300, 200))
  t.mock.timers.tick(450)
  assert.deepEqual(pressed, [{ x: 400, y: 200 }])
  h.onResponderRelease()
  assert.equal(taps.length, 0, '메뉴를 띄운 터치는 빈 곳 탭(선택 해제)으로 치지 않는다')

  h.onResponderGrant(touch(300, 200))
  h.onResponderMove(touch(340, 200))
  t.mock.timers.tick(450)
  h.onResponderRelease()
  assert.equal(pressed.length, 1, '끌어서 화면을 옮기면 메뉴를 열지 않는다')

  h.onResponderGrant(touch(300, 200))
  t.mock.timers.tick(200)
  h.onResponderRelease()
  t.mock.timers.tick(500)
  assert.equal(pressed.length, 1, '짧은 탭은 메뉴를 열지 않는다')
  assert.equal(taps.length, 1)
})
