import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { createStroke } from '../src/editor/utils/strokes.js'
import * as planner from '../src/editor/utils/completedStrokePlan.js'
import * as geometry from '../src/editor/utils/pageGeometry.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const contexts = { TextMeasure: { Provider: 'measure' }, objectOpacity: object => object.opacity ?? 1 }
function loadComponent(file) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/components/canvas/${file}.js`, import.meta.url), 'utf8'), {
    configFile: false, babelrc: false,
    plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }, refs = []
  let cursor = 0
  const load = id => {
    if (id === 'react') return {
      memo: (component, compare) => Object.assign(component, { compare }),
      useRef: value => refs[cursor++] ??= { current: value },
      createContext: () => ({}), useContext: () => ({ moving: false, visible: null }),
    }
    if (id === 'react-native') return { PixelRatio: { get: () => 2 }, View: 'view', StyleSheet: { create: value => value } }
    if (id.endsWith('/completedStrokePlan.js')) return planner
    if (id.endsWith('/pageGeometry.js')) return geometry
    if (id === './ObjectView') return contexts
    if (['./PageObject', '../PageBackground', './CompletedStrokeLayer'].includes(id)) return { __esModule: true, default: id }
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

test('필기에서만 캐시를 사용하고 일반 표시·선택 조작·내보내기는 원본 표시를 유지한다', () => {
  const component = loadComponent('StaticPage')
  const drawing = options => component.render({ page, zoom: 1, ...options }).props.children[1].props.children
  assert.equal(drawing({ cacheStrokes: true }).type, './CompletedStrokeLayer')
  for (const options of [{}, { cacheStrokes: false }, { cacheStrokes: true, cropId: 'photo' },
    { cacheStrokes: true, fadeIds: ['s0'] }, { cacheStrokes: true, stillIds: ['s0'] }]) {
    const direct = drawing(options)
    assert.equal(direct.length, 4)
    assert.equal(direct[0].type, './PageObject')
    assert.equal(direct[0].props.object, objects[0])
  }
  assert.equal(component.compare({ page, zoom: 1, cacheStrokes: false }, { page, zoom: 1, cacheStrokes: true }), false)
})
