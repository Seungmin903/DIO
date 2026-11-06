import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { createPenPointerInput } from '../src/editor/utils/penPointerInput.js'
import { createPenMotion } from '../src/editor/utils/penMotion.js'
import { feltMaterialLayers, fountainInkOpacity, penMaterialSeed } from '../src/editor/utils/penMaterials.js'
import { createStrokePreview } from '../src/editor/utils/strokePreview.js'
import { createStroke } from '../src/editor/utils/strokes.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { createEraserSession } from '../src/editor/utils/eraser.js'
import { createInitialState, editorReducer, getCurrentPage } from '../src/editor/state/editorReducer.js'

test('포인터 활성화 후 지우개용 usePan도 실측 Pencil을 받고 responder 중복 종료를 무시한다', () => {
  const require = createRequire(import.meta.url), fs = require('node:fs')
  const expo = createRequire(require.resolve('expo/package.json'))
  const { code } = expo('@babel/core').transformSync(fs.readFileSync(new URL('../src/editor/hooks/usePan.js', import.meta.url), 'utf8'), {
    configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
  })
  const module = { exports: {} }, log = []
  new Function('require', 'module', 'exports', code)(id => {
    if (id === 'react') return { useContext: () => true, useRef: current => ({ current }), useState: init => [init()], useLayoutEffect: fn => fn(), useEffect: fn => fn() }
    if (id === 'react-native') return { PanResponder: { create: panHandlers => ({ panHandlers }) } }
    if (id.endsWith('/usePalmRejection')) return { PalmRejectionContext: {}, usePalmRejectingPan: h => ({
      onResponderGrant: e => h.onStart(e.nativeEvent), onResponderRelease: () => h.onEnd({ cancelled: false }),
    }) }
    if (id.endsWith('/penPointerInput.js')) return { createPenPointerInput }
    if (id.endsWith('/stylus')) return { setPenPointerActive() {} }
    return require(id)
  }, module, module.exports)
  const pan = module.exports.usePan({ onStart: e => log.push(['start', e.pressure]), onMove() {}, onEnd: e => log.push(['end', e.cancelled]) })
  const e = { pointerId: 1, pointerType: 'pen', offsetX: 20, offsetY: 30, pressure: 0.6 }
  pan.onPointerDown(e)
  pan.onResponderGrant({ nativeEvent: { force: 0 } })
  pan.onResponderRelease()
  pan.onPointerUp({ ...e, pressure: 0 })
  assert.deepEqual(log, [['start', 0.6], ['end', false]])
})

test('Pencil 묶음 입력은 시간 순서대로 한번씩 수집하고 예측 좌표·다른 포인터는 저장하지 않는다', () => {
  const moves = [], ends = [], active = []
  const pointer = createPenPointerInput(() => ({ onStart() {}, onMove: (x, y, e) => moves.push(e), onEnd: e => ends.push(e) }), v => active.push(v))
  const event = (x, timeStamp, pressure = 0.4) => ({ pointerId: 4, pointerType: 'pen', offsetX: x, offsetY: 50, clientX: x + 100, clientY: 250, timeStamp, pressure })
  pointer.handlers.onPointerDown(event(10, 0))
  pointer.handlers.onPointerMove({ ...event(40, 30, 0.8), getCoalescedEvents: () => [event(20, 10, 0.2), event(30, 20, 0.6), event(40, 30, 0.8)], getPredictedEvents: () => [event(200, 40)] })
  pointer.handlers.onPointerMove({ ...event(50, 40), pointerId: 5 })
  pointer.handlers.onPointerMove(event(25, 15))
  assert.deepEqual(moves.map(e => e.locationX), [20, 30, 40])
  assert.deepEqual(moves.map(e => e.pressure), [0.2, 0.6, 0.8])
  pointer.handlers.onPointerCancel(event(40, 40))
  assert.deepEqual(ends, [{ cancelled: true }])
  assert.deepEqual(active, [true, false])
  pointer.handlers.onPointerUp(event(60, 50))
  assert.equal(ends.length, 1)
})

test('공통 보정은 정지 떨림을 줄이면서 빠른 입력·직각·최종 끝점과 필압을 보존한다', () => {
  const model = createPenMotion({ x: 0, y: 0 })
  const jitter = model.sample({ x: 0.2, y: 0.1, force: 0.4 }, 1)
  assert.ok(jitter.x > 0 && jitter.x < 0.2)
  assert.equal(jitter.force, 0.4)
  const fast = model.sample({ x: 100, y: 0 }, 4)
  assert.ok(Math.hypot(fast.x - 100, fast.y) <= 0.8)
  const corner = model.sample({ x: 100, y: 50 }, 4)
  assert.deepEqual(corner, { x: 100, y: 50 })
  assert.deepEqual(model.sample({ x: 101, y: 51 }, 1, true), { x: 101, y: 51 })
})

