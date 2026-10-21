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
function load(os = 'android') {
  const stylusModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/utils/stylus.js'))(
    (id) => (id === 'react-native' ? { Platform: { OS: os } } : require(id)), stylusModule, stylusModule.exports)
  const hookModule = { exports: {} }
  new Function('require', 'module', 'exports', compile('../src/editor/hooks/usePalmRejection.js'))((id) => {
    if (id === 'react') return { createContext: (value) => ({ value }), useRef: (current) => ({ current }), useLayoutEffect: (fn) => fn() }
    if (id.endsWith('/stylus')) return stylusModule.exports
    return require(id)
  }, hookModule, hookModule.exports)
  return { stylus: stylusModule.exports, usePalmRejectingPan: hookModule.exports.usePalmRejectingPan }
}

function setup(os) {
  const { stylus, usePalmRejectingPan } = load(os)
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
    stylus, log, pointer,
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
    move(id, x) {
      // 실제 이벤트처럼 매번 새 터치 객체를 만든다
      touches.set(id, { ...touches.get(id), pageX: x })
      responder.onResponderMove(event())
    },
    up(id) {
      touches.delete(id)
      if (touches.size) responder.onResponderEnd(event())
      else responder.onResponderRelease()
    },
  }
}

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

test('iOS: Apple Pencil(force > 0)이 보이면 손가락으로는 그리지 않는다', () => {
  const t = setup('ios')
  t.down(1, 20, { force: 0.5 })
  t.up(1)
  t.down(2, 30, { force: 0 })
  t.move(2, 60)
  assert.deepEqual(t.log.map((e) => e[0]), ['start', 'end'])
})
