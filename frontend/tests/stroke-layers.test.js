import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import * as planner from '../src/editor/utils/completedStrokePlan.js'
import * as geometry from '../src/editor/utils/pageGeometry.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const contexts = { TextMeasure: { Provider: 'measure' }, TextMeasureReady: { Provider: 'measure-ready' }, objectOpacity: object => object.opacity ?? 1 }
function loadComponent(file, platform = 'ios', cacheOverride = null) {
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
    if (id === './WebStrokeCacheContext') return { WebStrokeCacheEnabled: cacheContext }
    if (id.endsWith('/fontScope')) return { KeepFont: 'keep-font' }
    if (id === './ObjectView') return contexts
    if (id === './viewportMotion') return { ViewportMotion: {} }
    if (['./PageObject', '../PageBackground', './CompletedStrokeLayer', './WebStrokeCache'].includes(id)) return { __esModule: true, default: id }
    return require(id)
  }
  new Function('require', 'module', 'exports', code)(load, module, module.exports)
  return { render(props) { cursor = 0; return module.exports.default(props) }, compare: module.exports.default.compare }
}

const objects = Array.from({ length: 4 }, (_, i) => createStroke([{ x: 10, y: 20 }, { x: 200, y: 50 }], { id: `s${i}`, kind: 'highlighter' }))
const page = { id: 'p', canvasWidth: 1024, canvasHeight: 768, objects }

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

test('네이티브 선택 정지 표시는 획 캐시를 유지하고 자르기·이동·일반 표시는 원본을 사용한다', () => {
  const component = loadComponent('StaticPage')
  const drawing = options => component.render({ page, zoom: 1, ...options }).props.children[1].props.children.props.children
  assert.equal(drawing({ cacheStrokes: true }).type, './CompletedStrokeLayer')
  for (const options of [{}, { cacheStrokes: false }, { cacheStrokes: true, cropId: 'photo' },
    { cacheStrokes: true, fadeIds: ['s0'] }]) {
    const direct = drawing(options)
    assert.equal(direct.length, 4)
    assert.equal(direct[0].type, './PageObject')
    assert.equal(direct[0].props.object, objects[0])
  }
  const gif = { id: 'gif', type: 'sticker', x: 0, y: 0, w: 10, h: 10 }
  const mixedPage = { ...page, objects: [...objects, gif] }
  const selection = component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, stillIds: ['gif'] }).props.children[1].props.children.props.children
  assert.equal(selection.type, './CompletedStrokeLayer')
  assert.equal(selection.props.renderObject(gif).props.still, true)
  const movingPhoto = component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, fadeIds: ['gif'] }).props.children[1].props.children.props.children
  assert.equal(movingPhoto.type, './CompletedStrokeLayer')
  assert.equal(movingPhoto.props.renderObject(gif).props.opacity, 0.5)
  const movingStroke = component.render({ page: mixedPage, zoom: 1, cacheStrokes: true, fadeIds: ['s0'] }).props.children[1].props.children.props.children
  assert.equal(movingStroke[0].props.opacity, 0.5)
  assert.equal(component.compare({ page, zoom: 1, cacheStrokes: false }, { page, zoom: 1, cacheStrokes: true }), false)
})

test('네이티브 도구 전환은 필기 레이어를 유지하고 선택 이동 중에는 원본을 표시한다', () => {
  const component = loadComponent('StaticPage', 'ios')
  const draw = (tool, extra = {}) => component.render({ page, zoom: 1,
    cacheStrokes: planner.shouldCacheCompletedStrokes('ios', false, tool), ...extra }).props.children[1].props.children.props.children
  for (const tool of ['pen', 'highlighter', 'hand', 'select', 'text', 'lasso', 'eraser']) {
    assert.equal(draw(tool).type, './CompletedStrokeLayer', tool)
  }
  assert.equal(draw('select', { fadeIds: ['s0'] })[0].type, './PageObject')
  assert.equal(draw('lasso', { stillIds: ['s0'] }).type, './CompletedStrokeLayer')
  assert.equal(planner.shouldCacheCompletedStrokes('ios', true, 'pen'), false)
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
      const layer = staticPage.render({ page: { ...page, objects: items }, zoom: 1,
        cacheStrokes: planner.shouldCacheCompletedStrokes(platform, false, 'eraser'),
        areaErasing, areaPreviewObjects: null, deferredAreaObjects: new WeakSet() }).props.children[1].props.children.props.children
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
  const draw = options => web.render({ page, zoom: 1, ...options }).props.children[1].props.children.props.children
  assert.equal(draw({ cacheStrokes: true }).type, './WebStrokeCache')
  for (const options of [{}, { cacheStrokes: true, cropId: 'photo' }, { cacheStrokes: true, fadeIds: ['s0'] }, { cacheStrokes: true, stillIds: ['s0'] }]) {
    const direct = draw(options)
    assert.equal(direct.length, objects.length)
    assert.equal(direct[0].props.object, objects[0])
  }
  const off = loadComponent('StaticPage', 'web', false).render({ page, zoom: 1, cacheStrokes: true }).props.children[1].props.children.props.children
  assert.equal(off.type, './CompletedStrokeLayer')
  const native = loadComponent('StaticPage', 'ios', true).render({ page, zoom: 1, cacheStrokes: true }).props.children[1].props.children.props.children
  assert.equal(native.type, './CompletedStrokeLayer')
})
