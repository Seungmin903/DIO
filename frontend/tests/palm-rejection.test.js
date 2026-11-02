import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const compile = (path) => expo('@babel/core').transformSync(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code

// 손바닥 거르기 훅을 React 없이 돌린다. os 로 플랫폼(iOS 는 force, Android 는 pointerType)을 고른다.
// input 은 그리기 입력 설정(shared/drawingInput: auto · pen · any)
function load(os = 'android', input = 'auto') {
  const stylusModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/utils/stylus.js'))(
    (id) => (id === 'react-native' ? { Platform: { OS: os } } : require(id)), stylusModule, stylusModule.exports)
  const hookModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/hooks/usePalmRejection.js'))((id) => {
    if (id === 'react') return { createContext: (value) => ({ value }), useRef: (current) => ({ current }), useLayoutEffect: (fn) => fn() }
    if (id.endsWith('/stylus')) return stylusModule.exports
    if (id.endsWith('/drawingInput')) return { getDrawingInput: () => input }
    return require(id)
  }, hookModule, hookModule.exports)
  return { stylus: stylusModule.exports, usePalmRejectingPan: hookModule.exports.usePalmRejectingPan }
}

function setup(os, input) {
  const { stylus, usePalmRejectingPan } = load(os, input)
  const log = []
  const responder = usePalmRejectingPan({
    onStart: (event) => log.push(['start', event.touches.length, event.locationX]),
    onMove: (dx, dy, event) => log.push(['move', dx, event.touches.length]),
    onEnd: ({ cancelled }) => log.push(['end', cancelled]),
  })
  const touches = new Map()
  const event = () => {
    const list = [...touches.values()]
    return { nativeEvent: { ...list[0], touches: list } }
  }
  const pointer = (id, pointerType) => stylus.notePointerDown({ nativeEvent: { pointerId: id, pointerType } })
  return {
    stylus, log, pointer, responder,
    down(id, x, extra = {}) {
      const first = touches.size === 0
      touches.set(id, { identifier: id, pageX: x, pageY: 0, locationX: x, locationY: 0, ...extra })
      if (first) responder.onResponderGrant(event())
      else responder.onResponderStart(event())
    },
    askRelease: (id, x, extra = {}) => {
      const list = [...touches.values(), { identifier: id, pageX: x, pageY: 0, ...extra }]
      return responder.onResponderTerminationRequest({ nativeEvent: { touches: list } })
    },
    move(id, x, extra = {}) {
      // 실제 이벤트처럼 매번 새 터치 객체를 만든다
      touches.set(id, { ...touches.get(id), pageX: x, ...extra })
      responder.onResponderMove(event())
    },
    up(id) {
      touches.delete(id)
      if (touches.size) responder.onResponderEnd(event())
      else responder.onResponderRelease()
    },
  }
}

test('이동 없는 탭은 force 0/누락/고정 양수여도 드래그 move를 만들지 않는다', () => {
  for (const force of [0, undefined, 0.4]) {
    const t = setup('ios')
    t.down(0, 10, { force })
    t.move(0, 10, { force })
    const end = { nativeEvent: { touches: [], changedTouches: [{ identifier: 0, pageX: 10, pageY: 0, force: 0 }] } }
    t.responder.onResponderEnd(end)
    t.responder.onResponderRelease(end)
    assert.deepEqual(t.log.map(row => row[0]), ['start', 'end'])
  }
})

test('정지 중 실측 압력 변화는 전달하고 같은 위치의 해제 0은 중복 move로 전달하지 않는다', () => {
  const t = setup('ios')
  t.down(0, 10, { force: 0.4 })
  t.move(0, 10, { force: 0.8 })
  t.move(0, 10, { force: 0 })
  t.move(0, 10, { force: 0 })
  t.responder.onResponderRelease({ nativeEvent: { identifier: 0, pageX: 10, pageY: 0, force: 0, touches: [] } })
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 0, 1], ['move', 0, 1], ['end', false]])
})

