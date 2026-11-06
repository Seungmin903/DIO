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
// input 은 그리기 입력 설정(shared/drawingInput: pen · any). unset 은 고른 적 없는 상태(펜을 본 뒤로 pen)
function load(os = 'android', input = 'unset', nativePen = () => false) {
  const stylusModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/utils/stylus.js'))(
    (id) => {
      if (id === 'react-native') return { Platform: { OS: os } }
      if (id.endsWith('/drawingInput')) return { markPenSeen() {} }
      if (id.endsWith('/stylusSensor.js')) return { nativePenAt: nativePen }
      return require(id)
    }, stylusModule, stylusModule.exports)
  const hookModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/hooks/usePalmRejection.js'))((id) => {
    if (id === 'react') return { createContext: (value) => ({ value }), useRef: (current) => ({ current }), useLayoutEffect: (fn) => fn() }
    if (id.endsWith('/stylus')) return stylusModule.exports
    if (id.endsWith('/drawingInput')) return { getDrawingInput: () => input === 'unset' ? (stylusModule.exports.stylus.seen ? 'pen' : 'any') : input }
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
  const pointer = (id, pointerType, x) => stylus.notePointerDown({ nativeEvent: { pointerId: id, pointerType, ...(x === undefined ? {} : { clientX: x, clientY: 0 }) } })
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

test('iOS 종료된 접촉의 pointerup 유실은 일반 모드 fallback을 막지 않으며 활성 접촉은 차단을 유지한다', () => {
  const { stylus: s } = load('ios')
  s.notePointerDown({ nativeEvent: { pointerId: 9, pointerType: 'pen', clientX: 10, clientY: 0 } })
  assert.equal(s.touchKind({ identifier: 1, pageX: 10, pageY: 0 }, { requirePointer: true }), 'pen')
  s.forgetStylusTouch(1)
  const next = { identifier: 2, pageX: 30, pageY: 0, force: 0.5 }
  assert.equal(s.touchKind(next), 'pen')
  assert.equal(s.touchKind(next, { requirePointer: true }), 'unknown')
  s.notePointerDown({ nativeEvent: { pointerId: 10, pointerType: 'touch', clientX: 50, clientY: 0 } })
  assert.equal(s.touchKind(next), 'unknown')
  s.notePointerUp({ nativeEvent: { pointerId: 10 } }) // pointercancel에도 같은 정리 함수를 사용
  assert.equal(s.touchKind(next), 'pen')
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

test('iPad 펜만: 압력 0의 Pencil 포인터를 허용하고 손가락 포인터는 압력이 있어도 차단한다', () => {
  const t = setup('ios', 'pen')
  t.pointer(91, 'pen', 10); t.down(1, 10, { force: 0 }); t.move(1, 30, { force: 0 }); t.up(1); t.stylus.notePointerUp({ nativeEvent: { pointerId: 91 } })
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 20, 1], ['end', false]])
  t.pointer(92, 'touch', 40); t.down(2, 40, { force: 0.7 }); t.move(2, 60, { force: 0.7 }); t.up(2)
  assert.deepEqual(t.log, [['start', 1, 10], ['move', 20, 1], ['end', false]])
})

test('iPad 펜만: 터치가 먼저 오면 포인터가 확인될 때만 Pencil을 시작한다', () => {
  const t = setup('ios', 'pen')
  t.down(3, 40, { force: 0 }); assert.deepEqual(t.log, [])
  t.pointer(93, 'pen', 40); t.move(3, 55, { force: 0 }); t.up(3); t.stylus.notePointerUp({ nativeEvent: { pointerId: 93 } })
  assert.deepEqual(t.log, [['start', 1, 40], ['move', 15, 1], ['end', false]])
  t.down(4, 70, { force: 0 }); t.pointer(94, 'touch', 70); t.move(4, 90, { force: 0 }); t.up(4)
  assert.deepEqual(t.log, [['start', 1, 40], ['move', 15, 1], ['end', false]])
})

