import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { inkRecordFrontIndex, inkRecordId, inkRecordLayout } from '../src/editor/templates/inkRecordLayout.js'
import * as planner from '../src/editor/utils/completedStrokePlan.js'
import * as geometry from '../src/editor/utils/pageGeometry.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const contexts = { TextMeasure: { Provider: 'measure' }, TextMeasureReady: { Provider: 'measure-ready' }, objectOpacity: object => object.opacity ?? 1, objectDrawOpacity: object => object.opacity ?? 1 }
function loadComponent(file, platform = 'ios', cacheOverride = null, packing = null, overTopIds = []) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/components/canvas/${file}.js`, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const cacheContext = {}
  const module = { exports: {} }, refs = []
  let cursor = 0
  const load = id => {
    if (id === 'react') return {
      memo: (component, compare) => Object.assign(component, { compare }),
      useRef: value => refs[cursor++] ??= { current: value }, useLayoutEffect: () => {},
      createContext: () => ({}), useContext: context => context === cacheContext ? cacheOverride : ({ moving: false, visible: null }),
    }
    if (id === 'react-native') return { Platform: { OS: platform }, PixelRatio: { get: () => 2 }, View: 'view', StyleSheet: { create: value => value } }
    if (id.endsWith('/completedStrokePlan.js')) return planner
    if (id.endsWith('/pageGeometry.js')) return geometry
    if (id.endsWith('/backdrop.js')) return { fitBackdropToPage: object => object }
    if (id.endsWith('/packingLayout.js')) return { packingLayout: () => packing }
    if (id === './PackingColorLayer') return { PackingColorLayer: 'packing-color', PackingFrontLayer: 'packing-front' }
    if (id === './InkRecordFrontLayer') return { InkRecordFrontLayer: 'ink-record-front' }
    // 자리 계산은 **진짜 모듈**을 쓴다(순수 계산이라 RN 의존이 없다) — 가짜를 두면 규칙이 어긋나도 모른다
    if (id.endsWith('/inkRecordLayout.js')) return require('../src/editor/templates/inkRecordLayout.js')
    if (id.endsWith('/coverBounds.js')) return require('../src/editor/utils/coverBounds.js')
    if (id === './WebStrokeCacheContext') return { WebStrokeCacheEnabled: cacheContext }
    // 잉크병 메모 덧그림 판별용. 이 검사에는 메모가 안 나오므로 늘 아니라고 답한다
    if (id.endsWith('/utils/editorShapes')) return { memoArtOf: art => overTopIds.includes(art) ? { overTop: true } : null }
    if (id.endsWith('/fontScope')) return { KeepFont: 'keep-font' }
    if (id === './ObjectView') return contexts
    if (id === './viewportMotion') return { ViewportMotion: {} }
    if (['./PageObject', '../PageBackground', './CompletedStrokeLayer', './WebStrokeCache'].includes(id)) return { __esModule: true, default: id }
    // 바탕 요소 판별(PDF 쪽 바탕)은 실제 모듈을 쓴다. 상대 경로는 소스 기준이라 테스트 위치에서 다시 푼다
    if (id.endsWith('/utils/backdrop.js')) return require('../src/editor/utils/backdrop.js')
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return { render(props) { cursor = 0; return module.exports.default(props) }, compare: module.exports.default.compare }
}

const drawingOf = rendered => rendered.props.children.find(child => child?.type === contexts.TextMeasure.Provider).props.children.props.children

const objects = Array.from({ length: 4 }, (_, i) => createStroke([{ x: 10, y: 20 }, { x: 200, y: 50 }], { id: `s${i}`, kind: 'highlighter' }))
const page = { id: 'p', canvasWidth: 1024, canvasHeight: 768, objects }
const INK_PAGE = inkRecordId('square', 'portrait')
// 병 윤곽은 **병을 가리는** 요소에만 자리를 내준다 — 검사에 쓸 '병 위' 자리
const BOTTLE = inkRecordLayout(INK_PAGE).cells[0].bottle
const onBottle = (over = {}) => ({ type: 'sticker', x: BOTTLE.x + 5, y: BOTTLE.y + 5, w: 40, h: 40, ...over })

test('완성 획 층은 네이티브 캐시와 별도 원점을 사용하며 터치를 받지 않는다', () => {
  const component = loadComponent('CompletedStrokeLayer')
  const layers = component.render({ objects, width: 1024, height: 768, zoom: 1, renderObject: () => null })
  const view = layers[0].type(layers[0].props)
  assert.equal(view.props.shouldRasterizeIOS, true)
  assert.equal(view.props.renderToHardwareTextureAndroid, true)
  assert.equal(view.props.pointerEvents, 'none')
  assert.equal(view.props.collapsable, false)
  const children = view.props.children.props.children
  children.forEach((child, i) => {
    assert.equal(child.props.object, objects[i])
    assert.equal(child.props.originX, layers[0].props.batch.left)
    assert.equal(child.props.opacity, 1, '형광펜 자체 투명도는 원래 StrokeContent가 적용한다')
  })
  const enlarged = component.render({ objects, width: 1024, height: 768, zoom: 50, renderObject: () => null })
  const fallback = enlarged[0].type(enlarged[0].props)
  assert.equal(fallback.props.shouldRasterizeIOS, false)
  assert.equal(fallback.props.children.props.children.length, objects.length)
})

test('네이티브 페이지를 단계별로 표시해도 이미 완성된 획 묶음을 재사용한다', () => {
  const component = loadComponent('CompletedStrokeLayer')
  const more = Array.from({ length: 4 }, (_, i) => createStroke([{ x: 15, y: 25 }, { x: 210, y: 60 }], { id: `n${i}`, kind: 'pen' }))
  const options = { width: 1024, height: 768, zoom: 1, renderObject: () => null }
  const first = component.render({ ...options, objects })
  const later = component.render({ ...options, objects: [...objects, ...more] })
  assert.equal(later[0].props.batch, first[0].props.batch)
  assert.deepEqual(later.flatMap(layer => layer.props.batch.objects), [...objects, ...more])
})

test('잉크병 메모의 덧그림은 뒤에 그은 획만 덮고, 나중에 붙인 메모에는 덮인다', () => {
  // 사용자 2026-11-12: "그 위에 다른 메모지가 붙으면 공병 메모지의 공병 윤곽도 가려져야 한다"
  const memo = { id: 'memo', type: 'sticker', art: 'inkRound', x: 0, y: 0, w: 100, h: 100 }
  const later = { id: 'later', type: 'sticker', x: 10, y: 10, w: 50, h: 50 }
  const component = loadComponent('StaticPage', 'ios', null, null, ['inkRound'])
  const drawing = drawingOf(component.render({ page: { ...page, objects: [memo, ...objects, later] }, zoom: 1 }))
  const at = pred => drawing.findIndex(pred)
  const iMemo = at(n => n?.props?.object === memo)
  const iOver = at(n => n?.key === 'over-memo')
  const iLater = at(n => n?.props?.object === later)
  assert.ok(iMemo >= 0 && iOver >= 0 && iLater >= 0, '셋 다 그려진다')
  assert.ok(iMemo < iOver, '덧그림은 메모 위에')
  assert.ok(iOver < iLater, '나중에 붙인 메모가 덧그림 위에')
  // 사이의 획은 덧그림 아래에 있어야 한다
  assert.ok(at(n => n?.props?.object === objects[objects.length - 1]) < iOver, '그 사이 획은 덧그림 아래')
})

test('발색 기록 속지의 병 윤곽은 획 위에, 나중에 붙인 메모 아래에 그려진다', () => {
  // 사용자 2026-11-11: "속지 병 안에 획 그으면 병 윤곽이 내가 그은 획보다 위이게 해줘"
  // 사용자 2026-11-13: "발색 기록 속지들도 메모지랑 같은 버그" — 맨 뒤에 그려서 나중에 붙인 것까지 덮었다
  const component = loadComponent('StaticPage')
  const later = onBottle({ id: 'later' })
  const inkPage = { ...page, backgroundAssetId: INK_PAGE, objects: [...objects, later] }
  const drawing = drawingOf(component.render({ page: inkPage, zoom: 1 }))
  const front = drawing.findIndex(child => child?.type === 'ink-record-front')
  const lastStroke = drawing.findIndex(child => child?.props?.object === objects[objects.length - 1])
  const iLater = drawing.findIndex(child => child?.props?.object === later)
  assert.ok(front >= 0 && lastStroke >= 0 && iLater >= 0, '셋 다 그려진다')
  assert.ok(lastStroke < front, `윤곽(${front}) 이 획(${lastStroke}) 보다 뒤여야 한다`)
  assert.ok(front < iLater, '나중에 붙인 메모가 윤곽 위에')
  assert.equal(drawing[front].props.page, inkPage)
})

test('획 캐시 경로(앱 · 웹)에도 같은 차례로 넘어간다', () => {
  // 실제 필기 화면은 ordered 를 통째로 캐시 층에 넘긴다 — 차례가 거기서도 지켜져야 한다
  // (코드리뷰 2026-11-13: 새 검사가 캐시 없는 길만 보고 있었다).
  // 메모와 나중에 붙인 것을 **둘 다 병 위**에 둔다 — 그래야 윤곽 · 덧그림이 목록에 끼어 들어간다
  const memo = onBottle({ id: 'memo', art: 'inkRound' })
  const later = onBottle({ id: 'later', x: BOTTLE.x + 15 })
  // 속지에 획을 긋고 → 잉크병 메모를 붙이고 → 그 위에 다른 메모를 붙인 차례
  const inkPage = { ...page, backgroundAssetId: INK_PAGE, objects: [...objects, memo, later] }
  for (const [name, options] of [['앱', { cacheStrokes: true }], ['웹', { cacheStrokes: true }]]) {
    const component = loadComponent('StaticPage', name === '웹' ? 'web' : 'ios', name === '웹' ? true : null, null, ['inkRound'])
    const cache = drawingOf(component.render({ page: inkPage, zoom: 1, ...options }))
    assert.equal(cache.type, name === '웹' ? './WebStrokeCache' : './CompletedStrokeLayer', name)
    const given = cache.props.objects
    const at = pred => given.findIndex(pred)
    const iFront = at(o => o?.inkRecordFront)
    const iOver = at(o => o?.overTopOf === memo)
    const iLast = at(o => o === objects[objects.length - 1])
    const iLater = at(o => o === later)
    assert.ok(iFront >= 0 && iOver >= 0 && iLater >= 0, `${name}: 셋 다 넘어간다`)
    assert.ok(iLast < iFront && iFront < iLater, `${name}: 윤곽은 획 위 · 나중에 붙인 것 아래`)
    assert.ok(iOver < iLater, `${name}: 덧그림도 나중에 붙인 것 아래`)
    // 자리표 · 덧그림은 요소가 아니다 — 캐시 층이 비(非)획으로 보고 renderObject 에 넘겨야 한다
    assert.equal(given[iFront].type, undefined)
    assert.equal(typeof cache.props.renderObject, 'function')
  }
})

test('획 묶음 캐시는 자리표를 비(非)획으로 보고, 같은 내용이면 묶음을 그대로 쓴다', () => {
  // 자리표에 type 이 없어 묶음이 끊기는 것은 의도다. 다만 그 때문에 획 묶음이 매번
  // 다시 녹화되면 안 된다(렌더마다 새 객체였다면 그렇게 된다 — 코드리뷰 2026-11-13).
  const component = loadComponent('CompletedStrokeLayer')
  const front = { id: 'ink-record-front', inkRecordFront: true }
  const options = { width: 1024, height: 768, zoom: 1, renderObject: object => ({ type: 'rendered', props: { object } }) }
  const mixed = [...objects, front]
  const first = component.render({ ...options, objects: mixed })
  assert.equal(first.at(-1).props.object, front, '자리표는 renderObject 로 그린다')
  assert.ok(first[0].props.batch, '앞의 획들은 한 묶음으로 남는다')
  // StaticPage 는 렌더마다 ordered 를 **새 배열**로 만든다. 같은 배열을 두 번 넘기면 참조가 같아
  // 아무것도 증명하지 못한다 — 내용만 같은 새 배열로 견준다(코드리뷰 2026-11-13).
  const again = component.render({ ...options, objects: [...mixed] })
  assert.equal(again[0].props.batch, first[0].props.batch, '배열이 새것이어도 내용이 같으면 묶음을 그대로 쓴다')
  // 자리표까지 새 객체면 그 자리에서 묶음이 끊기는 것은 그대로지만, 앞 묶음은 여전히 같아야 한다
  const newMark = component.render({ ...options, objects: [...objects, { ...front }] })
  assert.equal(newMark[0].props.batch, first[0].props.batch, '자리표가 바뀌어도 앞의 획 묶음은 그대로다')
})

test('숨긴 비(非)획 요소는 병 윤곽 · 덧그림의 차례를 가르지 않는다', () => {
  // 그리는 쪽은 숨긴 것을 빼고 그린다. 숨긴 스티커가 획 앞에 있다고 거기서 윤곽을 끊으면
  // 화면에는 아무것도 없는데 뒤에 그은 획이 윤곽 위로 올라와 병 선을 덮는다(코드리뷰 2026-11-13).
  const hiddenSticker = onBottle({ id: 'ghost', hidden: true })
  const later = onBottle({ id: 'later', x: BOTTLE.x + 10 })
  const component = loadComponent('StaticPage')
  const inkPage = { ...page, backgroundAssetId: INK_PAGE, objects: [hiddenSticker, ...objects, later] }
  const drawing = drawingOf(component.render({ page: inkPage, zoom: 1 }))
  const front = drawing.findIndex(child => child?.type === 'ink-record-front')
  const lastStroke = drawing.findIndex(child => child?.props?.object === objects[objects.length - 1])
  const iLater = drawing.findIndex(child => child?.props?.object === later)
  assert.ok(front >= 0 && lastStroke >= 0 && iLater >= 0)
  assert.ok(lastStroke < front, `윤곽(${front}) 이 획(${lastStroke}) 보다 뒤여야 한다 — 숨긴 것이 앞을 막지 않는다`)
  assert.ok(front < iLater, '보이는 메모는 여전히 윤곽 위에')
})

test('잉크병 메모 덧그림 자리표도 같은 메모면 같은 객체다', () => {
  // 렌더마다 새 객체면 획 묶음 캐시가 참조로 견주는 자리에서 괜히 달라 보인다(코드리뷰 2026-11-13).
  const memo = { id: 'memo', type: 'sticker', art: 'inkRound', x: 0, y: 0, w: 100, h: 100 }
  const later = { id: 'later', type: 'sticker', x: 10, y: 10, w: 50, h: 50 }
  const component = loadComponent('StaticPage', 'ios', null, null, ['inkRound'])
  const memoPage = { ...page, objects: [memo, ...objects, later] }
  const markOf = () => drawingOf(component.render({ page: memoPage, zoom: 1, cacheStrokes: true }))
    .props.objects.find(object => object?.overTopOf === memo)
  const first = markOf()
  assert.ok(first, '덧그림 자리표가 넘어간다')
  assert.equal(markOf(), first, '다시 그려도 같은 객체여야 한다')
})

test('두 번 그려도 캐시 층에 넘어가는 목록이 **같은 객체들**이다', () => {
  // 목록(ordered)은 렌더마다 새 배열이지만, 캐시 층은 배열이 아니라 **요소 참조**로 견준다.
  // 그러니 요소가 하나도 새로 만들어지지 않아야 획 묶음을 다시 녹화하지 않는다(코드리뷰 2026-11-13).
  const memo = { id: 'memo', type: 'sticker', art: 'inkRound', x: 0, y: 0, w: 100, h: 100 }
  const later = { id: 'later', type: 'sticker', x: 10, y: 10, w: 50, h: 50 }
  const component = loadComponent('StaticPage', 'ios', null, null, ['inkRound'])
  const inkPage = { ...page, backgroundAssetId: INK_PAGE, objects: [...objects, memo, later] }
  const listOf = () => drawingOf(component.render({ page: inkPage, zoom: 1, cacheStrokes: true })).props.objects
  const a = listOf(), b = listOf()
  assert.notEqual(a, b, '배열 자체는 새것이다(그래도 괜찮다)')
  assert.equal(a.length, b.length)
  a.forEach((object, i) => assert.equal(b[i], object, `${i} 번째가 같은 객체여야 한다`))
})

test('병 윤곽 자리 계산은 순수 함수 하나로 — 화면과 내보내기가 같은 답을 쓴다', () => {
  // 전에는 내보내기 쪽을 소스 정규식으로 봤다. 변수명만 바뀌어도 깨지고 죽은 코드여도 통과한다
  // (코드리뷰 2026-11-13) → 자리 계산을 순수 함수로 빼고 입출력으로 본다.
  const id = inkRecordId('square', 'portrait')
  const layout = inkRecordLayout(id)
  const bottle = layout.cells[0].bottle
  const stroke = { id: 's', type: 'stroke', x: 0, y: 0, w: 10, h: 10 }
  const far = { id: 'far', type: 'sticker', x: layout.W - 40, y: layout.H - 40, w: 20, h: 20 }
  const over = { id: 'over', type: 'sticker', x: bottle.x + 5, y: bottle.y + 5, w: 20, h: 20 }
  assert.equal(inkRecordFrontIndex('plain-paper', [over]), -1, '속지가 아니면 아예 안 끼운다')
  assert.equal(inkRecordFrontIndex(id, [stroke, far, stroke]), 3, '병을 안 가리면 맨 뒤 — 모든 획 위')
  assert.equal(inkRecordFrontIndex(id, [stroke, far, over, stroke]), 2, '병을 가리는 것 바로 앞')
  assert.equal(inkRecordFrontIndex(id, [stroke, { ...over, hidden: true }, stroke]), 3, '숨긴 것은 안 가른다')
  assert.equal(inkRecordFrontIndex(id, [{ ...over, type: 'stroke' }, stroke]), 2, '획은 안 가른다')
  // 돌린 요소는 **돌린 뒤** 네모로 본다 — 가로로 긴 메모를 90도 돌리면 병에 걸친다
  const long = { id: 'long', type: 'sticker', x: bottle.x + bottle.w / 2 - 80, y: bottle.y - 50, w: 160, h: 20 }
  assert.equal(inkRecordFrontIndex(id, [stroke, long, stroke]), 3, '안 돌리면 병 위쪽 바깥이라 안 가린다')
  assert.equal(inkRecordFrontIndex(id, [stroke, { ...long, rotation: 90 }, stroke]), 1, '돌리면 병에 걸친다')
})

test('화면도 병을 안 가리는 요소에는 윤곽을 안 내린다', () => {
  // 구석 스티커 하나 때문에 윤곽이 모든 획 아래로 내려가면 병 선이 잉크에 덮인다(자체 리뷰 2026-11-13).
  const id = inkRecordId('square', 'portrait')
  const bottle = inkRecordLayout(id).cells[0].bottle
  const far = { id: 'far', type: 'sticker', x: 700, y: 980, w: 20, h: 20 }
  const over = { id: 'over', type: 'sticker', x: bottle.x + 5, y: bottle.y + 5, w: 20, h: 20 }
  const component = loadComponent('StaticPage')
  const orderOf = objects => {
    const drawing = drawingOf(component.render({ page: { ...page, backgroundAssetId: id, objects }, zoom: 1 }))
    return {
      front: drawing.findIndex(child => child?.type === 'ink-record-front'),
      last: drawing.findIndex(child => child?.props?.object === objects.at(-1)),
      over: drawing.findIndex(child => child?.props?.object === over),
    }
  }
  // 가리는 것이 없으면 윤곽은 **목록에 안 끼고 맨 위 층**으로 그린다(빈 묶음이 생기지 않게)
  const cornerPage = { ...page, backgroundAssetId: id, objects: [far, ...objects] }
  const rendered = component.render({ page: cornerPage, zoom: 1 })
  const children = rendered.props.children
  const frontLayer = children.findIndex(child => child?.type === 'ink-record-front')
  const strokeLayer = children.findIndex(child => child?.type === contexts.TextMeasure.Provider)
  assert.ok(frontLayer > strokeLayer, '획 층보다 뒤 — 즉 모든 획 위')
  assert.equal(drawingOf(rendered).findIndex(child => child?.type === 'ink-record-front'), -1,
    '목록에는 끼지 않는다 — 끼면 그 뒤가 빈 묶음이 되어 쓰는 중인 획이 깜박인다')
  const covering = orderOf([...objects, over])
  assert.ok(covering.front < covering.over, '병을 가리는 것은 윤곽 위에')
  assert.ok(covering.front > 0, '그 앞의 획들은 윤곽 아래')
})

test('웹 캐시 층은 type · x · w 가 없는 자리표를 그대로 renderObject 에 넘긴다', () => {
  const component = loadComponent('WebStrokeCache')
  const front = { id: 'ink-record-front', inkRecordFront: true }
  const ghost = { id: 'ghost', type: 'sticker', hidden: true, x: 0, y: 0, w: 10, h: 10 }
  const seen = []
  const rendered = component.render({ objects: [...objects, front, ghost], renderObject: object => { seen.push(object); return { type: 'rendered', props: { object } } } })
  assert.equal(rendered.length, objects.length + 1, '숨긴 것은 빼고 자리표는 그린다')
  assert.ok(seen.includes(front), '자리표도 renderObject 로 간다')
  assert.ok(!seen.includes(ghost), '숨긴 요소는 안 간다')
})

test('맨 위에 남는 덧그림은 목록에 끼지 않는다 — 빈 묶음이 생기면 쓰는 중인 획이 깜박인다', () => {
  // 목록 맨 뒤에 자리표를 넣으면 그 뒤가 **빈 묶음(TailRun)** 이 된다. 쓰는 중인 획은 거기 그려지므로
  // 자리표 위에 떴다가 손을 떼면 아래로 내려앉고, 마지막 획 묶음은 타일 굽기를 잃는다
  // (코드리뷰 2026-11-13).
  const memo = { id: 'memo', type: 'sticker', art: 'inkRound', x: 0, y: 0, w: 100, h: 100 }
  const component = loadComponent('StaticPage', 'ios', null, null, ['inkRound'])
  const rendered = component.render({ page: { ...page, objects: [memo, ...objects] }, zoom: 1, cacheStrokes: true })
  const given = drawingOf(rendered).props.objects
  assert.equal(given.findIndex(one => one?.overTopOf === memo), -1, '덧그림이 목록 맨 뒤에 끼지 않는다')
  assert.equal(given.at(-1), objects.at(-1), '목록은 획으로 끝난다 — 빈 묶음이 생기지 않는다')
  // 대신 층으로 그려 여전히 맨 위다
  const over = rendered.props.children.flat(2).filter(child => child?.key === 'over-memo')
  assert.equal(over.length, 1, '덧그림은 층으로 그린다')
})

test('발색 기록 속지가 아니면 병 윤곽을 아예 그리지 않는다', () => {
  const component = loadComponent('StaticPage')
  const drawing = drawingOf(component.render({ page, zoom: 1 }))
  assert.equal(drawing.findIndex(child => child?.type === 'ink-record-front'), -1)
})

test('필기에서만 캐시를 사용하고 일반 표시·사진 자르기·내보내기는 원본 표시를 유지한다', () => {
  const component = loadComponent('StaticPage')
  const drawing = options => drawingOf(component.render({ page, zoom: 1, ...options }))
  assert.equal(drawing({ cacheStrokes: true }).type, './CompletedStrokeLayer')
  for (const options of [{}, { cacheStrokes: false }, { cacheStrokes: true, cropId: 'photo' }]) {
    const direct = drawing(options)
    assert.equal(direct.length, 4)
    assert.equal(direct[0].type, './PageObject')
    assert.equal(direct[0].props.object, objects[0])
  }
  const gif = { id: 'gif', type: 'sticker', x: 0, y: 0, w: 10, h: 10 }
  const mixedPage = { ...page, objects: [...objects, gif] }
  const selection = drawingOf(component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, stillIds: ['gif'] }))
  assert.equal(selection.type, './CompletedStrokeLayer')
  assert.equal(selection.props.renderObject(gif).props.still, true)
  const movingPhoto = drawingOf(component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, fadeIds: ['gif'] }))
  assert.equal(movingPhoto.type, './CompletedStrokeLayer')
  assert.equal(movingPhoto.props.renderObject(gif).props.opacity, 0.5)
  const movingStroke = drawingOf(component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, fadeIds: ['s0'] }))
  // 앱(Skia)은 획을 옮기는 중에도 같은 획 층에 그리고, 옮기는 획만 반투명으로 넘긴다
  assert.equal(movingStroke.type, './CompletedStrokeLayer')
  assert.deepEqual(movingStroke.props.fadeIds, ['s0'])
  assert.equal(component.compare({ page, zoom: 1, cacheStrokes: false }, { page, zoom: 1, cacheStrokes: true }), false)
})

test('캐리어 렌더링에서 색상·수납·앞 레이어가 일반 요소보다 앞뒤에 맞게 배치된다', () => {
  const packing = { origin: { x: 10, y: 20 }, cases: [], interiors: [{ x: 5, y: 6, width: 40, height: 50, rx: 4 }, { x: 50, y: 6, width: 40, height: 50, rx: 4 }] }
  const component = loadComponent('StaticPage', 'ios', null, packing)
  const packedPhoto = { id: 'photo', type: 'photo', x: 12, y: 24, w: 20, h: 20, packingSlot: 0 }
  const ordinarySticker = { id: 'sticker', type: 'sticker', x: 200, y: 200, w: 20, h: 20 }
  const color = { id: 'color', type: 'shape', packingColorRegion: 'case-0', fill: '#123456' }
  const rendered = component.render({ page: { ...page, backgroundAssetId: 'remote-packing-list-v8-portrait', objects: [packedPhoto, ordinarySticker, color] }, zoom: 1 })
  const children = rendered.props.children
  assert.equal(children[1].type, 'packing-color')
  const containsObject = (node, object) => Array.isArray(node) ? node.some(child => containsObject(child, object)) : node && typeof node === 'object' ? (node.props?.object === object || containsObject(node.props?.children, object)) : false
  assert.equal(containsObject(children[2], packedPhoto), true)
  assert.equal(children[3].type, 'packing-front')
  const drawing = drawingOf(rendered)
  assert.equal(drawing[0].props.object, ordinarySticker)
  assert.equal(drawing.length, 1)
})

test('네이티브 도구 전환 · 선택 이동 중에도 필기 레이어(Skia)를 유지하고 옮기는 획만 반투명으로 넘긴다', () => {
  const component = loadComponent('StaticPage', 'ios')
  const draw = (tool, extra = {}) => drawingOf(component.render({ page, zoom: 1,
    cacheStrokes: planner.shouldCacheCompletedStrokes('ios', false, tool), ...extra }))
  for (const tool of ['pen', 'highlighter', 'hand', 'select', 'text', 'lasso', 'eraser']) {
    assert.equal(draw(tool).type, './CompletedStrokeLayer', tool)
  }
  const moving = draw('select', { fadeIds: ['s0'] })
  assert.equal(moving.type, './CompletedStrokeLayer')
  assert.deepEqual(moving.props.fadeIds, ['s0'])
  assert.equal(draw('lasso', { stillIds: ['s0'] }).type, './CompletedStrokeLayer')
  assert.equal(planner.shouldCacheCompletedStrokes('ios', true, 'pen'), true)
  assert.equal(planner.shouldCacheCompletedStrokes('web', false, 'select'), false)
})

test('네이티브 영역 지우기 미리보기는 캐시된 원본 대신 남은 조각을 표시하고 취소 시 복원한다', () => {
  for (const platform of ['ios', 'android']) {
    const initial = Array.from({ length: 4 }, (_, i) => createStroke(
      [{ x: 0, y: 100 + i * 60 }, { x: 300, y: 100 + i * 60 }], { id: `stroke-${i}`, width: 4 }))
    const session = createEraserSession(initial, 10, 'area')
    const staticPage = loadComponent('StaticPage', platform)
    const strokeLayer = loadComponent('CompletedStrokeLayer', platform)
    const render = (items, areaErasing = false) => {
      const layer = drawingOf(staticPage.render({ page: { ...page, objects: items }, zoom: 1,
        cacheStrokes: planner.shouldCacheCompletedStrokes(platform, false, 'eraser'),
        areaErasing, areaPreviewObjects: null, deferredAreaObjects: new WeakSet() }))
      assert.equal(layer.type, './CompletedStrokeLayer')
      return strokeLayer.render({ ...layer.props, width: 1024, height: 768 }).flatMap(item => item.props.batch.objects)
    }
    assert.deepEqual(render(initial), initial)
    const ids = session.move({ x: 150, y: 80 }, { x: 150, y: 120 })
    const pieces = session.replacements()
    const preview = initial.flatMap(object => pieces?.[object.id] ?? (ids.includes(object.id) ? [] : [object]))
    const shown = render(preview, true)
    assert.equal(shown.some(object => object.id === 'stroke-0'), false, platform)
    assert.equal(shown.length, 5, platform)
    assert.deepEqual(shown.slice(0, 2), pieces['stroke-0'])
    assert.deepEqual(shown.slice(2), initial.slice(1))
    assert.equal(session.finish(true), null)
    assert.deepEqual(render(initial), initial)
  }
})


test('정식 웹 필기층은 기본 캐시, 썸네일·출력·변형은 원본이며 QA 끄기는 유지한다', () => {
  const web = loadComponent('StaticPage', 'web')
  const draw = options => drawingOf(web.render({ page, zoom: 1, ...options }))
  assert.equal(draw({ cacheStrokes: true }).type, './WebStrokeCache')
  for (const options of [{}, { cacheStrokes: true, cropId: 'photo' }, { cacheStrokes: true, fadeIds: ['s0'] }, { cacheStrokes: true, stillIds: ['s0'] }]) {
    const direct = draw(options)
    assert.equal(direct.length, objects.length)
    assert.equal(direct[0].props.object, objects[0])
  }
  const off = drawingOf(loadComponent('StaticPage', 'web', false).render({ page, zoom: 1, cacheStrokes: true }))
  assert.equal(off.type, './CompletedStrokeLayer')
  const native = drawingOf(loadComponent('StaticPage', 'ios', true).render({ page, zoom: 1, cacheStrokes: true }))
  assert.equal(native.type, './CompletedStrokeLayer')
})

// A non-ink object must not remount hundreds of independent stroke components.
test('스티커 선택·드래그는 필기 캐시를 유지하고 실제 필기 변형만 원본으로 돌아간다', () => {
  for (const platform of ['ios', 'android', 'web']) {
    const component = loadComponent('StaticPage', platform)
    const many = Array.from({ length: 1000 }, (_, i) => ({ ...objects[0], id: `s-${i}` }))
    const sticker = { id: 'sticker', type: 'sticker', x: 30, y: 40, w: 100, h: 100 }
    const props = { page: { ...page, objects: [...many, sticker] }, zoom: 1, cacheStrokes: true }
    const draw = extra => drawingOf(component.render({ ...props, ...extra }))
    const expected = platform === 'web' ? './WebStrokeCache' : './CompletedStrokeLayer'
    assert.equal(draw({}).type, expected)
    assert.equal(draw({ stillIds: ['sticker'] }).type, expected)
    assert.equal(draw({ fadeIds: ['sticker'], stillIds: ['sticker'] }).type, expected)
    // 실제 필기 변형: 웹은 원본(SVG)으로, 앱은 같은 Skia 획 층에 그린다
    if (platform === 'web') {
      assert.equal(draw({ stillIds: ['s-0'] }).length, 1001)
      assert.equal(draw({ fadeIds: ['s-0'] }).length, 1001)
    } else {
      assert.equal(draw({ stillIds: ['s-0'] }).type, expected)
      assert.equal(draw({ fadeIds: ['s-0'] }).type, expected)
    }
    assert.equal(draw({}).type, expected)
  }
})
