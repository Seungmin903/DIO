import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pageSize } from '../src/editor/utils/pageGeometry.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function fixture(platform) {
  let failed = null
  const load = file => {
    const module = { exports: {} }, cacheContext = {}
    const { code } = expo('@babel/core').transformSync(readFileSync(new URL(`../src/editor/components/canvas/${file}.js`, import.meta.url), 'utf8'), {
      configFile: false, babelrc: false,
      plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')],
    })
    new Function('require', 'module', 'exports', code)(id => {
      if (id === 'react') return {
        useState: () => [failed, next => { failed = next }], memo: component => component,
        useContext: context => context === cacheContext ? null : ({ moving: false, visible: null }), useLayoutEffect() {},
      }
      if (id === 'react-native') return { Image: 'image', View: 'view', Platform: { OS: platform }, StyleSheet: { create: value => value } }
      if (id === './StaticPage') return { __esModule: true, default: 'static-page' }
      if (id === './ObjectView') return { TextMeasure: { Provider: 'measure' }, TextMeasureReady: { Provider: 'ready' }, objectOpacity: () => 1, objectDrawOpacity: () => 1 }
      if (id === './viewportMotion') return { ViewportMotion: {} }
      if (id === './WebStrokeCacheContext') return { WebStrokeCacheEnabled: cacheContext }
      if (id.endsWith('/pageGeometry.js')) return { pageSize }
      if (['../PageBackground', './PageObject', './CompletedStrokeLayer', './WebStrokeCache'].includes(id)) return { __esModule: true, default: id }
      if (id.endsWith('/utils/backdrop.js')) return require('../src/editor/utils/backdrop.js')
      return require(id)
    }, module, module.exports)
    return module.exports.default
  }
  return { render: load('ReadingPageContent'), draw: load('StaticPage') }
}

for (const platform of ['web', 'android', 'ios']) test(`${platform}: 읽기 이미지 실패 후 투명 캔버스와 페이지 전환 모두 속지·벡터를 복원한다`, () => {
  const page = { id: 'paper', canvasWidth: 1188, canvasHeight: 840, backgroundAssetId: 'lined', paperAppearance: { backgroundColor: '#FBEFF0' }, objects: [{ id: 'ink', type: 'stroke' }] }
  for (const background of ['transparent', '#FBEFF0']) {
    const { render, draw } = fixture(platform)
    const props = { image: { uri: 'file:///broken.png' }, page, zoom: .5, background, still: true }
    const image = render(props).props.children
    assert.equal(image.type, 'image')
    image.props.onError()
    const fallback = render(props)
    assert.equal(fallback.type, 'static-page')
    assert.equal(fallback.props.showBackground, true, '기본값에 의존하지 않고 속지를 명시적으로 복원')
    assert.equal(fallback.props.page, page)
    assert.equal(fallback.props.still, true)
    const drawn = draw(fallback.props)
    assert.equal(drawn.props.children[0].type, '../PageBackground')
    assert.equal(drawn.props.children[0].props.page.paperAppearance.backgroundColor, '#FBEFF0')
    const ink = drawn.props.children[1].props.children.props.children
    if (platform === 'web') {
      assert.equal(ink[0].type, './PageObject')
      assert.equal(ink[0].props.object, page.objects[0])
    } else assert.equal(ink.type, './CompletedStrokeLayer')
    assert.equal(render({ ...props, image: { uri: 'file:///replacement.png' } }).props.children.type, 'image', '다른 이미지의 정상 로드를 막지 않는다')
    assert.equal(render({ ...props, image: null }).props.showBackground, true)
  }
})