test('iPad 펜만: 손바닥과 Pencil의 서로 다른 ID를 위치로 구분하고 이전 접촉의 ID 재사용을 막는다', () => {
  const t = setup('ios', 'pen')
  t.pointer(2, 'touch', 200); t.down(0, 200, { force: 0 })
  t.pointer(1, 'pen', 50); t.down(1, 50, { force: 0 }); t.move(1, 70, { force: 0 })
  assert.deepEqual(t.log, [['start', 1, 50], ['move', 20, 1]])
  t.up(1); t.up(0)
  t.down(0, 50, { force: 0 }); t.move(0, 70, { force: 0 }); t.up(0)
  assert.deepEqual(t.log, [['start', 1, 50], ['move', 20, 1], ['end', false]])
})

test('iPad 펜만: 같은 위치에 여러 종류의 포인터가 겹치면 손가락을 Pencil로 추측하지 않는다', () => {
  const t = setup('ios', 'pen')
  t.pointer(1, 'pen', 50); t.pointer(2, 'touch', 50)
  assert.equal(t.stylus.isSameIOSPenContact({ identifier: 0, pageX: 50, pageY: 0 }, 1), false)
  t.down(0, 50, { force: 0 }); t.move(0, 60, { force: 0 }); t.up(0)
  assert.deepEqual(t.log, [])
})

test('iPad 접촉 인계는 유일한 Pencil 포인터에만 허용한다', () => {
  const t = setup('ios', 'pen')
  const touch = { identifier: 0, pageX: 50, pageY: 0 }
  t.pointer(9, 'pen', 50)
  assert.equal(t.stylus.isSameIOSPenContact(touch, 9), true)
  assert.equal(t.stylus.isSameIOSPenContact(touch, 10), false)
})

test('iPad 펜만: 손가락에 압력이 있고 터치가 먼저 와도 펜으로 그리지 않는다', () => {
  const t = setup('ios', 'pen')
  t.down(0, 20, { force: 0.7 }); t.move(0, 30, { force: 0.7 })
  assert.deepEqual(t.log, [])
  t.pointer(2, 'touch', 20); t.move(0, 40, { force: 0.7 }); t.up(0)
  assert.deepEqual(t.log, [])
})

test('iOS 펜만: 포인터가 끝내 오지 않아도 압력이 있는 미확인 터치를 펜으로 추측하지 않는다', () => {
  const t = setup('ios', 'pen')
  t.down(0, 20, { force: 0.7 })
  t.move(0, 40, { force: 0.7 })
  t.up(0)
  assert.deepEqual(t.log, [])
})

test('iOS 펜·손가락: 포인터 이벤트가 없어도 손가락 획을 즉시 시작하고 확정한다', () => {
  const t = setup('ios', 'any')
  t.down(0, 20, { force: 0 })
  assert.deepEqual(t.log, [['start', 1, 20]])
  t.move(0, 40, { force: 0 }); t.up(0)
  assert.deepEqual(t.log, [['start', 1, 20], ['move', 20, 1], ['end', false]])
})

test('iOS 펜·손가락: 터치 뒤 손가락 포인터가 도착해도 획을 중복 시작하지 않는다', () => {
  const t = setup('ios', 'any')
  t.down(0, 20, { force: 0 })
  t.pointer(2, 'touch', 20)
  t.move(0, 40, { force: 0 }); t.up(0)
  assert.deepEqual(t.log, [['start', 1, 20], ['move', 20, 1], ['end', false]])
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


test('터치가 포인터 이벤트보다 먼저 와도 네이티브가 본 펜이면 바로 펜이다', () => {
  const { stylus } = load('android', 'pen', stamp => stamp === 500)
  assert.equal(stylus.touchKind({ identifier: 0, timestamp: 500 }), 'pen')
  assert.equal(stylus.stylus.seen, true)
  assert.equal(stylus.touchKind({ identifier: 1, timestamp: 900 }), 'unknown')
})

test('펜이 이미 닿아 있으면 새로 모르는 터치는 네이티브 시각이 가까워도 펜으로 보지 않는다(손바닥)', () => {
  const { stylus } = load('android', 'pen', () => true)
  stylus.setPenPointerActive(0, true)
  assert.equal(stylus.touchKind({ identifier: 1, timestamp: 500 }), 'unknown')
})
