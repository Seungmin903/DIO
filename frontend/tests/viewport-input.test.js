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
function fixture(stage, hand) {
  const commits = [], module = { exports: {} }
  const load = id => {
    if (id === 'react') return { useRef: current => ({ current }), useState: value => [value, () => {}], useEffect() {} }
    if (id === 'react-native') return { Platform: { OS: 'ios', select: v => v.default }, View: 'view', Text: 'text', StyleSheet: { create: v => v } }
    if (id.endsWith('/theme')) return { colors: {}, shadow: {} }
    if (id.endsWith('/stylus')) return { touchKind: () => 'touch', notePointerDown() {}, notePointerUp() {} }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const zoom = Math.min((stage.width - 56) / 1188, (stage.height - 160) / 840)
  const tree = module.exports.default({ scale: 1, zoom, offset: { x: 100, y: 100 }, dragToPan: hand,
    onView: v => commits.push(v),
    resolvePan: (from, dx, dy) => ({ ...from, ...panView(from, dx, dy, zoom, stage, 1188, 840, padding) }),
    resolveZoom: (scale, point, screen) => ({ scale, zoom: zoom * scale,
      ...clampOffset({ x: screen.x - point.x * zoom * scale, y: screen.y - point.y * zoom * scale }, zoom * scale, stage, 1188, 840) }),
  })
  const event = i => {
    const a = { pageX: 100 + i * 3, pageY: 200 - i * 2 }
    return { nativeEvent: { ...a, touches: hand ? [a] : [a, { pageX: a.pageX + 40, pageY: a.pageY }] } }
  }
  return { commits, run() {
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
