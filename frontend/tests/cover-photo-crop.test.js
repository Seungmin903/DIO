import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { colors } from '../src/shared/theme.js'
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
  let cursor = 0, uri = 'blob:first', entry, reloads = 0
  const slots = [], effects = [], cleanups = [], requests = []
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || deps.some((v, j) => !Object.is(v, slots[i][j]))) { slots[i] = deps; effects.push(() => { cleanups[i]?.(); cleanups[i] = fn() }) } },
  }
  const mocks = {
    react, 'react-native': { Image: { getSize: (uri, success, failure) => requests.push({ uri, success, failure }) } },
    '../../editor/hooks/useMediaUri': { useMediaUri: () => uri, useMediaEntry: () => entry },
    '../../editor/services/mediaStore': { mediaService: { retryDisplay: async () => { reloads++ } } },
    '../../editor/utils/mediaReferences.js': { mediaId: photo => photo?.mediaFileId },
    '../utils/coverPhotoCrop.js': { coverPhotoAspect },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)(id => { assert.ok(id in mocks, id); return mocks[id] }, mod, mod.exports)
  return {
    requests, get reloads() { return reloads }, setUri: value => { uri = value }, setEntry: value => { entry = value },
    render(photo, options) { cursor = 0; const result = mod.exports.useCoverPhotoAspect({ src: imported.src, ...photo }, options); while (effects.length) effects.shift()(); return result },
    unmount() { cleanups.forEach(fn => fn?.()) },
  }
}

test('기존 표지는 메타데이터 로딩 완료 즉시 복구하고 이미지 디코딩을 생략한다', () => {
  const ui = fixture()
  ui.setUri(null)
  assert.equal(ui.render({ crop }).aspect, null)
  ui.setEntry({ media: imported })
  ui.setUri('blob:first')
  assert.equal(ui.render({ crop }).aspect, 1600 / 900)
  assert.equal(ui.requests.length, 0)
})

test('메타데이터가 없는 원격 표지는 이미지 크기로 복구하며 다시 열어도 복구한다', () => {
  for (let opening = 0; opening < 2; opening++) {
    const ui = fixture()
    assert.equal(ui.render({ crop }).aspect, null)
    ui.requests[0].success(900, 1600)
    assert.equal(ui.render({ crop }).aspect, 900 / 1600)
    ui.unmount()
  }
})

test('사진 전환·언마운트 뒤 늦은 크기 응답은 현재 표지 비율을 덮어쓰지 않는다', () => {
  const ui = fixture()
  ui.render({ crop })
  ui.setUri('blob:second')
  assert.equal(ui.render({ crop }).aspect, null)
  ui.requests[0].success(1600, 900)
  assert.equal(ui.render({ crop }).aspect, null)
  ui.requests[1].success(900, 1600)
  assert.equal(ui.render({ crop }).aspect, 900 / 1600)
  ui.unmount()
  ui.requests[0].success(1, 1)
})

test('이미지 크기 조회 실패 시 가짜 정사각형 비율을 저장하지 않는다', () => {
  const ui = fixture()
  ui.render({ crop })
  ui.requests[0].failure(new Error('offline'))
  assert.equal(ui.render({ crop }).aspect, null)
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
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } }, useEffect() {},
    useCoverPhotoAspect: () => ({ aspect: null, status: 'idle', retry() {} }), pickImages: async () => [imported],
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
    useCoverPhotoAspect: photo => ({ aspect: coverPhotoAspect(photo, imported), status: 'ready' }),
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


test('크기 조회 실패·재시도·성공을 구분하고 같은 URI의 이전 응답은 무시한다', () => {
  const ui = fixture()
  assert.equal(ui.render({ crop }).status, 'loading')
  ui.requests[0].failure(new Error('offline'))
  assert.equal(ui.render({ crop }).status, 'failed')
  ui.render({ crop }).retry()
  assert.equal(ui.render({ crop }).status, 'loading')
  assert.equal(ui.requests.length, 2)
  ui.requests[0].success(1, 1)
  assert.equal(ui.render({ crop }).aspect, null)
  ui.requests[1].success(1600, 900)
  const restored = ui.render({ crop })
  assert.equal(restored.status, 'ready')
  assert.equal(restored.aspect, 1600 / 900)
})

test('크기 응답이 유효하지 않으면 실패로 표시하고 재시도할 수 있다', () => {
  const ui = fixture()
  ui.render({ crop })
  ui.requests[0].success(0, 0)
  assert.equal(ui.render({ crop }).status, 'failed')
  ui.render({ crop }).retry()
  assert.equal(ui.render({ crop }).status, 'loading')
})

