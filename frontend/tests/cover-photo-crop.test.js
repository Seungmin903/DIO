import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { coverPhotoAspect, applyCoverPhotoCrop, coverPhotoWithAspect, coverCropPhoto } from '../src/diary/utils/coverPhotoCrop.js'
import { newDiaryCover, normalizeCover } from '../src/diary/utils/coverDesign.js'


const crop = { fx: 0.8, fy: 0.2, zoom: 1.5 }
const imported = { src: 'media:original', mediaFileId: 'original', width: 1600, height: 900 }
function reopen(photo) {
  return normalizeCover(JSON.parse(JSON.stringify({ cover: { ...newDiaryCover(), kind: 'photo', photo } }))).photo
}

test('새 사진 크롭은 원본 비율과 위치를 저장하고 다시 열어도 동일하게 그린다', () => {
  const saved = applyCoverPhotoCrop({ ...coverPhotoWithAspect(imported), fresh: true }, crop)
  const restored = reopen(saved)
  assert.equal(restored.aspect, 1600 / 900)
  assert.deepEqual(restored.crop, crop)
  assert.equal('fresh' in saved, false)
  assert.equal('width' in saved, false)
  const layout = photo => coverCropPhoto(photo, 3 / 4)
  assert.deepEqual(layout(restored), layout(saved))
  assert.notDeepEqual(layout(restored), layout({ ...restored, crop: { fx: 0.5, fy: 0.5, zoom: 1 } }))
})

test('기존 표지의 원본 메타데이터로 비율을 복구해 재저장·재열기·재크롭한다', () => {
  const legacy = reopen({ src: imported.src, mediaFileId: imported.mediaFileId, crop })
  const aspect = coverPhotoAspect(legacy, imported)
  const restored = reopen(applyCoverPhotoCrop({ ...legacy, aspect }, legacy.crop))
  assert.equal(restored.aspect, 1600 / 900)
  assert.deepEqual(restored.crop, crop)
  const dialog = coverCropPhoto(restored, 3 / 4)
  assert.equal(dialog.imageWidth / dialog.imageHeight, 1600 / 900)
  assert.deepEqual(dialog.crop, crop)
})

test('잘못된 크기는 복구에 쓰지 않고 이미 저장된 유효한 비율을 우선한다', () => {
  assert.equal(coverPhotoAspect({ aspect: 2 }, imported), 2)
  for (const bad of [undefined, 0, -1, Infinity, NaN]) {
    assert.equal(coverPhotoAspect({ aspect: bad }, { width: 0, height: 10 }), null)
    assert.throws(() => applyCoverPhotoCrop({ aspect: bad }, crop), /사진 크기/)
  }
})

const require = createRequire(import.meta.url)
const expo = createRequire(require.resolve('expo/package.json'))
const code = expo('@babel/core').transformSync(readFileSync(new URL('../src/diary/hooks/useCoverPhotoAspect.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
}).code
function fixture() {
  let cursor = 0, uri = 'blob:first', entry
  const slots = [], effects = [], cleanups = [], requests = []
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value }] },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i][j]))) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  }
  const mocks = {
    react, 'react-native': { Image: { getSize: (uri, success, failure) => requests.push({ uri, success, failure }) } },
    '../../editor/hooks/useMediaUri': { useMediaUri: () => uri, useMediaEntry: () => entry },
    '../../editor/utils/mediaReferences.js': { mediaId: photo => photo?.mediaFileId },
    '../utils/coverPhotoCrop.js': { coverPhotoAspect },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, mod, mod.exports)
  return {
    requests, setUri: value => { uri = value }, setEntry: value => { entry = value },
    render(photo) { cursor = 0; const result = mod.exports.useCoverPhotoAspect(photo); while (effects.length) effects.shift()(); return result },
    unmount() { cleanups.forEach(fn => fn?.()) },
  }
}

test('기존 표지는 메타데이터 로딩 완료 즉시 복구하고 이미지 디코딩을 생략한다', () => {
  const ui = fixture()
  ui.setUri(null)
  assert.equal(ui.render({ crop }), null)
  ui.setEntry({ media: imported })
  ui.setUri('blob:first')
  assert.equal(ui.render({ crop }), 1600 / 900)
  assert.equal(ui.requests.length, 0)
})

test('메타데이터가 없는 원격 표지는 이미지 크기로 복구하며 다시 열어도 복구한다', () => {
  for (let opening = 0; opening < 2; opening++) {
    const ui = fixture()
    assert.equal(ui.render({ crop }), null)
    ui.requests[0].success(900, 1600)
    assert.equal(ui.render({ crop }), 900 / 1600)
    ui.unmount()
  }
})

test('사진 전환·언마운트 뒤 늦은 크기 응답은 현재 표지 비율을 덮어쓰지 않는다', () => {
  const ui = fixture()
  ui.render({ crop })
  ui.setUri('blob:second')
  assert.equal(ui.render({ crop }), null)
  ui.requests[0].success(1600, 900)
  assert.equal(ui.render({ crop }), null)
  ui.requests[1].success(900, 1600)
  assert.equal(ui.render({ crop }), 900 / 1600)
  ui.unmount()
  ui.requests[0].success(1, 1)
})

