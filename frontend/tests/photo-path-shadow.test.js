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
  const defaults = { react: { memo: x => x, createContext: () => ({}), useContext: () => null, useEffect: () => {} },'react-native': { Platform: { OS: 'ios', select: o => o.ios ?? o.default }, StyleSheet: { create: x => x }, View: 'View' }, 'react-native-svg': { __esModule: true, default: 'Svg', ...svg }, '../../utils/effects': effects, '../../utils/svgId': { useSvgId: () => 'test-shadow' }, '../../utils/shapes': shapes, '../../../shared/theme': { colors: {} }, '../../hooks/useSvgImageUri': { useSvgImageUri: (_, uri) => ({ uri, failed: false }) } }
  new Function('require','module','exports',code)(id => mocks[id] ?? defaults[id] ?? (id === 'react/jsx-runtime' ? require(id) : { __esModule: true, default: id }), module, module.exports)
  return module.exports
}
const pathShadow = load('../src/editor/components/canvas/PhotoPathShadow.js').default

// 함수 컴포넌트(PhotoFramePicker · TileGrid)까지 펼쳐서 누를 수 있는 칸을 찾는다
const expand = n => !n || typeof n !== 'object' ? [] : typeof n.type === 'function' ? expand(n.type(n.props)) : [n, ...[n.props?.children].flat(Infinity).flatMap(expand)]
function loadPhotoOptions() {
  const constants = load('../src/editor/constants.js', { '../shared/layout': { TABLET_WIDTH: 1280, TABLET_HEIGHT: 800 } })
  const strip = load('../src/editor/utils/photoStrip.js')
  const objects = load('../src/editor/utils/objects.js', { '../constants': constants, './photoStrip': strip, './common': load('../src/editor/utils/common.js') })
  const frame = load('../src/editor/components/canvas/PhotoFrame.js', { '../../constants': constants })
  const view = load('../src/editor/components/canvas/ObjectView.js', {
    '../../hooks/useMediaUri': { useMediaUri: () => 'file:///original.jpg' },
    '../../stickerAssets': { isAnimatedMedia: () => false },
    '../../utils/objects': objects,
    '../../utils/photoStrip': strip,
    './PhotoFrame': { ...frame, __esModule: true, default: 'FrameBackdrop', StripBackdrop: 'StripBackdrop' },
  })
  const rn = { Pressable: 'Pressable', Text: 'Text', View: 'View', Image: 'Image', Platform: { OS: 'ios', select: o => o.ios ?? o.default }, StyleSheet: { create: x => x, absoluteFill: {} } }
  const picker = load('../src/editor/components/panels/PhotoFramePicker.js', {
    'react-native': rn, '../../constants': constants, '../../utils/objects': objects, '../../utils/photoStrip': strip,
    '../canvas/ObjectView': view, '../canvas/PhotoFrame': { ...frame, __esModule: true, default: 'FrameBackdrop', StripBackdrop: 'StripBackdrop' },
  })
  const options = load('../src/editor/components/panels/FrameOptions.js', {
    'react-native': rn, '../../constants': constants, '../../utils/objects': objects, '../../utils/photoStrip': strip,
    '../canvas/ObjectView': view, './PhotoFramePicker': picker,
  }).default
  return { constants, strip, objects, view, options }
}