test('Pencil pointerId별로 해제하고 손바닥 pointerdown은 활성 펜을 지우지 않는다', () => {
  const { stylus: module } = load('ios')
  module.setPenPointerActive(1, true)
  module.setPenPointerActive(2, true)
  module.notePointerDown({ nativeEvent: { pointerId: 3, pointerType: 'touch' } })
  assert.equal(module.stylus.activePen, true)
  module.notePointerUp({ nativeEvent: { pointerId: 3 } })
  module.setPenPointerActive(1, false)
  assert.equal(module.stylus.activePen, true, '다른 Pencil 포인터를 유지한다')
  module.setPenPointerActive(2, false)
  assert.equal(module.stylus.activePen, false)
  module.setPenPointerActive(1, true)
  module.resetStylusPointers()
  assert.equal(module.stylus.activePen, false)
  assert.equal(module.stylus.seen, true, '백그라운드 복귀 후 펜 선호 정책은 유지한다')
})

test('Android 펜 모드: 손바닥이 먼저 닿아 있어도 펜 획만 그리고, 입력에는 터치 하나만 넘긴다', () => {
  const t = setup('android')
  t.pointer(0, 'touch')
  t.pointer(1, 'pen')
  // 펜을 한 번 보여 펜 모드로
  t.stylus.notePointerDown({ nativeEvent: { pointerId: 9, pointerType: 'pen' } })
  t.down(0, 10) // 손바닥
  assert.deepEqual(t.log, [])
  assert.equal(t.askRelease(1, 50), false, '펜이 닿으면 확대·축소로 넘기지 않는다')
  t.down(1, 50)
  t.move(1, 80)
  t.move(0, 30) // 손바닥이 움직여도
  t.up(1)
  assert.deepEqual(t.log, [['start', 1, 50], ['move', 30, 1], ['end', false]])
})

test('Android 펜 모드: 펜으로 그리는 중에 닿은 손바닥은 확대·축소를 일으키지 않는다', () => {
  const t = setup('android')
  t.pointer(1, 'pen')
  t.down(1, 50)
  t.move(1, 60)
  t.pointer(2, 'touch')
  assert.equal(t.askRelease(2, 200), false)
  t.down(2, 200)
  t.move(1, 90)
  t.up(1)
  assert.deepEqual(t.log.map((e) => e[0]), ['start', 'move', 'move', 'end'])
  assert.deepEqual(t.log.at(-1), ['end', false])
})

test('Android 펜 모드: 두 손가락은 그리지 않고 보는 영역(확대·축소)에 넘긴다', () => {
  const t = setup('android')
  t.stylus.notePointerDown({ nativeEvent: { pointerId: 9, pointerType: 'pen' } })
  t.pointer(0, 'touch')
  t.down(0, 10)
  t.pointer(1, 'touch')
  assert.equal(t.askRelease(1, 100), true)
  assert.deepEqual(t.log, [])
})

test('펜 모드에서 종류를 늦게 알게 된 터치: 펜이면 닿은 자리부터 그리고, 손가락이면 버린다', () => {
  const t = setup('android')
  t.stylus.notePointerDown({ nativeEvent: { pointerId: 9, pointerType: 'pen' } })
  t.down(3, 40) // 포인터 이벤트보다 터치가 먼저 왔다
  assert.deepEqual(t.log, [])
  t.pointer(3, 'pen')
  t.move(3, 55)
  assert.deepEqual(t.log, [['start', 1, 40], ['move', 15, 1]])
})

test('펜을 구분할 수 없을 때(Expo Go): 거의 동시에 닿은 두 손가락만 확대·축소, 가만히 있던 첫 터치는 손바닥', () => {
  const t = setup('android')
  t.down(0, 10)
  assert.equal(t.askRelease(1, 100), true, '곧바로 닿은 두 번째 손가락 = 확대·축소')
  assert.deepEqual(t.log, [['start', 1, 10], ['end', true]])

  const late = setup('android')
  late.down(0, 10)
  late.move(0, 40) // 쓰는 중
  assert.equal(late.askRelease(1, 200), false, '쓰다가 닿은 손은 무시')
  late.down(1, 200)
  late.move(0, 60)
  assert.deepEqual(late.log.map((e) => e[0]), ['start', 'move', 'move'])
})