test('이미지 크기 조회 실패 시 가짜 정사각형 비율을 저장하지 않는다', () => {
  const ui = fixture()
  ui.render({ crop })
  ui.requests[0].failure(new Error('offline'))
  assert.equal(ui.render({ crop }), null)
})


test('실제 표지 사진 선택·적용 콜백도 비율을 누락하지 않고 저장한다', async () => {
  const babel = expo('@babel/core')
  const source = readFileSync(new URL('../src/diary/components/CoverOptions.js', import.meta.url), 'utf8')
  const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  const declaration = ast.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'PhotoOptions')
  assert.ok(declaration, 'PhotoOptions component must exist')
  const { code } = babel.transformFromAstSync({ ...ast, program: { ...ast.program, body: [declaration] } }, source, {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'classic' }]],
  })
  let cursor = 0, saved
  const slots = []
  const scope = {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment' },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } }, useEffect() {},
    useCoverPhotoAspect: () => null, pickImages: async () => [imported],
    coverCropPhoto, coverPhotoWithAspect, applyCoverPhotoCrop,
    OptionRow: 'OptionRow', View: 'View', Pressable: 'Pressable', Text: 'Text', Icon: 'Icon', OwnPhotoTile: 'OwnPhotoTile', PhotoCropper: 'PhotoCropper',
    styles: {}, mediaFailureMessage: error => error.message, discardGeneratedMedia: async () => {},
  }
  const Component = new Function(...Object.keys(scope), code + '\nreturn PhotoOptions;')(...Object.values(scope))
  const render = () => { cursor = 0; return Component({ cover: newDiaryCover(), ratio: 3 / 4, onChange: value => { saved = value } }) }
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of (node.props?.children ?? []).flat(Infinity)) { const result = find(child, predicate); if (result) return result }
    return null
  }
  const button = find(render(), node => node.props?.accessibilityLabel === '내 사진 고르기')
  assert.ok(button)
  await button.props.onPress()
  const dialog = find(render(), node => node.type === 'PhotoCropper')
  assert.ok(dialog)
  dialog.props.onApply({ crop, aspect: 3 / 4 })
  assert.equal(reopen(saved.photo).aspect, 1600 / 900)
  assert.deepEqual(reopen(saved.photo).crop, crop)
})

function loadFunction(relative, name, scope) {
  const babel = expo('@babel/core')
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
  const ast = babel.parseSync(source, { configFile: false, babelrc: false, parserOpts: { plugins: ['jsx'] } })
  const node = ast.program.body.map(item => item.type === 'ExportNamedDeclaration' ? item.declaration : item)
    .find(item => item?.type === 'FunctionDeclaration' && item.id.name === name)
  assert.ok(node, `${name} must exist`)
  const { code } = babel.transformFromAstSync({ ...ast, program: { ...ast.program, body: [node] } }, source, {
    configFile: false, babelrc: false, plugins: [[expo.resolve('@babel/plugin-transform-react-jsx'), { runtime: 'classic' }]],
  })
  return new Function(...Object.keys(scope), code + `\nreturn ${name};`)(...Object.values(scope))
}

test('실제 표지 렌더러는 같은 사진 재크롭 시 이미지에 직접 새 좌표를 전달하고 네이티브 뷰 키를 바꾼다', () => {
  const coverLayout = loadFunction('../src/editor/utils/objects.js', 'coverLayout', {})
  let box = null
  const OwnPhoto = loadFunction('../src/diary/components/CoverArt.js', 'OwnPhoto', {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: () => [box, value => { box = typeof value === 'function' ? value(box) : value }],
    useCoverPhotoAspect: photo => coverPhotoAspect(photo, imported),
    coverLayout, View: 'View', PhotoImage: 'PhotoImage', StyleSheet: { absoluteFill: {} }, styles: { photoClip: {} },
  })
  const photo = { src: imported.src, mediaFileId: imported.mediaFileId, crop: { fx: 0.5, fy: 0.5, zoom: 1 } }
  OwnPhoto({ photo }).props.onLayout({ nativeEvent: { layout: { width: 300, height: 400 } } })
  const before = OwnPhoto({ photo }).props.children[0]
  const after = OwnPhoto({ photo: { ...photo, crop } }).props.children[0]
  assert.equal(after.type, 'PhotoImage')
  assert.notEqual(before.props.key, after.props.key)
  assert.equal(after.props.contentFit, 'fill')
  assert.deepEqual(after.props.style, { position: 'absolute', ...coverLayout({ imageWidth: 1600 / 900, imageHeight: 1, crop }, 300, 400) })
  assert.ok(after.props.style.width > before.props.style.width)
  assert.notEqual(after.props.style.left, before.props.style.left)
  assert.equal(after.props.photo.src, before.props.photo.src)
})
