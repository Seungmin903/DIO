import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/canvas/ObjectView.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('function TextContent('), source.indexOf('/* ---------- 꾸미기 옵션'))
const { code } = expo('@babel/core').transformSync(`${body}\nmodule.exports = TextContent`, {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
const makeText = new Function('require', 'module', 'Text', 'View', 'Platform', 'DRAWN_DECORATION', 'useState', 'textSettings', 'textStyle', 'richTextSegments', 'segmentTextStyle', code)

test('페이지 준비 후 텍스트 뷰가 새로 배치되어 크기가 같아도 측정 콜백이 연결된다', () => {
  const module = { exports: {} }, measured = []
  makeText(require, module, 'Text', 'View', { OS: 'ios' }, false, value => [value, () => {}],
    () => ({ lineSpacing: 1 }), () => ({ fontSize: 12 }), text => [{ text }], () => ({}))
  const object = { id: 'text-1', w: 100, text: '같은 높이' }
  const render = onTextMeasure => module.exports({ object, width: 100, height: 40, zoom: 2, onTextMeasure })
  const loading = render(null)
  const ready = render((id, height) => measured.push({ id, height }))
  assert.equal(loading.key, 'unmeasured')
  assert.equal(loading.props.onLayout, undefined)
  assert.equal(ready.key, 'measured')
  ready.props.onLayout({ nativeEvent: { layout: { height: 40 } } })
  assert.deepEqual(measured, [{ id: 'text-1', height: 20 }])
  assert.equal(render(() => {}).key, ready.key) // 콜백 참조만 바뀌면 다시 마운트하지 않는다.
})
