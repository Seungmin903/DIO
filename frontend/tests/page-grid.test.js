import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as grid from '../src/editor/utils/pageGrid.js'

test('페이지 격자를 끄면 기존 화면 가이드를 그대로 사용한다', () => {
  const guides = Object.freeze({ grid: 'lines', spacing: 'wide', center: true })
  assert.equal(grid.pageGridGuides({ gridVisible: false }, guides), guides)
})
test('사용자가 켠 화면 격자는 페이지 격자보다 우선하고 설정을 변경하지 않는다', () => {
  for (const mode of ['lines', 'dots']) {
    const guides = Object.freeze({ grid: mode, spacing: 'wide', gridColor: '#112233', margin: true })
    assert.equal(grid.pageGridGuides({ gridVisible: true, gridColor: '#445566' }, guides), guides)
  }
})
test('화면 격자가 꺼져 있으면 저장한 페이지 모눈을 표시하고 보조선을 유지한다', () => {
  const guides = Object.freeze({ grid: 'none', spacing: 'narrow', thirds: true })
  assert.deepEqual(grid.pageGridGuides({ gridVisible: true, gridColor: '#AAbb12' }, guides), { ...guides, grid: 'lines', gridColor: '#AAbb12' })
  assert.equal(guides.grid, 'none')
})
test('간격 미지정·잘못된 간격은 보통 32로, 잘못된 색은 기본색으로 표시한다', () => {
  for (const value of [undefined, null, 'unknown']) {
    const guides = grid.pageGridGuides({ gridVisible: true, gridColor: 'red' }, { grid: 'none', spacing: value })
    assert.equal(guides.spacing, 'normal'); assert.equal(grid.gridSpacing(value), 32)
    assert.equal(guides.gridColor, '#DCE5F1')
  }
  for (const value of [undefined, null, '#fff', '#12345678', 123456, 'red']) assert.equal(grid.gridColor(value), '#DCE5F1')
})

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/canvas/GridOverlay.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(id => {
  if (id === 'react') return { memo: fn => fn }
  if (id === 'react-native') return { StyleSheet: { absoluteFill: {} } }
  if (id === 'react-native-svg') return { __esModule: true, default: 'svg', Defs: 'defs', Line: 'line', Path: 'path', Pattern: 'pattern', Rect: 'rect' }
  if (id.endsWith('/svgId')) return { useSvgId: () => 'grid-test' }
  if (id.endsWith('/pageGrid.js')) return grid
  return require(id)
}, module, module.exports)
const Overlay = module.exports.default
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)]
test('실제 GridOverlay는 유효한 색과 지정한 간격으로 모눈을 그린다', () => {
  const tree = nodes(Overlay({ guides: { grid: 'lines', spacing: 'wide', gridColor: '#abcdef' }, layer: 'grid', width: 768, height: 1024, zoom: 2 }))
  assert.deepEqual(tree.filter(n => n.type === 'path').map(n => n.props.stroke), ['#abcdef', '#abcdef'])
  const patterns = tree.filter(n => n.type === 'pattern')
  assert.equal(patterns[0].props.width, 128); assert.equal(patterns[1].props.height, 128)
})
test('실제 GridOverlay도 누락된 간격과 잘못된 색을 기본값으로 처리한다', () => {
  const tree = nodes(Overlay({ guides: { grid: 'lines', gridColor: 'red' }, layer: 'grid', width: 768, height: 1024, zoom: 1 }))
  assert.deepEqual(tree.filter(n => n.type === 'path').map(n => n.props.stroke), ['#DCE5F1', '#DCE5F1'])
  assert.equal(tree.find(n => n.type === 'pattern').props.width, 32)
  assert.equal(Overlay({ guides: { grid: 'none' }, layer: 'grid', width: 768, height: 1024, zoom: 1 }), null)
})