test('사진 모양끼리 모든 전환 조합에서 선택 상태·렌더링·원본·중심을 유지한다', () => {
  const { constants, view, options } = loadPhotoOptions()
  // 틀은 보관함에서 붙일 때만 정한다. 옵션 패널은 틀 없는 사진의 모양만 바꾼다.
  const shapeChoices = constants.PHOTO_SHAPES.map(shape => ({ id: shape.id, kind: 'shape', label: `사진 모양 ${shape.name}` }))
  const pairs = shapeChoices.flatMap(source => shapeChoices.map(target => [source, target]))
  for (const [width, height] of [[160, 120], [120, 160], [160, 160]])
  for (const [source, target] of pairs) {
    let photo = { id: 'p', type: 'photo', frame: 'shape', shape: 'rect', x: 10, y: 20, w: width, h: height,
      imageWidth: width * 4, imageHeight: height * 4, mediaFileId: 'original', crop: { zoom: 1.5, fx: 0.2, fy: 0.4 } }
    const press = (label) => {
      const tree = expand(options({ photo, dispatch: action => { photo = { ...photo, ...action.patch } } }))
      tree.find(n => n.props.accessibilityLabel === label).props.onPress()
    }
    const apply = (choice) => {
      press(choice.label)
      const selected = expand(options({ photo, dispatch() {} })).filter(n => n.props.accessibilityState?.selected).map(n => n.props.accessibilityLabel)
      assert.deepEqual(selected, [choice.label])
      assert.ok(Math.abs(photo.x + photo.w / 2 - (10 + width / 2)) < 1e-8)
      assert.ok(Math.abs(photo.y + photo.h / 2 - (20 + height / 2)) < 1e-8)
      assert.equal(photo.mediaFileId, 'original')
      assert.equal(photo.w, width, `${source.id}→${target.id}: 모양 전환으로 기준 너비가 줄면 안 된다`)
      assert.deepEqual(photo.crop, { zoom: 1.5, fx: 0.2, fy: 0.4 })
      const rendered = nodes(view.PhotoContent({ photo, zoom: 1 }))
      const clip = rendered.find(n => n.type === 'ClipPath')
      if (['heart', 'star'].includes(choice.id)) {
        assert.equal(clip.props.children.props.d, shapes.shapePath(choice.id, photo.w, photo.h))
        assert.equal(rendered.find(n => n.type === 'Image').props.clipPath, `url(#${clip.props.id})`)
      } else assert.equal(clip, undefined)
      assert.equal(photo.shape, choice.id)
      assert.ok(!expand(options({ photo, dispatch() {} })).some(n => n.props.accessibilityLabel?.startsWith('사진 틀 ')), '옵션 패널에서 틀을 붙이거나 바꾸지 않는다')
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

test('액자는 고르는 목록에서 빠지고, 예전 문서의 액자는 그대로 그리며 틀 색을 바꿀 수 있다', () => {
  const { constants, objects, view, options } = loadPhotoOptions()
  assert.ok(!constants.PHOTO_FRAME_ASSETS.some(f => f.id === 'frame'))
  const legacy = { id: 'p', type: 'photo', frame: 'frame', ratio: 'original', x: 0, y: 0, w: 200, h: 240, imageWidth: 400, imageHeight: 400, mediaFileId: 'm', crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
  const inner = objects.photoInnerBox(legacy)
  assert.ok(Math.abs(inner.left - 26) < 1e-9 && Math.abs(inner.width - 148) < 1e-9)
  assert.equal(nodes(view.PhotoContent({ photo: legacy, zoom: 1 })).find(n => n.type === 'FrameBackdrop').props.frame, 'frame')
  const tree = expand(options({ photo: legacy, dispatch() {} }))
  assert.equal(tree.filter(n => n.props.accessibilityState?.selected).length, 0)
  assert.ok(tree.some(n => n.props.label === '틀 색상'))
})

test('티켓 4종은 오른쪽 칸만큼 안쪽 사진이 왼쪽으로 치우치고, 탑승권 사진은 글자 아래로 내려간다', () => {
  const { constants, objects } = loadPhotoOptions()
  const tickets = constants.PHOTO_FRAME_ASSETS.filter(f => f.id.startsWith('ticket')).map(f => f.id)
  assert.deepEqual(tickets, ['ticketConcert', 'ticketCinema', 'ticketMatch', 'ticketBoarding'])
  for (const frame of tickets) {
    const photo = objects.createPhoto({ src: 'a.jpg', imageWidth: 400, imageHeight: 300, frame }, { x: 500, y: 300 })
    const inner = objects.photoInnerBox(photo)
    const insets = constants.FRAME_INSETS[frame]
    assert.equal(photo.frame, frame)
    assert.ok(Math.abs(inner.left - photo.w * insets.side) < 1e-9)
    assert.ok(Math.abs(photo.w - inner.left - inner.width - photo.w * insets.right) < 1e-9)
    assert.ok(Math.abs(inner.top - photo.w * insets.top) < 1e-9)
    assert.ok(Math.abs(inner.width / inner.height - 4 / 3) < 1e-9)
  }
  assert.ok(constants.FRAME_INSETS.ticketBoarding.top > constants.FRAME_INSETS.ticketMatch.top)
})

test('티켓 · 인생네컷의 인쇄 글자는 기본 글자로 시작하고, 고친 칸만 바뀌며, 길면 줄이거나 … 로 자른다', () => {
  const { constants } = loadPhotoOptions()
  const frame = load('../src/editor/components/canvas/PhotoFrame.js', { '../../constants': constants })
  for (const id of ['ticketConcert', 'ticketCinema', 'ticketMatch', 'ticketBoarding', 'fourcut', 'filmstrip']) {
    const spec = constants.FRAME_TEXT[id]
    assert.ok(spec.fields.length > 0 && spec.fields.every(f => f.key in spec.defaults), id)
  }
  assert.equal(frame.frameTextOf('fourcut').caption, 'DIO 네컷')
  assert.deepEqual(frame.frameTextOf('ticketCinema', { title: '파묘' }), { ...constants.FRAME_TEXT.ticketCinema.defaults, title: '파묘' })
  assert.equal(frame.frameTextOf('ticketCinema', { detail: '' }).detail, '', '지운 칸은 비운다')
  assert.deepEqual(frame.fitLine('SHORT', 10, 200), { text: 'SHORT', size: 10 })
  const shrunk = frame.fitLine('ABCDEFGHIJ', 10, 50)
  assert.equal(shrunk.text, 'ABCDEFGHIJ'); assert.ok(shrunk.size < 10 && shrunk.size >= 6)
  const cut = frame.fitLine('아주 아주 긴 공연 이름이에요 정말로', 10, 60)
  assert.ok(cut.text.endsWith('…')); assert.equal(cut.size, 6)
})

test('보관함의 사진 틀은 사진 없이 빈 틀로 붙고, 빈 자리를 알려 준다', () => {
  const { constants, objects } = loadPhotoOptions()
  assert.ok(!constants.PHOTO_FRAME_ASSETS.some(f => f.id === 'none'), '보관함에는 없음이 없다')
  for (const asset of constants.PHOTO_FRAME_ASSETS) {
    const frame = objects.createObjectFromDecor({ kind: 'frame', frame: asset.id }, { x: 400, y: 300 })
    assert.equal(frame.type, 'photo')
    assert.equal(frame.frame, asset.id)
    assert.equal(objects.hasPhotoMedia(frame), false)
    assert.ok(Number.isFinite(frame.w) && Number.isFinite(frame.h) && frame.w > 0 && frame.h > 0, asset.id)
    assert.deepEqual(objects.emptyPhotoSlots(frame), asset.kind === 'strip' ? [0, 1, 2, 3] : [null])
  }
  // 사진을 넣으면 빈 자리가 없어진다
  const polaroid = objects.createObjectFromDecor({ kind: 'frame', frame: 'polaroid' }, { x: 400, y: 300 })
  assert.deepEqual(objects.emptyPhotoSlots({ ...polaroid, mediaFileId: 'm', imageWidth: 10, imageHeight: 10 }), [])
})

test('인생네컷·필름 4컷은 칸 순서대로 사진을 담는다', () => {
  const { strip, objects } = loadPhotoOptions()
  const pick = (id) => ({ src: `${id}.jpg`, mediaFileId: id, name: id, imageWidth: 300, imageHeight: 200 })
  const four = objects.createObjectFromDecor({ kind: 'photo', frame: 'fourcut', photos: [pick('a'), pick('b')] }, { x: 300, y: 300 })
  assert.equal(four.type, 'photo')
  assert.equal(four.name, '인생네컷')
  assert.deepEqual(four.cells.map(c => c?.mediaFileId ?? null), ['a', 'b', null, null])
  assert.ok(four.h > four.w * 2, '인생네컷은 세로로 긴 띠')
  const boxes = strip.stripCellBoxes(four)
  assert.equal(boxes.length, 4)
  for (const box of boxes) assert.ok(Math.abs(box.width / box.height - 4 / 3) < 1e-9)
  for (let i = 1; i < 4; i++) assert.ok(boxes[i].top > boxes[i - 1].top + boxes[i - 1].height, '칸은 겹치지 않는다')
  assert.ok(boxes[3].top + boxes[3].height < four.h, '아래 글자 띠')

  const film = objects.createObjectFromDecor({ kind: 'photo', frame: 'filmstrip', photos: [pick('a'), pick('b')] }, { x: 300, y: 300 })
  assert.ok(film.w > film.h * 3, '필름 4컷은 가로로 긴 띠')
  assert.deepEqual(film.cells.map(c => c?.mediaFileId ?? null), ['a', 'b', null, null])
})

test('여러 칸 틀은 누른 자리로 칸을 찾고, 여백·글자 띠는 칸이 아니다', () => {
  const { strip, objects } = loadPhotoOptions()
  for (const frame of ['fourcut', 'filmstrip']) {
    const photo = objects.createObjectFromDecor({ kind: 'photo', frame, photos: [] }, { x: 400, y: 300 })
    assert.deepEqual(photo.cells, [null, null, null, null], '빈 틀도 넣을 수 있다')
    strip.stripCellBoxes(photo).forEach((b, i) => assert.equal(strip.stripCellAt(photo, b.left + b.width / 2, b.top + b.height / 2), i))
    assert.equal(strip.stripCellAt(photo, 1, 1), -1)
    assert.equal(strip.stripCellAt(photo, photo.w / 2, photo.h - 1), -1)
  }
})

test('틀에 인쇄된 줄을 두 번 누르면 그 줄을 고치고, 사진 · 칸 자리는 글자 줄이 아니다', () => {
  const { constants, strip, objects, view } = loadPhotoOptions()
  const frame = load('../src/editor/components/canvas/PhotoFrame.js', { '../../constants': constants })
  const editor = load('../src/editor/components/canvas/FrameTextEditor.js', {
    '../../constants': constants, '../../utils/objects': objects, '../../utils/photoStrip': strip, './ObjectView': view, './PhotoFrame': frame,
  })
  const center = (line) => { const b = editor.lineBox(line); return [b.left + b.width / 2, b.top + b.height / 2] }
  for (const id of ['ticketConcert', 'ticketCinema', 'ticketMatch', 'ticketBoarding', 'fourcut', 'filmstrip']) {
    const photo = objects.createObjectFromDecor({ kind: 'frame', frame: id }, { x: 400, y: 300 })
    const lines = editor.frameTextLines(photo)
    const keys = constants.FRAME_TEXT[id].fields.map((f) => f.key)
    assert.deepEqual([...new Set(lines.map((l) => l.field))].sort(), [...keys].sort(), `${id}: 고칠 수 있는 칸마다 줄이 있다`)
    lines.forEach((line, i) => assert.equal(editor.frameTextAt(photo, ...center(line)), i, `${id} ${line.field}`))
    // 사진 자리(가운데)는 글자 줄이 아니다
    const boxes = strip.isStripFrame(id) ? strip.stripCellBoxes(photo) : [objects.photoInnerBox(photo)]
    for (const b of boxes) assert.equal(editor.frameTextAt(photo, b.left + b.width / 2, b.top + b.height / 2), -1, id)
  }
  assert.deepEqual(editor.frameTextLines({ type: 'photo', frame: 'polaroid', w: 100, h: 120 }), [], '글자 없는 틀')
  // 필름 4컷 번호는 칸마다 하나씩 늘고, 숫자로 시작하지 않으면 그대로 찍는다
  const film = objects.createObjectFromDecor({ kind: 'frame', frame: 'filmstrip' }, { x: 0, y: 0 })
  const numbers = editor.frameTextLines(film).filter((l) => l.field === 'number')
  assert.deepEqual(numbers.map((l) => frame.lineText(l, frame.frameTextOf('filmstrip'))), ['12A', '13A', '14A', '15A'])
  assert.deepEqual(numbers.map((l) => frame.lineText(l, { number: 'NO.' })), ['NO.', 'NO.', 'NO.', 'NO.'])
  // 셋째 칸에서 14A 를 20B 로 고치면 첫 칸은 18B
  assert.equal(editor.storedLineText(numbers[2], '20B'), '18B')
  assert.equal(editor.storedLineText(numbers[0], '20B'), '20B')
})

test('틀 바깥 선은 틀 안쪽에 그려 오른쪽 · 아래가 잘리지 않는다', () => {
  const { constants } = loadPhotoOptions()
  const frame = load('../src/editor/components/canvas/PhotoFrame.js', { '../../constants': constants })
  const edges = []
  const walk = (n) => !n || typeof n !== 'object' ? null : typeof n.type === 'function' ? walk(n.type(n.props)) : (n.type === 'Path' && n.props.stroke && edges.push(n.props), [n.props?.children].flat(Infinity).forEach(walk))
  for (const id of ['polaroid', 'stamp', 'ticketConcert', 'ticketCinema', 'ticketMatch', 'ticketBoarding']) {
    edges.length = 0
    walk(frame.default({ frame: id, width: 300, height: 150, inner: { left: 10, top: 10, width: 100, height: 100 }, color: '#FFFFFF' }))
    assert.equal(edges.length, 1, id)
    const [, dx] = /translate\(([\d.]+)/.exec(edges[0].transform)
    assert.ok(Number(dx) >= edges[0].strokeWidth / 2, `${id}: 선 두께 절반 이상 들여 그린다`)
    const xs = [...edges[0].d.matchAll(/[MLHA ]([\d.]+)/g)].map((m) => Number(m[1]))
    assert.ok(Math.max(...xs) + Number(dx) * 2 <= 300 + 1e-9, id)
  }
})

test('필름 구멍은 뚫린 자리(evenodd)이고 35mm 필름처럼 사진 한 장에 8개, 세로로 긴 둥근 네모다', () => {
  const { constants } = loadPhotoOptions()
  const frame = load('../src/editor/components/canvas/PhotoFrame.js', { '../../constants': constants })
  const mm = 10 // 1mm = 10, 필름 조각 너비 40mm (사진 36mm + 양옆 여백)
  const d = frame.filmPath(400, 300, 50, mm)
  const holes = d.split(' M').slice(1)
  assert.equal(holes.length, 16, '위아래 8개씩')
  const xs = holes.slice(0, 4).filter((_, i) => i % 2 === 0).map((h) => Number(/^([\d.]+)/.exec(h)[1]))
  assert.ok(Math.abs(xs[1] - xs[0] - 4.75 * mm) < 1e-9, '간격 4.75mm')
  const first = /^([\d.]+) ([\d.]+) H([\d.]+)/.exec(holes[0])
  assert.ok(Number(first[1]) - 0.5 * mm > 0, '끝 구멍도 가장자리에서 떨어져 있다')
  const film = []
  const walk = (n) => !n || typeof n !== 'object' ? null : typeof n.type === 'function' ? walk(n.type(n.props)) : (n.type === 'Path' && film.push(n.props), [n.props?.children].flat(Infinity).forEach(walk))
  walk(frame.default({ frame: 'film', width: 300, height: 260, inner: { left: 9, top: 39, width: 282, height: 182 } }))
  assert.equal(film[0].fillRule, 'evenodd')
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
    '../../utils/objects': { hasPhotoMedia: () => true, photoInnerBox: p => ({ left: 0, top: 0, width: p.w, height: p.h }), coverLayout: (_p,w,h) => ({ left: 0, top: 0, width: w, height: h }) },
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
    '../../utils/objects': { hasPhotoMedia: () => true, photoInnerBox: p => ({ left: 0, top: 0, width: p.w, height: p.h }), coverLayout: (_p,w,h) => ({ left: 0, top: 0, width: w, height: h }) },
    './PhotoFrame': { ...frame, __esModule: true, default: 'FrameBackdrop' },
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
