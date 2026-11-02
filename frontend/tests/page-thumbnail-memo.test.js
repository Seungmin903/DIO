import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const source = readFileSync(new URL('../src/editor/components/panels/PageList.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('const PageItem = memo('), source.indexOf('function PageDragPreview('))
const { code } = expo('@babel/core').transformSync(`${body}\nmodule.exports = PageItem`, {
  configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

test('지연된 썸네일과 재열기 작업 큐 및 패널 폭 변경은 목록 행을 갱신한다', () => {
  const module = { exports: {} }
  new Function('require', 'module', 'exports', 'memo', code)(require, module, module.exports, (component, compare) => ({ compare }))
  const compare = module.exports.compare, queue = {}, page = {}
  const previous = { page, showContent: false, thumbnailWork: queue, thumbWidth: 128 }
  assert.equal(compare(previous, { ...previous }), true)
  assert.equal(compare(previous, { ...previous, showContent: true }), false)
  assert.equal(compare(previous, { ...previous, thumbnailWork: {} }), false)
  assert.equal(compare(previous, { ...previous, thumbWidth: 144 }), false)
})