function optionsFixture({ photo = null, item = imported, apply = applyCoverPhotoCrop, cleanupFails = false } = {}) {
  let cursor = 0, saved, recovery = { aspect: null, status: 'idle', retry: () => retries++ }, retries = 0
  const slots = [], effects = [], notices = [], discarded = []
  const Component = loadFunction('../src/diary/components/CoverOptions.js', 'PhotoOptions', {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }), Fragment: 'Fragment' },
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value }] },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial } }, useEffect: fn => effects.push(fn),
    useCoverPhotoAspect: () => recovery, pickImages: async () => [item], coverCropPhoto, coverPhotoWithAspect, applyCoverPhotoCrop: apply,
    OptionRow: 'OptionRow', View: 'View', Pressable: 'Pressable', Text: 'Text', Icon: 'Icon', OwnPhotoTile: 'OwnPhotoTile', PhotoCropper: 'PhotoCropper',
    styles: {}, mediaFailureMessage: error => error.message, discardGeneratedMedia: async items => { discarded.push(...items); if (cleanupFails) throw new Error('cleanup failed') },
  })
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null
    if (predicate(node)) return node
    for (const child of (node.props?.children ?? []).flat(Infinity)) { const result = find(child, predicate); if (result) return result }
    return null
  }
  const ui = {
    notices, discarded, get saved() { return saved }, get retries() { return retries },
    setRecovery(value) { recovery = { ...recovery, ...value } },
    render() { cursor = 0; const tree = Component({ cover: { ...newDiaryCover(), photo }, ratio: 3 / 4, onChange: value => { saved = value }, onNotice: value => notices.push(value) }); while (effects.length) effects.shift()(); return tree },
    find: predicate => find(ui.render(), predicate),
  }
  return ui
}

test('크롭 적용 실패는 창 안과 상위 화면에 안내하고 선택을 유지한 채 다시 적용한다', async () => {
  let fail = true
  const ui = optionsFixture({ apply: (...args) => { if (fail) throw new Error('사진 크기를 확인하지 못했어요.'); return applyCoverPhotoCrop(...args) } })
  await ui.find(node => node.props?.accessibilityLabel === '내 사진 고르기').props.onPress()
  ui.find(node => node.type === 'PhotoCropper').props.onApply({ crop })
  assert.equal(ui.saved, undefined)
  assert.deepEqual(ui.notices, ['사진 크기를 확인하지 못했어요.'])
  const dialog = ui.find(node => node.type === 'PhotoCropper')
  assert.equal(dialog.props.notice, ui.notices[0])
  fail = false
  dialog.props.onApply({ crop })
  assert.deepEqual(ui.saved.photo.crop, crop)
  assert.equal(ui.find(node => node.type === 'PhotoCropper'), null)
})

test('사진 선택 시 크기가 없으면 자르기 창을 열지 않고 안내한다', async () => {
  const ui = optionsFixture({ item: { src: 'media:no-size' } })
  await ui.find(node => node.props?.accessibilityLabel === '내 사진 고르기').props.onPress()
  assert.equal(ui.find(node => node.type === 'PhotoCropper'), null)
  assert.deepEqual(ui.notices, ['사진 크기를 확인하지 못했어요.'])
})

test('복구 실패 안내·재시도·진행 중 안내와 자르기 버튼 상태를 구분하고 복구 비율을 저장에 반영한다', () => {
  const ui = optionsFixture({ photo: { src: imported.src, crop } })
  ui.setRecovery({ status: 'failed' })
  assert.equal(ui.find(node => node.props?.accessibilityLabel === '표지 사진 크기 확인 실패').props.disabled, true)
  assert.ok(ui.find(node => node.props?.accessibilityRole === 'alert'))
  ui.find(node => node.props?.accessibilityLabel === '표지 사진 크기 다시 확인').props.onPress()
  assert.equal(ui.retries, 1)
  ui.setRecovery({ status: 'loading' })
  assert.equal(ui.find(node => node.props?.accessibilityLabel === '표지 사진 크기 확인 중').props.disabled, true)
  assert.equal(ui.find(node => node.props?.accessibilityLabel === '표지 사진 크기 다시 확인'), null)
  ui.setRecovery({ status: 'ready', aspect: 1600 / 900 })
  assert.equal(ui.find(node => node.props?.accessibilityLabel === '표지 사진 자르기').props.disabled, false)
  assert.equal(ui.saved.photo.aspect, 1600 / 900)
  assert.deepEqual(ui.saved.photo.crop, crop)
})

