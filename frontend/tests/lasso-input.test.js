import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as geometry from '../src/editor/utils/lassoGeometry.js'

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/LassoInput.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

function fixture(shape = 'freeform', zoom = 1, mode = 'replace', selectedIds = []) {
  const frames = new Map(), values = [], commits = []
  let nextFrame = 0, calculations = 0
  const module = { exports: {} }
  const load = (id) => {
    if (id === 'react') return { useRef: (current) => ({ current }), useState: (value) => [value, (next) => values.push(next)], useLayoutEffect() {} }
    if (id === 'react-native') return { View: 'view', Keyboard: { dismiss() {} }, Platform: { OS: 'ios' }, StyleSheet: { create: (v) => v } }
    if (id === 'react-native-svg') return { __esModule: true, default: 'svg', Path: 'path', Polygon: 'polygon' }
    if (id.endsWith('/shared/theme')) return { colors: {} }
    if (id.endsWith('/common')) return { clamp: (n, min, max) => Math.min(max, Math.max(min, n)) }
    if (id.endsWith('/lassoGeometry.js')) return { ...geometry, hasLassoArea: (polygon) => { calculations += 1; return geometry.hasLassoArea(polygon) } }
    return require(id)
  }
  new Function('require', 'module', 'exports', 'requestAnimationFrame', 'cancelAnimationFrame', code)(load, module, module.exports,
    (callback) => { const id = ++nextFrame; frames.set(id, callback); return id }, (id) => frames.delete(id))
  const tree = module.exports.default({ shape, mode, zoom, selectedIds, pageWidth: 1188, pageHeight: 840,
    objects: [
      { id: 'inside', x: 20, y: 20, w: 5, h: 5 },
      { id: 'box-only', x: 90, y: 90, w: 5, h: 5 },
    ], onCommit: (ids) => commits.push(ids),
  })
  const h = tree.props.children.props
  const event = (x, y) => ({ nativeEvent: { identifier: 7, locationX: x * zoom, locationY: y * zoom,
    pageX: 200 + x * zoom, pageY: 300 + y * zoom, touches: [{ identifier: 7 }] } })
  return {
    commits, calculations: () => calculations,
    draft: () => values.filter((v) => v?.polygon).at(-1),
    start: (x, y) => h.onResponderGrant(event(x, y)),
    move: (x, y) => h.onResponderMove(event(x, y)),
    end: (x, y) => h.onResponderRelease({ nativeEvent: { touches: [], changedTouches: [event(x, y).nativeEvent] } }),
    cancel: () => h.onResponderTerminate(),
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((cb) => cb()) },
  }
}

test('자유형은 네모 외곽이 아닌 실제 삼각 경로로 선택하고 마지막 해제 좌표를 보존한다', () => {
  for (const zoom of [0.5, 1, 2]) {
    const f = fixture('freeform', zoom)
    f.start(10, 10); f.move(110, 10); f.end(10, 110)
    assert.deepEqual(f.commits, [['inside']])
    f.frame()
    assert.equal(f.commits.length, 1)
    const rectangle = fixture('rectangle', zoom)
    rectangle.start(10, 10); rectangle.end(110, 110)
    assert.deepEqual(rectangle.commits, [['inside', 'box-only']])
  }
})

test('여러 자유형 입력을 한 프레임으로 합쳐도 수집한 경로를 모두 유지한다', () => {
  const f = fixture()
  f.start(300, 200)
  for (let i = 1; i <= 100; i += 1) {
    const angle = i * Math.PI * 2 / 100
    f.move(200 + Math.cos(angle) * 100, 200 + Math.sin(angle) * 100)
  }
  assert.equal(f.calculations(), 0)
  f.frame()
  assert.equal(f.calculations(), 1)
  assert.equal(f.draft().polygon.length, 101)
  f.move(310, 200)
  assert.equal(f.draft().polygon.length, 101, '이미 표시한 경로는 다음 좌표 추가로 변하지 않는다')
})

test('프레임 전 취소는 선택을 확정하거나 대기 중인 경로를 다시 표시하지 않는다', () => {
  const f = fixture()
  f.start(10, 10); f.move(110, 10); f.cancel(); f.frame()
  assert.deepEqual(f.commits, [])
  assert.equal(f.calculations(), 0)
})
