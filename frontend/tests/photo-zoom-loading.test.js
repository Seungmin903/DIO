import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/MediaImage.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source + '\nexports.ZoomPhoto = ZoomPhoto', {
  configFile: false, babelrc: false, plugins: [
    [expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }],
    expo.resolve('@babel/plugin-transform-modules-commonjs'),
  ],
})

function fixture() {
  let cursor = 0
  const states = [], dependencies = [], cleanups = [], queued = [], timers = new Map()
  const motion = { moving: false, fitZoom: 1 }
  let timerId = 0, released = 0
  const react = {
    useContext: () => motion,
    useRef: value => { const index = cursor++; return states[index] ??= { current: value } },
    useState: initial => {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
    },
    useEffect: (effect, deps) => {
      const index = cursor++
      if (!dependencies[index] || deps.some((value, i) => !Object.is(value, dependencies[index][i]))) {
        cleanups[index]?.()
        dependencies[index] = deps
        cleanups[index] = effect()
      }
    },
  }
  const jsx = (type, props) => ({ type, props })
  const mocks = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Image: 'image', View: 'view', StyleSheet: { absoluteFill: {} } },
    'expo-image': {}, './viewportMotion': {},
    '../../utils/photoDecodeQueue.js': { createPhotoDecodeQueue: () => start => {
      const task = { start, cancelled: false }
      queued.push(task)
      return () => { task.cancelled = true; released++ }
    } },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', code)(
    id => mocks[id], module, module.exports,
    (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id },
    id => timers.delete(id),
  )
  return {
    motion, queued,
    render(zoom) { cursor = 0; return module.exports.ZoomPhoto({ decodeZoom: zoom, style: {}, source: { uri: 'photo' } }) },
    fire(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay)
      assert.ok(entry, `timer ${delay}`)
      timers.delete(entry[0]); entry[1].fn()
    },
    get released() { return released },
    hasTimer(delay) { return [...timers.values()].some(timer => timer.delay === delay) },
    close() { cleanups.forEach(cleanup => cleanup?.()) },
  }
}

for (const outcome of ['load', 'error', 'timeout']) {
  test(`확대 사진 ${outcome} 후에도 기존 사진을 보존하고 대기열을 해제한다`, () => {
    const app = fixture()
    try {
      const original = app.render(1).props.children[0].props
      app.render(2); app.fire(160); app.queued[0].start()
      const waiting = app.render(2).props.children
      assert.equal(waiting.length, 2)
      assert.equal(waiting[0].props.style[1], false)
      if (outcome === 'timeout') app.fire(10000)
      else waiting[1].props[outcome === 'load' ? 'onLoad' : 'onError']({})
      const result = app.render(2).props.children
      assert.equal(result.length, 1)
      assert.equal(result[0].props.resizeMultiplier, outcome === 'load' ? 1.5 : original.resizeMultiplier)
      assert.ok(app.released > 0)
    } finally { app.close() }
  })
}

for (const failure of ['error', 'timeout']) {
  test(`확대 ${failure} 후에는 멈춘 상태에서 반복하지 않고 이동 후 같은 배율을 다시 시도한다`, () => {
    const app = fixture()
    try {
      app.render(1)
      app.render(2); app.fire(160); app.queued[0].start()
      const images = app.render(2).props.children
      if (failure === 'timeout') app.fire(10000)
      else images[1].props.onError({})
      assert.equal(app.render(2).props.children.length, 1)
      app.render(2)
      assert.equal(app.hasTimer(160), false)
      assert.equal(app.queued.length, 1)
      app.motion.moving = true; app.render(2)
      assert.equal(app.hasTimer(160), false)
      app.motion.moving = false; app.render(2)
      app.fire(160); app.queued[1].start()
      const retry = app.render(2).props.children
      assert.equal(retry.length, 2)
      retry[1].props.onLoad({})
      const result = app.render(2).props.children
      assert.equal(result.length, 1)
      assert.equal(result[0].props.resizeMultiplier, 1.5)
      assert.equal(app.hasTimer(160), false)
    } finally { app.close() }
  })
}

test('실패한 확대 배율을 벗어났다가 돌아오면 그 배율을 다시 시도한다', () => {
  const app = fixture()
  try {
    app.render(1)
    app.render(2); app.fire(160); app.queued[0].start(); app.render(2)
    app.fire(10000); app.render(2)
    app.render(3); app.render(2)
    app.fire(160)
    assert.equal(app.queued.length, 2)
    app.queued[1].start()
    assert.equal(app.render(2).props.children.length, 2)
  } finally { app.close() }
})
