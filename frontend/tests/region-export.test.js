import { pngQualityWarning, pageImageQuality } from '../src/editor/utils/pageImageQuality.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { createRegionExportSnapshot, exportObjectPosition } from '../src/editor/utils/regionExport.js'
import { prepareExportSnapshot, createExportSnapshot } from '../src/editor/utils/pageExport.js'
import { exportRasterSize } from '../src/editor/utils/exportSampling.js'

const photo = { id: 'photo', type: 'photo', x: 80, y: 60, w: 300, h: 200, rotation: 30, src: 'media:test', crop: { zoom: 2, x: 0.1 } }
const page = () => ({ id: 'p', objects: [structuredClone(photo), { ...photo, id: 'hidden', hidden: true }] })
const options = { pageWidth: 1280, pageHeight: 800, region: { x: 100.5, y: 80.25, width: 400, height: 500 }, title: '여행/일기', now: new Date(2026, 9, 20, 14, 5, 6, 7) }

test('영역 출력은 소수 좌표·회전·크롭·겹침 순서와 깊은 복사, 고정 파일명을 보존한다', () => {
  const input = page(), original = structuredClone(input)
  const snapshot = createRegionExportSnapshot(input, { ...options, preset: 'portrait' })
  assert.equal(snapshot.pixelWidth, 1080); assert.equal(snapshot.pixelHeight, 1350)
  assert.equal(snapshot.width, 400); assert.equal(snapshot.height, 500)
  assert.deepEqual(snapshot.objects, [photo]); assert.deepEqual(input, original)
  input.objects[0].crop.zoom = 5; options.region.x = 101
  assert.equal(snapshot.objects[0].crop.zoom, 2); assert.equal(snapshot.region.x, 100.5)
  assert.match(snapshot.fileName, /^DIO_여행_일기_p01_region_portrait_20261020_140506_007\.png$/)
  options.region.x = 100.5
  assert.deepEqual(exportObjectPosition(photo, snapshot, 2), { left: -41, top: -40.5 })
})

test('영역·비율·3배 확인·6배 상한은 UI와 별개로 강제한다', () => {
  const snap = extra => createRegionExportSnapshot(page(), { ...options, ...extra })
  for (const region of [null, { x: -1, y: 0, width: 400, height: 500 }, { x: 0, y: 0, width: 31, height: 500 }, { x: 1000, y: 0, width: 400, height: 500 }, { x: NaN, y: 0, width: 400, height: 500 }]) {
    assert.throws(() => snap({ region }), { code: 'EXPORT_REGION_INVALID' })
  }
  assert.throws(() => snap({ preset: 'missing' }), { code: 'EXPORT_REGION_RATIO_INVALID' })
  assert.throws(() => snap({ preset: 'square' }), { code: 'EXPORT_REGION_RATIO_INVALID' })
  const region = { x: 0, y: 0, width: 200, height: 250 }
  assert.throws(() => snap({ region, preset: 'portrait' }), { code: 'EXPORT_REGION_UPSCALE_CONFIRM_REQUIRED' })
  assert.equal(snap({ region, preset: 'portrait', upscaleConfirmed: true }).pixelHeight, 1350)
  assert.throws(() => snap({ region: { ...region, width: 160, height: 200 }, preset: 'portrait', upscaleConfirmed: true }), { code: 'EXPORT_REGION_UPSCALE_LIMIT' })
})

test('자유 전체 영역의 2배와 기존 전체 PNG 1배는 분리하고 경계 오차만 정규화한다', () => {
  const whole = createRegionExportSnapshot(page(), { ...options, region: { x: 0, y: 0, width: 1280, height: 800 } })
  assert.deepEqual([whole.pixelWidth, whole.pixelHeight], [2560, 1600])
  assert.deepEqual([createExportSnapshot(page(), { width: 1280, height: 800 }).pixelWidth, createExportSnapshot(page(), { width: 1280, height: 800 }).pixelHeight], [1280, 800])
  const edge = createRegionExportSnapshot(page(), { ...options, region: { x: 1000, y: 0, width: 280 + 1e-7, height: 500 } })
  assert.equal(edge.region.width, 280)
  assert.deepEqual(exportRasterSize([photo], whole, { width: 1200, height: 800 }), { width: 1200, height: 800 })
})

test('영역 밖 소재도 준비하고 실패하면 준비 자원은 해제하며 부분 출력을 반환하지 않는다', async () => {
  const input = page(); input.objects.push({ ...photo, id: 'outside', x: 1000, src: 'missing' })
  const snapshot = createRegionExportSnapshot(input, options)
  let disposed = 0; const seen = []
  await assert.rejects(prepareExportSnapshot(snapshot, async object => {
    seen.push(object.id)
    if (object.id === 'outside') throw new Error('missing')
    return { uri: 'blob:prepared', dispose() { disposed++ } }
  }), { code: 'EXPORT_MEDIA_FAILED' })
  assert.deepEqual(seen, ['photo', 'outside']); assert.equal(disposed, 1)
  assert.equal(input.objects[0].src, 'media:test')
})


test('영역 내보내기는 페이지 규격 생략을 거부하고 동적 속지 규격을 보존한다', () => {
  assert.throws(() => createRegionExportSnapshot(page(), { region: options.region }), { code: 'EXPORT_REGION_INVALID' })
  assert.throws(() => createRegionExportSnapshot(page(), { ...options, pageWidth: undefined }), { code: 'EXPORT_REGION_INVALID' })
  const input = { ...page(), canvasWidth: 1024, canvasHeight: 768 }
  const snapshot = createRegionExportSnapshot(input, { ...options, pageWidth: 1024, pageHeight: 768 })
  assert.deepEqual([snapshot.pageWidth, snapshot.pageHeight], [1024, 768])
  assert.deepEqual(exportObjectPosition({x:0,y:0}, snapshot), {left:-100.5,top:-80.25})
})

test('네이티브 확대 진단은 PNG 화질 경고를 제공하고 웹과 충분한 픽셀에서는 숨긴다', () => {
  const snapshot = { width:200, height:200, pixelWidth:1080, pixelHeight:1080 }
  const native=pageImageQuality(snapshot,{platform:'ios',scale:1,pixelRatio:2})
  assert.equal(native.upscaled,true)
  assert.match(pngQualityWarning(native),/400 × 400px/)
  assert.match(pngQualityWarning(native),/1080 × 1080px/)
  assert.equal(pngQualityWarning(pageImageQuality(snapshot,{platform:'web'})),null)
  assert.equal(pngQualityWarning(pageImageQuality(snapshot,{platform:'android',scale:2,pixelRatio:3})),null)
  assert.equal(pngQualityWarning(undefined),null)
})
