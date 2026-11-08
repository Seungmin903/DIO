import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { containCutout, cutoutPoint, cutoutPath, cutoutHistory, emptyCutout, hasCutoutSelection,
  previewCutoutSelection, cutoutSegmentInput, CUTOUT_MAX_STROKES, CUTOUT_MAX_POINTS } from '../src/editor/utils/stickerCutout.js'

const stroke = (mode = 'add') => ({ mode, width: .05, points: [{ x: .2, y: .3 }, { x: .8, y: .7 }] })
test('SAM 입력은 포함/제외 힌트와 사진 너비 대비 반지름으로 변환하고 원본 이력을 보존한다', () => {
  const state = { strokes: [stroke(), { ...stroke('exclude'), width: .12, points: [{ x: 0, y: 1 }] }], redo: [] }
  const input = cutoutSegmentInput('uploaded-image', state)
  assert.deepEqual(input, { imageId: 'uploaded-image', strokes: [
    { mode: 'include', size: .025, points: [{ x: .2, y: .3 }, { x: .8, y: .7 }] },
    { mode: 'exclude', size: .06, points: [{ x: 0, y: 1 }] },
  ] })
  input.strokes[0].points[0].x = 1
  assert.equal(state.strokes[0].points[0].x, .2)
  assert.equal(state.strokes[0].mode, 'add')
  assert.throws(() => cutoutSegmentInput('', state), /먼저 분석/)
  assert.throws(() => cutoutSegmentInput('image', emptyCutout()), /먼저 칠해/)
  assert.throws(() => cutoutSegmentInput('image', { strokes: [{ ...stroke(), width: -1 }] }), /입력/)
})
test('가로·세로 사진을 비율 유지해 배치하고 칠하기 좌표는 사진 내부만 정규화한다', () => {
  assert.deepEqual(containCutout({ width: 400, height: 200 }, { width: 200, height: 200 }), { x: 0, y: 50, width: 200, height: 100 })
  const rect = containCutout({ width: 200, height: 400 }, { width: 200, height: 200 })
  assert.deepEqual(rect, { x: 50, y: 0, width: 100, height: 200 })
  assert.deepEqual(cutoutPoint(50, 100, rect), { x: .5, y: .5 })
  assert.equal(cutoutPoint(-1, 100, rect), null)
  assert.equal(cutoutPoint(101, 100, rect), null)
  assert.equal(cutoutPoint(NaN, 100, rect), null)
  assert.equal(containCutout(null, { width: 100, height: 100 }), null)
  assert.match(cutoutPath(stroke(), { width: 400, height: 200 }), /^M80 60 L320 140$/)
})
test('추가·제외를 순서대로 보존하고 되돌리기·다시실행·새획·초기화를 격리한다', () => {
  const original = stroke()
  let state = cutoutHistory(emptyCutout(), { type: 'stroke', stroke: original })
  original.points[0].x = .9
  assert.equal(state.strokes[0].points[0].x, .2)
  state = cutoutHistory(state, { type: 'stroke', stroke: stroke('exclude') })
  assert.equal(state.strokes[1].mode, 'exclude')
  const undo = cutoutHistory(state, { type: 'undo' })
  assert.equal(undo.strokes.length, 1)
  assert.deepEqual(cutoutHistory(undo, { type: 'redo' }), state)
  const changed = cutoutHistory(undo, { type: 'stroke', stroke: stroke() })
  assert.equal(changed.redo.length, 0)
  assert.deepEqual(cutoutHistory(changed, { type: 'reset' }), emptyCutout())
  assert.equal(hasCutoutSelection(cutoutHistory(emptyCutout(), { type: 'stroke', stroke: stroke('exclude') })), false)
})
test('잘못된 좌표·굵기·모드와 과도한 입력은 기존 선택을 보존한다', () => {
  const state = cutoutHistory(emptyCutout(), { type: 'stroke', stroke: stroke() })
  for (const invalid of [{ ...stroke(), width: Infinity }, { ...stroke(), mode: 'bad' }, { ...stroke(), points: [] },
    { ...stroke(), points: [{ x: 2, y: .5 }] }, { ...stroke(), points: Array(CUTOUT_MAX_POINTS + 1).fill({ x: .5, y: .5 }) }])
    assert.equal(cutoutHistory(state, { type: 'stroke', stroke: invalid }), state)
  const full = { strokes: Array(CUTOUT_MAX_STROKES).fill(stroke()), redo: [] }
  assert.equal(cutoutHistory(full, { type: 'stroke', stroke: stroke() }), full)
})
test('결과 계약은 선택 목업임을 명시하고 원본과 독립된 입력을 반환한다', async () => {
  const source = { uri: 'file:///photo.png', width: 100, height: 200 }
  const state = cutoutHistory(emptyCutout(), { type: 'stroke', stroke: stroke() })
  const result = await previewCutoutSelection(source, state)
  assert.equal(result.kind, 'selection-preview')
  assert.equal(result.file, undefined)
  assert.equal(result.mediaFileId, undefined)
  result.strokes[0].points[0].x = .99
  assert.equal(state.strokes[0].points[0].x, .2)
  assert.equal(source.uri, 'file:///photo.png')
  await assert.rejects(previewCutoutSelection(source, emptyCutout()), /먼저 칠해/)
})

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
function pickerFixture(result, decodeFails = false) {
  const source = readFileSync(new URL('../src/editor/services/stickerCutout.js', import.meta.url), 'utf8')
  const { code } = expo('@babel/core').transformSync(source, { configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')] })
  const mod = { exports: {} }, revoked = []
  new Function('require', 'module', 'exports', 'URL', code)(id => id === 'react-native'
    ? { Image: { getSize: (_uri, ok, fail) => decodeFails ? fail(new Error('decode failed')) : ok(100, 200) } }
    : { selectImages: async () => result }, mod, mod.exports,
  { createObjectURL: () => 'blob:cutout', revokeObjectURL: uri => revoked.push(uri) })
  return { pick: mod.exports.pickCutoutPhoto, revoked }
}
test('사진 취소·영상/GIF·용량 초과는 파일을 만들지 않고 실패한 임시 URL을 해제한다', async () => {
  assert.equal(await pickerFixture({ canceled: true }).pick(), null)
  for (const asset of [{ fileName: 'video.mp4', mimeType: 'video/mp4' }, { fileName: 'moving.gif' }, { fileName: 'photo.jpg', fileSize: 21 * 1024 * 1024 }])
    await assert.rejects(pickerFixture({ assets: [asset] }).pick())
  const failed = pickerFixture({ assets: [{ file: { name: 'photo.png', type: 'image/png' } }] }, true)
  await assert.rejects(failed.pick(), /decode failed/)
  assert.deepEqual(failed.revoked, ['blob:cutout'])
  const valid = pickerFixture({ assets: [{ file: { name: 'photo.png', type: 'image/png' } }] })
  const source = await valid.pick()
  assert.equal(source.file.name, 'photo.png')
  assert.equal(source.mimeType, 'image/png')
  assert.equal(source.name, 'photo.png')
  assert.deepEqual(valid.revoked, [])
  source.dispose()
  assert.deepEqual(valid.revoked, ['blob:cutout'])
})

test('JPG·PNG·WebP 메타데이터만 허용하고 미상·지원 외·충돌 형식은 거부한다', async () => {
  for (const asset of [
    { uri: 'photo', mimeType: 'image/jpeg' }, { uri: 'photo', fileName: 'PHOTO.PNG' },
    { uri: 'photo', mimeType: 'application/octet-stream', fileName: 'photo.webp' },
    { uri: 'photo', mimeType: 'IMAGE/PNG; charset=binary' },
  ]) assert.ok(await pickerFixture({ assets: [asset] }).pick())
  for (const asset of [
    { uri: 'photo' }, { fileName: 'photo.bmp' }, { fileName: 'photo.tiff' }, { mimeType: 'image/avif' },
    { mimeType: 'image/heic', fileName: 'photo.jpg' }, { mimeType: 'image/jpeg', fileName: 'photo.tiff' },
    { mimeType: 'application/octet-stream', fileName: 'unknown' },
  ]) await assert.rejects(pickerFixture({ assets: [asset] }).pick(), /JPG·PNG·WebP/)
})

test('두 손가락 확대는 맞춤~6배이고 사진 가장자리가 판 안으로 들어오도록 끌리지 않는다', async () => {
  const { CUTOUT_ZOOM_MAX, clampCutoutView, zoomCutout } = await import('../src/editor/utils/stickerCutout.js')
  const area = { width: 300, height: 200 }, fit = containCutout({ width: 100, height: 100 }, area) // 200×200 이 가운데
  assert.deepEqual(clampCutoutView(fit, area, { zoom: .5, x: 40, y: 40 }), { zoom: 1, x: 0, y: 0 })
  assert.equal(clampCutoutView(fit, area, { zoom: 99, x: 0, y: 0 }).zoom, CUTOUT_ZOOM_MAX)
  // 2배 = 400×400: 가로 여유 (400-300)/2, 세로 여유 (400-200)/2
  assert.deepEqual(clampCutoutView(fit, area, { zoom: 2, x: 500, y: -500 }), { zoom: 2, x: 50, y: -100 })
  const rect = zoomCutout(fit, area, { zoom: 2, x: 500, y: -500 })
  assert.deepEqual(rect, { x: 0, y: -200, width: 400, height: 400 })
  // 확대한 칸 기준으로 칠한 점은 같은 사진 지점으로 정규화된다
  assert.deepEqual(cutoutPoint(200, 300, rect), { x: .5, y: .75 })
  // 1.2배 = 240×240: 가로는 판(300)보다 작아 가운데 고정, 세로만 움직인다
  assert.deepEqual(clampCutoutView(fit, area, { zoom: 1.2, x: 30, y: 30 }), { zoom: 1.2, x: 0, y: 20 })
})
