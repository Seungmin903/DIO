import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const babel = expo('@babel/core')
const plugins = [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')]
const jsx = (type, props) => ({ type, props })

test('Android 사진 과다 판별은 배열 변경 시에만 계산하고 보이는 사진 24장에서 중단한다', () => {
  const ast = babel.parseSync(readFileSync(new URL('../src/editor/components/canvas/Canvas.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  let declaration
  expo('@babel/traverse').default(ast, { VariableDeclarator(path) {
    if (path.node.id.name === 'photoHeavyAndroidPage') declaration = path.node
  } })
  assert.ok(declaration)
  const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'script', directives: [], body: [{ type: 'VariableDeclaration', kind: 'const', declarations: [declaration] }] } }, undefined, { configFile: false, babelrc: false })
  let previous, value, reads = 0
  const memo = (make, deps) => {
    if (!previous || deps.some((entry, i) => entry !== previous[i])) { previous = deps; value = make() }
    return value
  }
  const render = new Function('page', 'Platform', 'useMemo', code + '\nreturn photoHeavyAndroidPage')
  const photo = () => ({ get type() { reads++; return 'photo' } })
  const objects = Array.from({ length: 24 }, photo)
  objects.push({ get type() { assert.fail('24장 뒤에는 읽지 않는다') } })
  assert.equal(render({ objects }, { OS: 'android' }, memo), true)
  assert.equal(reads, 24)
  assert.equal(render({ objects }, { OS: 'android' }, memo), true)
  assert.equal(reads, 24)
  assert.equal(render({ objects: [{ type: 'photo', hidden: true }, ...objects.slice(0, 23)] }, { OS: 'android' }, memo), false)
  assert.equal(render({ objects: [] }, { OS: 'android' }, memo), false)
  previous = null
  assert.equal(render({ objects }, { OS: 'ios' }, memo), false)
})

test('화면 밖 사진만 제외하고 이동 후 다시 표시하며 자르기 대상과 일반 요소는 유지한다', () => {
  const motion = { visible: { x: 0, y: 0, width: 100, height: 100 } }
  const viewport = {}, cache = {}
  const { code } = babel.transformSync(readFileSync(new URL('../src/editor/components/canvas/StaticPage.js', import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins })
  const mocks = {
    react: { memo: fn => fn, useLayoutEffect() {}, useContext: key => key === viewport ? motion : false },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: 'android' }, View: 'view', StyleSheet: { create: value => value } },
    '../../utils/pageGeometry.js': { pageSize: () => ({ width: 1000, height: 1000 }) },
    '../../utils/backdrop.js': { fitBackdropToPage: object => object },
    './ObjectView': { objectDrawOpacity: () => 1, TextMeasure: { Provider: 'provider' }, TextMeasureReady: { Provider: 'provider' } },
    './PageObject': { default: 'object', __esModule: true },
    './viewportMotion': { ViewportMotion: viewport },
    './WebStrokeCacheContext': { WebStrokeCacheEnabled: cache },
    '../../utils/editorShapes': { memoArtOf: () => null },
    '../../templates/packingLayout.js': { packingLayout: () => null },
  }
  const module = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => mocks[id] ?? {}, module, module.exports)
  const page = { id: 'page', objects: [
    { id: 'near', type: 'photo', x: 10, y: 10, w: 20, h: 20 },
    { id: 'far', type: 'photo', x: 700, y: 700, w: 20, h: 20 },
    { id: 'text', type: 'text', x: 700, y: 700, w: 20, h: 20 },
  ] }
  const objects = node => !node ? [] : Array.isArray(node) ? node.flatMap(objects)
    : node.type === 'object' ? [node.props.object.id] : objects(node.props?.children)
  const render = options => objects(module.exports.default({ page, zoom: 1, limitPhotoMemory: true, ...options }))
  assert.deepEqual(render(), ['near', 'text'])
  assert.deepEqual(render({ cropId: 'far' }), ['near', 'far', 'text'])
  assert.deepEqual(render({ limitPhotoMemory: false }), ['near', 'far', 'text'])
  motion.visible = { x: 650, y: 650, width: 100, height: 100 }
  assert.deepEqual(render(), ['far', 'text'])
  assert.equal(page.objects.length, 3)
})

test('대량 사진 추가 중 삭제와 24장 경계 재진입에도 이전 표시 타이머가 취소된다', () => {
  const source = readFileSync(new URL('../src/editor/components/canvas/Canvas.js', import.meta.url), 'utf8')
  const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  const component = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'ProgressiveCanvasDrawing')
  assert.ok(component)
  const { code } = babel.transformFromAstSync({ type: 'File', program: { type: 'Program', sourceType: 'module', directives: [], body: [component] } }, source, { configFile: false, babelrc: false, plugins })
  let cursor, states = [], dependencies = [], cleanups = [], effects = [], timers = new Map(), timerId = 0
  const react = {
    useRef(value) { const i = cursor++; return states[i] ??= { current: value } },
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = initial; return [states[i], value => { states[i] = value }] },
    useMemo(make) { return make() },
    useEffect(effect, deps) { const i = cursor++; if (!dependencies[i] || deps.some((v, j) => v !== dependencies[i][j])) effects.push(() => { cleanups[i]?.(); dependencies[i] = deps; cleanups[i] = effect() }) },
  }
  const make = new Function('require', 'useRef', 'useState', 'useMemo', 'useEffect', 'useLayoutEffect', 'Platform', 'useProgressiveNativePage', 'StaticPage', 'setTimeout', 'clearTimeout', code + '\nreturn ProgressiveCanvasDrawing')
  const renderComponent = make(() => ({ jsx, jsxs: jsx }), react.useRef, react.useState, react.useMemo, react.useEffect, react.useEffect, { OS: 'android' }, page => ({ count: page.objects.length, ready: true }), 'page',
    fn => { const id = ++timerId; timers.set(id, fn); return id }, id => timers.delete(id))
  const render = page => { cursor = 0; const view = renderComponent({ page, enabled: true, startPending: page.objects.length >= 24, onReady() {} }); effects.splice(0).forEach(effect => effect()); return view.props.page.objects.length }
  const photos = n => ({ id: 'same', objects: Array.from({ length: n }, (_, id) => ({ id, type: 'photo' })) })
  assert.equal(render(photos(23)), 23)
  const large = photos(40)
  assert.equal(render(large), 31)
  render(large)
  assert.equal(timers.size, 1)
  const small = photos(20)
  assert.equal(render(small), 20)
  assert.equal(timers.size, 0)
  const again = photos(40)
  assert.equal(render(again), 28)
  render(again)
  while (timers.size) { const [id, fn] = timers.entries().next().value; timers.delete(id); fn(); render(again) }
  assert.equal(render(again), 40)
  assert.equal(again.objects.length, 40)
  cleanups.forEach(cleanup => cleanup?.())
})
