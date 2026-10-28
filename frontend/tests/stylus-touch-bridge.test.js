import test from 'node:test'
import assert from 'node:assert/strict'
import { installStylusTouchBridge } from '../src/editor/utils/stylusTouchBridge.js'
import { createPenPointerInput } from '../src/editor/utils/penPointerInput.js'
function fixture() {
  const globals = new Map(), listeners = new Map(), log = [], reports = []
  const pointer = createPenPointerInput(() => ({ onStart: e => log.push(['start', e]), onMove() {}, onEnd: e => log.push(['end', e]) }))
  const node = { ownerDocument: { defaultView: { addEventListener: (n,f) => globals.set(n,f), removeEventListener: n => globals.delete(n), __DIO_PEN_QA_REPORT__: r => reports.push(r) } },
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 500, height: 500 }),
    addEventListener: (n, f) => listeners.set(n, f), removeEventListener: n => listeners.delete(n) }
  const cleanup = installStylusTouchBridge(node, pointer)
  let time = 0
  const touch = (type, touchType = 'stylus') => {
    let prevented = false
    listeners.get(type)({ type, cancelable: true, timeStamp: ++time,
      changedTouches: [{ identifier: 1, touchType, clientX: 10 + time, clientY: 20, force: .7 }],
      preventDefault: () => { prevented = true } })
    return prevented
  }
  const pen = type => pointer.handlers[type]({ currentTarget: node, nativeEvent: { pointerId: 9, pointerType: 'pen', clientX: 10, clientY: 20, pressure: .5, timeStamp: ++time } })
  return { touch, pen, log, reports, cleanup, listeners, globals }
}
test('missing PointerEvent: rapid stylus contacts each finish exactly one pressure stroke', () => {
  const f = fixture()
  for (let i = 0; i < 20; i++) { assert.equal(f.touch('touchstart'), true); f.touch('touchmove'); f.touch('touchend') }
  assert.equal(f.log.filter(e => e[0] === 'start').length, 20)
  assert.equal(f.log.filter(e => e[0] === 'end').length, 20)
  assert.equal(f.log[0][1].pressure, .7)
  assert.equal(f.log[0][1].inputChannel, 'stylus-touch')
})
test('PointerEvent before or after stylus touch cannot duplicate ownership', () => {
  for (const pointerFirst of [true, false]) {
    const f = fixture()
    if (pointerFirst) f.pen('onPointerDown')
    f.touch('touchstart')
    if (!pointerFirst) f.pen('onPointerDown')
    f.touch('touchend'); f.pen('onPointerUp')
    assert.deepEqual(f.log.map(e => e[0]), ['start', 'end'])
  }
})
test('finger gestures pass through and cleanup cancels only an owned fallback', () => {
  const f = fixture()
  assert.equal(f.touch('touchstart', 'direct'), false)
  assert.equal(f.touch('touchmove', 'direct'), false)
  assert.equal(f.log.length, 0)
  f.touch('touchstart'); f.cleanup()
  assert.equal(f.log.at(-1)[1].cancelled, true)
  assert.equal(f.listeners.size, 0)
})


test('lost stylus touch end recovers on blur and accepts the next contact', () => {
  const f = fixture()
  f.touch('touchstart'); f.globals.get('blur')()
  assert.equal(f.log.at(-1)[1].cancelled, true)
  f.touch('touchstart'); f.touch('touchend')
  assert.deepEqual(f.log.map(e => e[0]), ['start', 'end', 'start', 'end'])
  f.cleanup(); assert.equal(f.globals.size, 0)
})
test('global pointerup releases only its matching owner and does not duplicate end', () => {
  const f = fixture()
  f.pen('onPointerDown')
  f.globals.get('pointerup')({ pointerId: 99, pointerType: 'touch' })
  assert.equal(f.log.length, 1)
  f.globals.get('pointerup')({ pointerId: 9, pointerType: 'pen', clientX: 30, clientY: 20, pressure: 0, timeStamp: 5 })
  f.pen('onPointerUp')
  assert.deepEqual(f.log.map(e => e[0]), ['start', 'end'])
})
test('stylus touch ending outside the input is finalized once by the window listener', () => {
  const f = fixture(); f.touch('touchstart')
  f.globals.get('touchend')({ type: 'touchend', timeStamp: 4, cancelable: false,
    changedTouches: [{ identifier: 1, touchType: 'stylus', clientX: 30, clientY: 20, force: 0 }] })
  f.touch('touchend')
  assert.deepEqual(f.log.map(e => e[0]), ['start', 'end'])
})
