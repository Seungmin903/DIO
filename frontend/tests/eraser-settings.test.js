import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as eraser from '../src/editor/utils/eraser.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/components/EraserSettings.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const module = { exports: {} }
new Function('require', 'module', 'exports', code)(id => {
  if (id === './controls/FadeScroll') return { __esModule: true, default: 'ScrollView' } // 그라데이션 래퍼는 ScrollView 로 대신 읽는다
  if (id === 'react-native') return { View: 'View', Text: 'Text', ScrollView: 'ScrollView' }
  if (id === './ToolPanel') return { Segmented: 'Segmented', ToolPanelHeader: 'Header', toolPanelStyles: {} }
  if (id === '../utils/eraser.js') return eraser
  if (id === './controls/Slider' || id === './ToolGuideAnimation') return { __esModule: true, default: id }
  return require(id)
}, module, module.exports)
const walk = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(walk)]

test('지우는 방식·지울 대상 두 줄과 크기 슬라이더가 독립된 선택 콜백을 쓴다', () => {
  const events = []
  const tree = module.exports.default({ size: 24, mode: 'area', target: 'pen',
    onChange: v => events.push(['size', v]), onModeChange: v => events.push(['mode', v]), onTargetChange: v => events.push(['target', v]) })
  const nodes = walk(tree), segments = nodes.filter(n => n.type === 'Segmented')
  assert.deepEqual(nodes.filter(n => n.type === 'Text').map(n => n.props.children), ['지우는 방식', '지울 대상', '크기'])
  assert.deepEqual(segments.map(n => n.props.items.map(i => i.label)), [['획 전체', '닿은 부분'], ['전체', '펜', '형광펜']])
  assert.equal(segments[0].props.selected('area'), true)
  assert.equal(segments[1].props.selected('pen'), true)
  segments[0].props.onPress('stroke'); segments[1].props.onPress('highlighter')
  assert.deepEqual(events, [['mode', 'stroke'], ['target', 'highlighter']])
})