test('복구 실패 시 저장된 크롭을 무시한 전체 사진을 미리보기로 표시하지 않는다', () => {
  const OwnPhoto = loadFunction('../src/diary/components/CoverArt.js', 'OwnPhoto', {
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: () => [null, () => {}], useCoverPhotoAspect: () => ({ aspect: null, status: 'failed' }),
    View: 'View', Icon: 'Icon', colors, StyleSheet: { absoluteFill: {} }, styles: { noPhoto: {} },
  })
  const result = OwnPhoto({ photo: { src: imported.src, crop } })
  assert.equal(result.props.accessibilityLabel, '표지 사진 크기 확인 실패')
  assert.equal(result.props.children[0].type, 'Icon')
  assert.equal(result.props.children[0].props.color, colors.surface)
})


test('원본 읽기부터 실패한 표지는 재시도 시 미디어를 다시 읽고 메타데이터로 복구한다', async () => {
  const ui = fixture()
  ui.setUri(null)
  ui.setEntry({ status: 'error' })
  assert.equal(ui.render({ mediaFileId: 'original', crop }).status, 'failed')
  ui.render({ mediaFileId: 'original', crop }).retry()
  await Promise.resolve()
  assert.equal(ui.reloads, 1)
  ui.setEntry({ status: 'ready', media: imported })
  ui.setUri('blob:reloaded')
  const result = ui.render({ mediaFileId: 'original', crop })
  assert.equal(result.status, 'ready')
  assert.equal(result.aspect, 1600 / 900)
})


test('비율 복구를 끈 표지는 이미지 크기를 조회하거나 재시도하지 않는다', () => {
  const ui = fixture()
  const idle = ui.render({ mediaFileId: 'original' }, { enabled: false })
  assert.equal(idle.status, 'idle')
  assert.equal(idle.aspect, null)
  idle.retry()
  ui.render({ mediaFileId: 'original' }, { enabled: false })
  assert.equal(ui.requests.length, 0)
  assert.equal(ui.reloads, 0)
  ui.render({ mediaFileId: 'original', crop }, { enabled: true })
  assert.equal(ui.requests.length, 1)
  ui.render({ mediaFileId: 'original' }, { enabled: false })
  ui.requests[0].success(900, 1600)
  assert.equal(ui.render({ mediaFileId: 'original' }, { enabled: false }).aspect, null)
})

test('실제 표지 렌더러는 크롭이 없는 사진의 비율 복구를 끈다', () => {
  let enabled
  const OwnPhoto = loadFunction('../src/diary/components/CoverArt.js', 'OwnPhoto', {
    React: { createElement: (type, props) => ({ type, props }) },
    useState: () => [null, () => {}],
    useCoverPhotoAspect: (photo, options) => { enabled = options.enabled; return { aspect: null, status: 'idle' } },
    PhotoImage: 'PhotoImage',
  })
  assert.equal(OwnPhoto({ photo: { src: imported.src } }).type, 'PhotoImage')
  assert.equal(enabled, false)
})

test('새 사진 크기 검증 실패 시 가져온 미디어만 정리하고 기존 표지는 유지한다', async () => {
  const old = { src: 'media:old', mediaFileId: 'old', aspect: 1, crop }
  const item = { src: 'media:invalid', mediaFileId: 'invalid', width: 0, height: 900 }
  const ui = optionsFixture({ photo: old, item })
  await ui.find(node => node.props?.accessibilityLabel === '내 사진 고르기').props.onPress()
  assert.deepEqual(ui.discarded, [item])
  assert.deepEqual(old.crop, crop)
  assert.equal(ui.saved, undefined)
  assert.equal(ui.find(node => node.type === 'PhotoCropper'), null)
  assert.deepEqual(ui.notices, ['사진 크기를 확인하지 못했어요.'])
})

test('정리 실패가 원래 크기 검증 안내를 가리지 않고 정상 사진은 적용 전 삭제하지 않는다', async () => {
  const broken = optionsFixture({ item: { src: 'media:broken' }, cleanupFails: true })
  await broken.find(node => node.props?.accessibilityLabel === '내 사진 고르기').props.onPress()
  assert.deepEqual(broken.notices, ['사진 크기를 확인하지 못했어요.'])
  const valid = optionsFixture()
  await valid.find(node => node.props?.accessibilityLabel === '내 사진 고르기').props.onPress()
  assert.deepEqual(valid.discarded, [])
  assert.ok(valid.find(node => node.type === 'PhotoCropper'))
})