test('iOS 포인터 플러그인은 Swift/ObjC 시작 시 활성화하고 재실행 시 중복 삽입하지 않는다', () => {
  const require = createRequire(import.meta.url)
  // Expo config plugins are CommonJS, while this application is an ESM package.
  const fs = require('node:fs'), vm = require('node:vm')
  const source = fs.readFileSync(new URL('../plugins/withPointerEvents.js', import.meta.url), 'utf8')
  const module = { exports: {} }
  vm.runInNewContext(source, { module, require: () => ({ withMainApplication() {}, withAppDelegate() {} }) })
  const enable = module.exports.enableIOSPointers
  const allowed = module.exports.shouldEnableIOSPointers
  assert.equal(allowed('development'), true)
  for (const profile of ['preview', 'production', undefined]) assert.equal(allowed(profile), false)
  assert.equal(allowed(undefined, '1'), true)
  assert.equal(allowed('development', '0'), false)
  const eas = JSON.parse(fs.readFileSync(new URL('../eas.json', import.meta.url), 'utf8'))
  for (const profile of ['development', 'preview', 'production']) {
    assert.equal(allowed(profile, eas.build[profile].env.DIO_IOS_POINTER_EVENTS), true, `${profile} must enable Pencil pointer events`)
  }
  for (const [language, app, call] of [
    ['swift', 'import Expo\nclass AppDelegate { override func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {\nreturn true\n} }', 'RCTSetDispatchW3CPointerEvents(true)'],
    ['objc', '- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)options {\nreturn YES;\n}', 'RCTSetDispatchW3CPointerEvents(YES);'],
  ]) {
    const result = enable(app, language)
    assert.ok(result.includes(call))
    assert.equal(enable(result, language), result)
    const disabled = enable(result, language, false)
    assert.ok(disabled.includes(language === 'swift' ? 'RCTSetDispatchW3CPointerEvents(false)' : 'RCTSetDispatchW3CPointerEvents(NO);'))
    assert.equal(enable(disabled, language), result)
  }
  assert.throws(() => enable('unexpected template', 'swift'), /entry not found/)
  assert.equal(enable('unexpected template', 'swift', false), 'unexpected template')
})

test('신규 재질의 시드·필압·농도는 저장 복원 및 영역 지우기/Undo 이후 유지된다', () => {
  const points = Array.from({ length: 220 }, (_, i) => ({ x: 20 + i * 2, y: 80 + Math.sin(i / 20) * 10,
    pressure: 1, force: 0.3, speed: 0.5, time: i * 4, inkDistance: i * 2 }))
  const object = createStroke(points, { id: 'felt-v3', kind: 'felt', width: 16, renderVersion: 3, materialSeed: penMaterialSeed('felt-v3') })
  const restored = createExportSnapshot({ objects: [JSON.parse(JSON.stringify(object))] }).objects[0]
  assert.deepEqual(restored, object)
  const originalPaths = feltMaterialLayers([{ points: object.points }], 16, object.materialSeed)
  assert.deepEqual(feltMaterialLayers([{ points: restored.points }], 16, restored.materialSeed), originalPaths)
  assert.notDeepEqual(feltMaterialLayers([{ points: restored.points }], 16, restored.materialSeed + 1), originalPaths)
  const session = createEraserSession([object], 6, 'area')
  session.move({ x: 220, y: 80 })
  let state = createInitialState({ pages: [{ id: 'page', objects: [object] }] })
  state = editorReducer(state, session.finish())
  const fragments = getCurrentPage(state).objects
  assert.ok(fragments.length >= 2)
  assert.ok(fragments.every(o => o.renderVersion === 3 && o.materialSeed === object.materialSeed && o.points.every(p => p.force === 0.3 && Number.isFinite(p.inkDistance))))
  assert.ok(fragments[1].points[0].inkDistance > 180)
  createExportSnapshot({ objects: fragments })
  state = editorReducer(state, { type: 'undo' })
  assert.deepEqual(getCurrentPage(state).objects, [object])
})

test('만년필 농도는 필압·속도·시작과 끝에 관계없이 불투명하다', () => {
  for (const force of [0, 0.1, 0.8, 1, undefined]) for (const speed of [0.1, 2, 20]) {
    for (const distance of [0, 100, 300]) assert.equal(fountainInkOpacity({ force, speed }, distance, { length: 300 }), 1)
  }
})

test('펠트펜 미리보기 분할은 재질 레이어 수와 전역 질감 시드를 유지한다', () => {
  const points = Array.from({ length: 250 }, (_, i) => ({ x: i * 2, y: 60, inkDistance: i * 2 }))
  const parts = createStrokePreview().snapshot(points)
  const paths = feltMaterialLayers(parts, 16, 101)
  assert.equal(paths.length, 6)
  assert.ok(paths.every(path => path.length > 0 && !/NaN|Infinity/.test(path)))
})
