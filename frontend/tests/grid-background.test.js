import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import * as React from 'react'
import { colorTemplateAst, colorTemplateXml } from '../src/editor/templates/appearance.js'
import * as planners from '../src/editor/templates/planners.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const paper = (width, height) => ({ tag: 'svg', children: [
  React.createElement('rect', { key: 'paper', width, height, fill: '#ffffff' }),
  React.createElement('g', { key: 'ink', fill: '#292929' }, React.createElement('path', { d: 'M0 0H10' })),
  React.createElement('rect', { key: 'label', width: 20, height: 20, fill: '#ffffff' }),
] })
for (const [width, height] of [[1024, 768], [768, 1024]]) test(`${width}×${height}에서 종이 바탕만 투명하게 분리하고 글씨·캐시·출력은 유지한다`, () => {
  const ast = paper(width, height), before = JSON.stringify(ast)
  const styled = colorTemplateAst(ast, { backgroundColor: '#FFF8E7', layoutColor: '#33476B' }, { transparentPaper: true })
  assert.equal(styled.children[0].props.fill, 'none')
  assert.equal(styled.children[1].props.fill, '#33476b')
  assert.equal(styled.children[2].props.fill, '#ffffff', '속지 내용의 흰 도형은 제거하지 않는다')
  assert.equal(JSON.stringify(ast), before)
  assert.equal(colorTemplateAst(ast), ast, '가이드 없는 기본 표시는 원본 캐시를 재사용한다')
  assert.equal(colorTemplateAst(ast, { backgroundColor: '#FFF8E7' }).children[0].props.fill, '#FFF8E7')
  const xml = `<svg><rect width="${width}" height="${height}" fill="#ffffff"/><path fill="#292929"/></svg>`
  assert.match(colorTemplateXml(xml, { backgroundColor: '#FFF8E7' }), /fill="#FFF8E7"/)
  assert.doesNotMatch(colorTemplateXml(xml), /fill="none"/)
})

const source = readFileSync(new URL('../src/editor/components/PageBackground.js', import.meta.url), 'utf8')
const { code } = expo('@babel/core').transformSync(source + '\nexport { BackgroundAttempt }', {
  configFile: false, babelrc: false,
  plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
})
function fixture() {
  const ast = paper(1024, 768)
  const module = { exports: {} }
  const load = id => {
    if (id === 'react') return { ...React, useMemo: fn => fn(), useEffect() {}, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useRef: current => ({ current }) }
    if (id === 'react-native') return { Pressable: 'pressable', Text: 'text', View: 'view', StyleSheet: { create: v => v, absoluteFill: {} } }
    if (id === 'react-native-svg') return { SvgAst: 'svg-ast', SvgXml: 'svg-xml', parse: () => null }
    if (id.endsWith('/planners.js')) return planners
    if (id.endsWith('/catalog.js')) return { templateReference: page => page.backgroundAssetId ? { backgroundAssetId: page.backgroundAssetId } : null }
    if (id.endsWith('/loadTemplate')) return { peekTemplateAst: () => ast }
    if (id.endsWith('/appearance.js')) return { colorTemplateAst, normalizePaperAppearance: a => ({ backgroundColor: a?.backgroundColor ?? '#FFFFFF', layoutColor: '#292929' }) }
    if (id.endsWith('/pageGeometry.js')) return { pageSize: () => ({ width: 1024, height: 768 }) }
    if (id.endsWith('/fontScope')) return { KeepFont: 'keep-font' } // 속지는 정해진 글꼴 구역 안에서 그린다
    if (id.endsWith('/paperFont.js')) return { swapPaperFont: xml => xml, paperPrintsText: () => false } // 속지 글꼴 바꾸기는 paper-font.test.js 가 본다
    if (id.endsWith('/useTextFont')) return { useTextFont: () => '' } // 글꼴 불러오기는 text-font-styles.test.js 가 본다
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return { render: module.exports.BackgroundAttempt, ast }
}

test('실제 배경 컴포넌트에서 가이드가 바탕 위·속지 SVG 아래에 있고 출력 XML에는 들어가지 않는다', () => {
  const f = fixture(), guide = React.createElement('guide'), page = { id: 'p', backgroundAssetId: 'monthly' }
  const tree = f.render({ page, zoom: 0.75, underlay: guide })
  assert.equal(tree.props.style[1].backgroundColor, '#FFFFFF')
  const [underlay, svgLayer] = tree.props.children
  assert.equal(underlay, guide)
  const renderedSvg = svgLayer.props.children.props.children
  assert.equal(renderedSvg.props.ast.children[0].props.fill, 'none')
  assert.equal(f.ast.children[0].props.fill, '#ffffff')
  const output = f.render({ page, zoom: 1, underlay: guide, preparedXml: '<svg/>' })
  assert.equal(output.props.children[0], null)
  assert.equal(output.props.children[1].props.children.props.children.props.xml, '<svg/>')
})

test('빈 속지에서도 바탕색과 가이드를 함께 유지하고 가이드를 끄면 기존 AST를 재사용한다', () => {
  const f = fixture(), guide = React.createElement('guide')
  const blank = f.render({ page: { id: 'blank', paperAppearance: { backgroundColor: '#FFF8E7' } }, zoom: 1, underlay: guide })
  assert.equal(blank.props.style[1].backgroundColor, '#FFF8E7')
  assert.equal(blank.props.children, guide)
  const plain = f.render({ page: { id: 'p', backgroundAssetId: 'monthly' }, zoom: 1 })
  assert.equal(plain.props.children[1].props.children.props.children.props.ast, f.ast)
})
