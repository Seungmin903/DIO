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
// error: 두 번째 useState(실패 상태)에 넣을 오류, cached: 속지 캐시(peekTemplateAst)가 있는지(f.cache.cached 로 뒤에 바꿀 수 있다)
// f.effects: 모아 둔 useEffect, f.sets: useState 설정 호출 [index, value], f.signal.listener: 캐시 채움 신호 구독자
function fixture({ error = null, cached = true } = {}) {
  const ast = paper(1024, 768)
  const module = { exports: {} }
  let stateCalls = 0, memoCalls = 0, plannerCalls = 0, overlayCalls = 0
  const memoValues = [], memoDependencies = []
  const effects = [], sets = [], cache = { cached }, signal = { listener: null }
  const load = id => {
    if (id === 'react') return { ...React, useMemo: (fn, deps = []) => { const index = memoCalls++, previous = memoDependencies[index]; if (previous && previous.length === deps.length && previous.every((value, i) => Object.is(value, deps[i]))) return memoValues[index]; memoDependencies[index] = deps; return memoValues[index] = fn() }, useEffect: fn => { effects.push(fn) }, useState: initial => { const index = stateCalls++; const set = value => sets.push([index, value]); if (index === 1 && error) return [error, set]; return [typeof initial === 'function' ? initial() : initial, set] }, useRef: current => ({ current }) }
    if (id.endsWith('/templateLoadedSignal.js')) return { subscribeTemplateLoaded: listener => { signal.listener = listener; return () => { signal.listener = null } } }
    if (id.endsWith('/tastingGeometry.js')) return { isTastingId: () => false }
    if (id.endsWith('/tastingElements.js')) return { tastingElementValue: () => null }
    if (id === 'react-native') return { Pressable: 'pressable', Text: 'text', View: 'view', StyleSheet: { create: v => v, absoluteFill: {} } }
    if (id === 'react-native-svg') return { SvgAst: 'svg-ast', SvgXml: 'svg-xml', parse: () => null }
    if (id.endsWith('/planners.js')) return { ...planners, plannerFor: assetId => { plannerCalls++; return assetId === 'monthly' ? { titles: () => null, startHour: () => 6, baseSvg: () => '<svg/>', overlaySvg: () => { overlayCalls++; return '<svg/>' } } : planners.plannerFor(assetId) } }
    if (id.endsWith('/catalog.js')) return { templateReference: page => page.backgroundAssetId ? { backgroundAssetId: page.backgroundAssetId } : null }
    if (id.endsWith('/loadTemplate')) return { peekTemplateAst: () => cache.cached ? ast : null, loadTemplateAst: () => new Promise(() => {}) }
    if (id.endsWith('/appearance.js')) return { colorTemplateAst, normalizePaperAppearance: a => ({ backgroundColor: a?.backgroundColor ?? '#FFFFFF', layoutColor: '#292929' }) }
    if (id.endsWith('/pageGeometry.js')) return { pageSize: () => ({ width: 1024, height: 768 }) }
    if (id.endsWith('/shared/theme')) return { colors: {} }
    if (id.endsWith('/fontScope')) return { KeepFont: 'keep-font' } // 속지는 정해진 글꼴 구역 안에서 그린다
    if (id.endsWith('/paperFont.js')) return { swapPaperFont: xml => xml } // 속지 글꼴 바꾸기는 paper-font.test.js 가 본다
    if (id.endsWith('/useTextFont')) return { useTextFont: () => '' } // 글꼴 불러오기 자체는 text-font-styles.test.js 가 본다(여기서는 상태를 문자열로 흉내 낸다)
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  const render = props => { stateCalls = 0; memoCalls = 0; effects.length = 0; return module.exports.BackgroundAttempt(props) }
  return { render, plannerCalls: () => plannerCalls, overlayCalls: () => overlayCalls, backgroundKey: module.exports.backgroundKey, fontPhase: module.exports.fontPhase, ast, effects, sets, cache, signal }
}
const flat = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(flat)]

test('S15P31F106-724: 축소 표시(썸네일)는 속지 로딩에 실패해도 문구 · 재시도 버튼 없이 빈 종이로 두고, 캐시가 채워지면 스스로 복구한다', () => {
  const error = new Error('속지를 불러오지 못했어요. 다시 시도해 주세요.'), page = { id: 'p', backgroundAssetId: 'monthly' }
  const retry = () => {}
  // 본문 캔버스: 실패 안내와 다시 시도 버튼(한 곳)
  const canvas = flat(fixture({ error, cached: false }).render({ page, zoom: 1, onRetry: retry }))
  assert.ok(canvas.some(node => node.props?.accessibilityRole === 'alert'))
  assert.ok(canvas.some(node => node.type === 'pressable' && node.props.accessibilityLabel === '속지 다시 불러오기'))
  assert.equal(canvas.some(node => node.type === 'svg-ast' || node.props?.ast), false, '실패했으니 속지는 그리지 않는다')
  // 썸네일(compact): 안내 · 버튼 없음(페이지 선택과 경쟁하지 않는다) · 빈 종이
  const thumb = flat(fixture({ error, cached: false }).render({ page, zoom: 0.2, compact: true, onRetry: retry }))
  assert.equal(thumb.some(node => node.props?.accessibilityRole === 'alert'), false)
  assert.equal(thumb.some(node => node.type === 'pressable'), false)
  assert.equal(thumb.some(node => node.type === 'text'), false, '짧은 문구도 두지 않는다')
  assert.equal(thumb[0].props.style[1].backgroundColor, '#FFFFFF', '종이색 바탕은 남는다')
  // 본문의 다시 시도로 캐시가 채워진 뒤: 같은 실패 상태라도 썸네일은 캐시로 그린다
  const healed = fixture({ error, cached: true }).render({ page, zoom: 0.2, compact: true, onRetry: retry })
  assert.ok(flat(healed).some(node => node.props?.ast && node.props.ast.children?.length === 3), '캐시 AST 로 속지를 그린다')
  assert.equal(flat(healed).some(node => node.type === 'pressable'), false)
})

