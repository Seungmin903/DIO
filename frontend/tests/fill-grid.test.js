import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/shared/useFillGrid.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
// 훅을 한 번 재고 다시 부르는 작은 하네스: useState 는 값 하나, useCallback 은 그대로
function grid(options, width) {
  let state = 0
  const react = { useState: () => [state, next => { state = typeof next === 'function' ? next(state) : next }], useCallback: fn => fn }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => (id === 'react' ? react : {}), module, module.exports)
  module.exports.default(options).onLayout({ nativeEvent: { layout: { width } } })
  return module.exports.default(options)
}

test('재기 전에는 최소 열 수와 칸 크기 그대로 그린다', () => {
  const before = grid({ cell: 36, gap: 12, minColumns: 1, maxColumns: 7 }, 0)
  assert.equal(before.columns, 1); assert.equal(before.cellWidth, 36); assert.equal(before.spreadGap, 12)
})

test('폭에 들어가는 열 수를 두고 남는 폭을 칸에 나눈다(최대 7칸)', () => {
  const g = grid({ cell: 36, gap: 12, maxColumns: 7 }, 324)
  assert.equal(g.columns, 7)
  assert.ok(g.cellWidth > 35.9 && g.cellWidth <= 36)
  const wide = grid({ cell: 36, gap: 12, maxColumns: 7 }, 400)
  assert.equal(wide.columns, 7)
  assert.ok(wide.cellWidth > 36 && wide.cellWidth * 7 + 12 * 6 <= 400)
})

test('고정 크기 칸의 사이 간격은 잰 폭보다 0.5 작게 계산해 끝 칸이 다음 줄로 넘어가지 않는다', () => {
  // 폭 180 에 칸 36 × 4 = 144, 남는 36 을 세 틈에 나누면 12. 픽셀 반올림 여유 0.5 를 빼 11.83 이 된다
  const g = grid({ cell: 36, gap: 12, maxColumns: 4 }, 180)
  assert.equal(g.columns, 4)
  assert.equal(g.spreadGap, 11.83)
  assert.ok(36 * 4 + g.spreadGap * 3 < 180)
  // 열이 하나면 간격은 그대로, 폭이 모자라도 음수가 되지 않는다
  assert.equal(grid({ cell: 36, gap: 12, maxColumns: 1 }, 100).spreadGap, 12)
  assert.equal(grid({ cell: 36, gap: 12, minColumns: 4, maxColumns: 4 }, 100).spreadGap, 0)
})

test('잰 폭이 반올림으로 실제보다 커도 칸 합이 실제 폭을 넘지 않아 마지막 칸이 다음 줄로 밀리지 않는다', () => {
  const g = grid({ cell: 164, gap: 14, minColumns: 2 }, 356)
  assert.equal(g.columns, 2)
  assert.ok(g.cellWidth * 2 + 14 <= 355.5)
})
