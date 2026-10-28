import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as effects from '../src/editor/utils/effects.js'
import * as shapes from '../src/editor/utils/shapes.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'
const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const nodes = n => !n || typeof n !== 'object' ? [] : [n, ...[n.props?.children].flat(Infinity).flatMap(nodes)]
function load(file, mocks = {}) {
  const { code } = expo('@babel/core').transformSync(readFileSync(new URL(file, import.meta.url), 'utf8'), { configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'automatic' }], expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const module = { exports: {} }
  const svg = Object.fromEntries(['ClipPath','Defs','Filter','FeGaussianBlur','G','Mask','Path','Rect','Image'].map(n => [n, n]))
  const defaults = { react: { memo: x => x, createContext: () => ({}), useContext: () => null }, 'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: x => x }, View: 'View' }, 'react-native-svg': { __esModule: true, default: 'Svg', ...svg }, '../../utils/effects': effects, '../../utils/svgId': { useSvgId: () => 'test-shadow' }, '../../utils/shapes': shapes, '../../../shared/theme': { colors: {} } }
  new Function('require','module','exports',code)(id => mocks[id] ?? defaults[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports
}
const pathShadow = load('../src/editor/components/canvas/PhotoPathShadow.js').default

test('사진 옵션 9종의 모든 전환 조합에서 선택 상태·렌더링·원본·중심을 유지한다', () => {
  const constants = load('../src/editor/constants.js', { '../shared/layout': { TABLET_WIDTH: 1280, TABLET_HEIGHT: 800 } })
  const objects = load('../src/editor/utils/objects.js', { '../constants': constants })
  const frame = load('../src/editor/components/canvas/PhotoFrame.js')
  const view = load('../src/editor/components/canvas/ObjectView.js', {
    '../../hooks/useMediaUri': { useMediaUri: () => 'file:///original.jpg' },
    '../../stickerAssets': { isAnimatedMedia: () => false },
    '../../utils/objects': objects,
    './PhotoFrame': { __esModule: true, default: 'FrameBackdrop', stampPath: frame.stampPath },
  })
  const options = load('../src/editor/components/panels/FrameOptions.js', {
    'react-native': { Pressable: 'Pressable', Text: 'Text', View: 'View', StyleSheet: { create: x => x } },
    '../../constants': constants,
    '../../utils/objects': objects,
    '../canvas/ObjectView': view,
  }).default
  for (const [width, height] of [[160, 120], [120, 160], [160, 160]])
  for (const source of constants.PHOTO_FRAMES) for (const target of constants.PHOTO_FRAMES) {
    let photo = { id: 'p', type: 'photo', frame: 'shape', shape: 'rect', x: 10, y: 20, w: width, h: height,
      imageWidth: width * 4, imageHeight: height * 4, mediaFileId: 'original', crop: { zoom: 1.5, fx: 0.2, fy: 0.4 } }
    const apply = (frame) => {
      const tree = options({ photo, dispatch: action => { photo = { ...photo, ...action.patch } } })
      nodes(tree).find(n => n.props.accessibilityLabel === `틀 모양 ${frame.name}`).props.onPress()
      const selected = nodes(options({ photo, dispatch() {} })).filter(n => n.props.accessibilityState?.selected)
      assert.equal(selected.length, 1)
      assert.equal(selected[0].props.accessibilityLabel, `틀 모양 ${frame.name}`)
      assert.ok(Math.abs(photo.x + photo.w / 2 - (10 + width / 2)) < 1e-8)
      assert.ok(Math.abs(photo.y + photo.h / 2 - (20 + height / 2)) < 1e-8)
      assert.equal(photo.mediaFileId, 'original')
      assert.equal(photo.w, width, `${source.id}→${target.id}: 모양 전환으로 기준 너비가 줄면 안 된다`)
      assert.deepEqual(photo.crop, { zoom: 1.5, fx: 0.2, fy: 0.4 })
      const rendered = nodes(view.PhotoContent({ photo, zoom: 1 }))
      const clip = rendered.find(n => n.type === 'ClipPath')
      if (['heart', 'star'].includes(frame.id)) {
        assert.equal(clip.props.children.props.d, shapes.shapePath(frame.id, photo.w, photo.h))
        assert.equal(rendered.find(n => n.type === 'Image').props.clipPath, `url(#${clip.props.id})`)
      } else assert.equal(clip, undefined)
      if (frame.kind === 'border') assert.equal(photo.frame, frame.id)
      else assert.equal(photo.shape, frame.id)
      assert.ok(Number.isFinite(photo.w) && photo.w > 0 && Number.isFinite(photo.h) && photo.h > 0)
      // 저장·재진입 시 사용하는 JSON에도 선택한 틀/모양이 유지된다.
      photo = JSON.parse(JSON.stringify(photo))
    }
    apply(source)
    const before = { x: photo.x, y: photo.y, w: photo.w, h: photo.h }
    apply(target)
    apply(source)
    assert.deepEqual({ x: photo.x, y: photo.y, w: photo.w, h: photo.h }, before, `${source.id}→${target.id}→${source.id}: 이전 크기·비율 복원`)
  }
})

test('사진 모양·복원 비율은 Undo/Redo와 출력 스냅샷에 보존된다', () => {
  const photo = { id: 'p', type: 'photo', frame: 'shape', shape: 'rect', x: 10, y: 20, w: 160, h: 120,
    imageWidth: 640, imageHeight: 480, mediaFileId: 'original', crop: { zoom: 1, fx: 0.5, fy: 0.5 } }
  const first = createInitialState({ pages: [{ id: 'page', objects: [photo] }] })
  const changed = editorReducer(first, { type: 'updateObject', id: 'p', record: true,
    patch: { shape: 'heart', h: 160, y: 0, shapeAspectRatio: 4 / 3 } })
  assert.deepEqual(editorReducer(changed, { type: 'undo' }).doc.pages[0].objects[0], photo)
  const restored = editorReducer(editorReducer(changed, { type: 'undo' }), { type: 'redo' })
  const output = createExportSnapshot(restored.doc.pages[0]).objects[0]
  assert.equal(output.shape, 'heart')
  assert.equal(output.shapeAspectRatio, 4 / 3)
  assert.equal(output.mediaFileId, 'original')
  assert.deepEqual(output.crop, photo.crop)
})

test('하트·별 전환은 SVG와 클립 식별자를 함께 교체하고 인스턴스별로 분리한다', () => {
  let instance = 'photo-main'
  const view = load('../src/editor/components/canvas/ObjectView.js', {
    '../../utils/svgId': { useSvgId: () => instance },
    '../../hooks/useMediaUri': { useMediaUri: () => 'file:///photo.jpg' },
    '../../stickerAssets': { isAnimatedMedia: () => false },
    '../../utils/objects': { photoInnerBox: p => ({ left: 0, top: 0, width: p.w, height: p.h }), coverLayout: (_p,w,h) => ({ left: 0, top: 0, width: w, height: h }) },
  })
  const photo = { id: 'p', type: 'photo', frame: 'shape', w: 100, h: 80 }
  for (const shape of ['heart', 'star', 'heart', 'circle', 'rect', 'star']) {
    const tree = view.PhotoContent({ photo: { ...photo, shape }, zoom: 1 })
    const svg = nodes(tree).find(n => n.type === 'Svg')
    if (shape === 'circle' || shape === 'rect') {
      assert.equal(svg, undefined)
      continue
    }
    assert.equal(svg.key, shape)
    const clip = nodes(tree).find(n => n.type === 'ClipPath')
    const image = nodes(tree).find(n => n.type === 'Image')
    assert.equal(clip.props.id, `${instance}-${shape}`)
    assert.equal(clip.props.children.props.d, shapes.shapePath(shape, 100, 80))
    assert.equal(image.props.clipPath, `url(#${clip.props.id})`)
    assert.equal(image.props.href.uri, 'file:///photo.jpg')
  }
  instance = 'photo-thumbnail'
  const thumbnail = view.PhotoContent({ photo: { ...photo, shape: 'heart' }, zoom: 0.2 })
  assert.equal(nodes(thumbnail).find(n => n.type === 'ClipPath').props.id, 'photo-thumbnail-heart')
})
test('바깥 그림자는 모양 경로·방향·색·흐림·퍼짐을 반영하고 SVG 여백을 확보한다', () => {
  const shadow = effects.shadowOf({ shadow: true, shadowDirection: 'r', shadowDistance: 10, shadowSpread: 3, shadowBlur: 8, shadowColor: '#FF0000', shadowOpacity: 0.4 })
  const tree = pathShadow({ d: shapes.shapePath('heart', 100, 80), width: 100, height: 80, shadow, zoom: 2, flipY: true })
  assert.ok(tree.props.width > 140)
  assert.equal(nodes(tree).find(n => n.type === 'FeGaussianBlur').props.stdDeviation, 8)
  const path = nodes(tree).find(n => n.type === 'Path' && n.props.stroke)
  assert.equal(path.props.strokeWidth, 12)
  assert.equal(path.props.fill, '#FF0000')
  assert.match(path.props.transform, /scale\(1 -1\)/)
  assert.ok(nodes(tree).some(n => n.props.transform === 'translate(20 0)'))
})
test('안쪽 그림자는 모양 안에 클리핑하고 비활성 상태에서는 아무것도 그리지 않는다', () => {
  const shadow = { ...effects.shadowOf({ shadow: true }), inset: true }
  const tree = pathShadow({ d: shapes.shapePath('star', 100, 100), width: 100, height: 100, shadow, zoom: 1 })
  assert.ok(nodes(tree).some(n => n.type === 'Mask' && n.props.maskType === 'luminance'))
  assert.ok(nodes(tree).some(n => n.props.clipPath === 'url(#test-shadow-clip)'))
  assert.equal(pathShadow({ d: '', width: 100, height: 100, shadow: { on: false }, zoom: 1 }), null)
})
test('사진 렌더러는 하트·별·우표에 그림자 경로를 연결하고 다른 사진은 기존 방식을 유지한다', () => {
  const frame = load('../src/editor/components/canvas/PhotoFrame.js')
  const view = load('../src/editor/components/canvas/ObjectView.js', {
    '../../hooks/useMediaUri': { useMediaUri: () => 'data:image/png;base64,fixture' },
    '../../stickerAssets': { isAnimatedMedia: () => false },
    '../../utils/objects': { photoInnerBox: p => ({ left: 0, top: 0, width: p.w, height: p.h }), coverLayout: (_p,w,h) => ({ left: 0, top: 0, width: w, height: h }) },
    './PhotoFrame': { __esModule: true, default: 'FrameBackdrop', stampPath: frame.stampPath },
  })
  for (const photo of [{ frame: 'shape', shape: 'heart' }, { frame: 'shape', shape: 'star' }, { frame: 'stamp' }]) {
    for (const shadowInset of [false, true]) {
      const p = { id: 'p', type: 'photo', w: 100, h: 80, shadow: true, shadowInset, ...photo }
      assert.equal(view.photoSupportsShadow(p), true)
      const tree = view.PhotoContent({ photo: p, zoom: 1 })
      const layers = nodes(tree).filter(n => n.type === './PhotoPathShadow')
      assert.equal(layers.length, 1)
      assert.equal(layers[0].props.shadow.on, true)
      assert.equal(layers[0].props.shadow.inset, shadowInset)
      assert.ok(layers[0].props.d)
    }
  }
  const regular = view.PhotoContent({ photo: { frame: 'shape', shape: 'rect', w: 100, h: 80, shadow: true }, zoom: 1 })
  assert.ok(regular.props.style.some(s => s?.boxShadow))
})