test('그리기 입력 펜만: 펜을 아직 못 봤어도 손가락으로는 그리지 않고, 펜은 그린다', () => {
  const t = setup('android', 'pen')
  t.pointer(0, 'touch')
  t.down(0, 10)
  t.move(0, 40)
  t.up(0)
  assert.deepEqual(t.log, [])
  t.pointer(1, 'pen')
  t.down(1, 50)
  t.move(1, 70)
  t.up(1)
  assert.deepEqual(t.log, [['start', 1, 50], ['move', 20, 1], ['end', false]])
})

test('그리기 입력 펜만: 포인터 이벤트보다 먼저 온 첫 터치는 종류를 알 때까지 그리지 않는다', () => {
  const t = setup('android', 'pen')
  t.down(3, 40)
  assert.deepEqual(t.log, [])
  t.pointer(3, 'touch')
  t.move(3, 80)
  assert.deepEqual(t.log, [])
})

test('그리기 입력 펜 · 손가락: 펜을 본 뒤에도 손가락으로 그린다', () => {
  const t = setup('android', 'any')
  t.stylus.notePointerDown({ nativeEvent: { pointerId: 9, pointerType: 'pen' } })
  t.pointer(0, 'touch')
  t.down(0, 10)
  t.move(0, 40)
  t.up(0)
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 30, 1], ['end', false]])
})

test('그리기 입력 펜 · 손가락: 막 닿은 펜 획을 뒤에 닿은 손바닥이 빼앗지 않는다', () => {
  const t = setup('android', 'any')
  t.pointer(1, 'pen')
  t.down(1, 50) // 아직 움직이지 않았다
  t.pointer(2, 'touch')
  assert.equal(t.askRelease(2, 200), false)
  t.down(2, 200)
  t.move(2, 260)
  t.move(1, 70)
  t.up(1)
  assert.deepEqual(t.log, [['start', 1, 50], ['move', 20, 1], ['end', false]])
})

test('iOS: Apple Pencil(force > 0)이 보이면 손가락으로는 그리지 않는다', () => {
  const t = setup('ios')
  t.down(1, 20, { force: 0.5 })
  t.up(1)
  t.down(2, 30, { force: 0 })
  t.move(2, 60)
  assert.deepEqual(t.log.map((e) => e[0]), ['start', 'end'])
})


for (const os of ['android', 'ios']) test(`${os}: 마지막 move가 빠져도 end 좌표를 전달하고 release에서는 중복 확정하지 않는다`, () => {
  const t = setup(os)
  t.down(0, 10, { force: 0.5 })
  t.move(0, 20)
  const end = { nativeEvent: { touches: [], changedTouches: [{ identifier: 0, pageX: 90, pageY: 0 }] } }
  t.responder.onResponderEnd(end)
  t.responder.onResponderRelease(end)
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 10, 1], ['move', 80, 1], ['end', false]])
})

test('짧은 획은 move 없이 release만 와도 끝점을 남긴다', () => {
  const t = setup('android')
  t.down(0, 10)
  t.responder.onResponderRelease({ nativeEvent: { identifier: 0, pageX: 80, pageY: 0, touches: [] } })
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 70, 1], ['end', false]])
})

test('손바닥 해제 좌표는 펜 끝점에 섞이지 않고 취소된 획도 확정하지 않는다', () => {
  const t = setup('android')
  t.pointer(0, 'pen'); t.down(0, 10); t.move(0, 30)
  t.pointer(1, 'touch'); t.down(1, 200)
  t.responder.onResponderEnd({ nativeEvent: {
    touches: [{ identifier: 0, pageX: 30, pageY: 0 }],
    changedTouches: [{ identifier: 1, pageX: 999, pageY: 0 }],
  } })
  assert.equal(t.log.length, 2)
  t.responder.onResponderTerminate({ nativeEvent: { identifier: 0, pageX: 90, pageY: 0 } })
  assert.deepEqual(t.log.at(-1), ['end', true])
  assert.equal(t.log.length, 3)
})