test('S15P31F106-724: 실패한 썸네일은 캐시 채움 신호를 구독해 다시 그려지지 않아도 실패 상태를 풀고 캐시로 복구한다', () => {
  const error = new Error('속지를 불러오지 못했어요.'), page = { id: 'p', backgroundAssetId: 'monthly' }
  const f = fixture({ error, cached: false })
  f.render({ page, zoom: 0.2, compact: true })
  f.effects.forEach(fn => fn())
  assert.ok(f.signal.listener, '실패한 축소 표시는 캐시 채움 신호를 구독한다')
  f.signal.listener('monthly')
  assert.deepEqual(f.sets, [], '아직 캐시가 없으면 그대로 둔다')
  f.cache.cached = true
  f.signal.listener('monthly')
  assert.deepEqual(f.sets, [[0, { ast: f.ast }], [1, null]], '캐시가 채워지면 속지를 넣고 실패 상태를 푼다')
  // 본문 캔버스(compact 아님) · 실패 없음 · 출력용 XML 경로는 구독하지 않는다
  for (const props of [{ page, zoom: 1 }, { page, zoom: 0.2, compact: true, preparedXml: '<svg/>' }]) {
    const g = fixture({ error, cached: false }); g.render(props); g.effects.forEach(fn => fn()); assert.equal(g.signal.listener, null, JSON.stringify(Object.keys(props)))
  }
  const h = fixture({ cached: false }); h.render({ page, zoom: 0.2, compact: true }); h.effects.forEach(fn => fn()); assert.equal(h.signal.listener, null, '실패하지 않았으면 구독하지 않는다')
})

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

test('속지에서 앱 글꼴이 필요한 것은 데일리 플래너가 비추는 글(마루부리)뿐이다', () => {
  for (const id of ['day-planner-landscape', 'day-planner-portrait']) assert.deepEqual(planners.paperDeviceFontIds(id), ['maruburi'])
  for (const id of ['monthly', 'study-planner-landscape', undefined, null]) assert.deepEqual(planners.paperDeviceFontIds(id), [], String(id))
})

test('글꼴을 불러오면 속지를 한 번만 다시 그린다(Regular · Bold 가 따로 도착해도, 처음부터 불러와 있으면 다시 그리지 않는다)', () => {
  const f = fixture(), page = { id: 'p', backgroundAssetId: 'day-planner-landscape', paperAppearance: { font: 'nanum-gothic' } }
  const key = state => f.backgroundKey(page, f.fontPhase(state), 0)
  const loading = 'MaruBuri:loading|MaruBuriBold:loading', half = 'MaruBuri:loaded|MaruBuriBold:loading'
  assert.equal(f.fontPhase(''), '') // 쓰는 글꼴이 없는 속지
  assert.equal(key(loading), key(half)) // Regular 만 도착해서는 다시 그리지 않는다
  assert.notEqual(key(half), key('MaruBuri:loaded|MaruBuriBold:loaded')) // 모두 끝나면 한 번 다시 그린다
  assert.equal(key('MaruBuri:loaded|MaruBuriBold:loaded'), key('MaruBuri:loaded|MaruBuriBold:error')) // 실패도 끝난 것이다
  assert.equal(key('MaruBuri:error|MaruBuriBold:loaded'), key('MaruBuri:loaded|MaruBuriBold:loaded'))
  assert.notEqual(f.backgroundKey(page, 'settled', 0), f.backgroundKey(page, 'settled', 1)) // 다시 시도
  assert.notEqual(f.backgroundKey(page, '', 0), f.backgroundKey(page, 'loading', 0))
})

test('같은 속지의 다시 렌더링은 플래너 API를 재생성하지 않고 preparedXml 전환은 API를 비운다', () => {
  const f = fixture(), page = { id: 'p', backgroundAssetId: 'monthly' }, props = { page, zoom: 1 }
  f.render(props); f.render(props)
  assert.equal(f.plannerCalls(), 1, '안정된 API 참조로 반복 SVG 파싱을 막는다')
  f.render({ ...props, preparedXml: '<svg/>' })
  assert.equal(f.plannerCalls(), 1, '출력용 XML 경로에서는 플래너 API를 만들지 않는다')
  f.render(props)
  assert.equal(f.plannerCalls(), 2, '편집 화면 복귀 시 API를 다시 만든다')
})

test('테이스팅이 아닌 플래너는 요소만 바뀌어서는 덮개 SVG 를 다시 만들지 않는다(끌기 · 편집 매 프레임 파싱 방지, MR !503 리뷰)', () => {
  const f = fixture(), planner = { fills: {} }, page = { id: 'p', backgroundAssetId: 'monthly', planner, objects: [] }
  f.render({ page, zoom: 1 })
  assert.equal(f.overlayCalls(), 1)
  f.render({ page: { ...page, objects: [{ id: 'a', type: 'text' }] }, zoom: 1 })
  assert.equal(f.overlayCalls(), 1, '요소가 바뀌어도 기록 · 할 일 글이 같으면 그대로')
  f.render({ page: { ...page, planner: { fills: { a: '#111111' } } }, zoom: 1 })
  assert.equal(f.overlayCalls(), 2, '기록이 바뀌면 다시 만든다')
})
