import test from 'node:test'
import assert from 'node:assert/strict'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { exportImage } from '../src/editor/utils/exportImage.web.js'
import { registerHooks } from 'node:module'
import { exportRasterSize, selectExportRaster, parseImageDataUri } from '../src/editor/utils/exportSampling.js'

test('48MP 사진은 출력 배율과 자르기 확대에 충분한 표시본을 선택한다', () => {
  const record = { blob: 'original-48mp', displayBlob: 'display-2048', media: { width: 8000, height: 6000, display: { width: 2048, height: 1536 } } }
  const snapshot = { width: 1188, height: 840, pixelWidth: 1188, pixelHeight: 840 }
  const objects = [{ w: 260, h: 195, crop: { zoom: 2 } }]
  assert.deepEqual(exportRasterSize(objects, snapshot, record.media), { width: 520, height: 390 })
  const selected = selectExportRaster(record, objects, snapshot)
  assert.equal(selected.blob, 'display-2048')
  assert.equal(selected.selected, 'display')
  assert.throws(() => selectExportRaster(record, [{ w: 260, h: 195, crop: { zoom: 20 } }], snapshot), { code: 'EXPORT_RASTER_TOO_LARGE' })
})

test('중복 소재는 가장 큰 출력 사용처까지 전달하고 GIF 안내에 요소 이름을 남긴다', async () => {
  const snapshot = createExportSnapshot({ objects: [object('one', { name: '고양이', w: 100 }), object('copy', { mediaFileId: 'one', w: 500 })] })
  let widths
  await assert.rejects(prepareExportSnapshot(snapshot, async (_, usages) => {
    widths = usages.map((o) => o.w)
    throw Object.assign(new Error('GIF'), { code: 'EXPORT_GIF_PENDING' })
  }), (error) => error.code === 'EXPORT_GIF_PENDING' && error.message.includes('고양이'))
  assert.deepEqual(widths, [100, 500])
})

test('이전 문서 data URI는 base64 이미지만 허용한다', () => {
  assert.equal(parseImageDataUri('data:image/png;base64,aGVsbG8=').base64, 'aGVsbG8=')
  assert.throws(() => parseImageDataUri('data:text/html;base64,aGVsbG8='), { code: 'EXPORT_DATA_URI_INVALID' })
  assert.throws(() => parseImageDataUri('data:image/png;base64,%%%'), { code: 'EXPORT_DATA_URI_INVALID' })
})

test('네이티브 data URI를 임시 파일로 읽고 작업 종료 시 그 파일만 지운다', async (t) => {
  const files = new Map()
  class File {
    constructor(...parts) { this.uri = parts.join('/') }
    get exists() { return files.has(this.uri) }
    create() { files.set(this.uri, '') }
    write(value, options) { assert.equal(options.encoding, 'base64'); files.set(this.uri, value) }
    delete() { files.delete(this.uri) }
  }
  const sources = {
    'expo-file-system': 'export const {File,Paths}=globalThis.__legacyExport;export const FileMode={ReadOnly:"r"}',
    'expo-crypto': 'export const randomUUID=()=>"test-legacy"',
    'react-native': 'export const Image={}',
    'expo-image-manipulator': 'export const ImageManipulator={},SaveFormat={JPEG:"jpeg",PNG:"png"}',
  }
  globalThis.__legacyExport = { File, Paths: { cache: 'file:///cache' } }
  const hooks = registerHooks({
    resolve(s, c, next) { return sources[s] ? { url: 'legacy-export:' + s, shortCircuit: true } : next(s, c) },
    load(u, c, next) { return u.startsWith('legacy-export:') ? { format: 'module', source: sources[u.slice(14)], shortCircuit: true } : next(u, c) },
  })
  t.after(() => { hooks.deregister(); delete globalThis.__legacyExport })
  const { readLegacyExportImage } = await import('../src/editor/utils/exportImage.native.js')
  const input = await readLegacyExportImage('data:image/png;base64,aGVsbG8=')
  assert.ok(input.blob.uri.startsWith('file:///cache/dio-export-'))
  assert.equal(files.size, 1)
  input.dispose()
  assert.equal(files.size, 0)
})

const object = (id, patch = {}) => ({ id, type: 'photo', x: 10, y: 20, w: 100, h: 200, rotation: 12, mediaFileId: id, ...patch })

test('줌·격자·커서·선택과 독립적으로 최신 상태와 뒤→앞 순서를 복사한다', () => {
  const page = { id: 'page', zoom: 0.3, gridVisible: true, selectedIds: ['back'], cursor: { x: 1 }, objects: [object('back'), object('hidden', { hidden: true }), object('transparent', { opacity: 0 }), object('front')] }
  const snapshot = createExportSnapshot(page)
  page.objects[0].x = 999
  assert.deepEqual(snapshot.objects.map((o) => o.id), ['back', 'front'])
  assert.equal(snapshot.objects[0].x, 10)
  assert.equal(snapshot.pixelWidth, 1188)
  assert.equal(snapshot.pixelHeight, 840)
  assert.equal(snapshot.background, '#FFFFFF')
  for (const key of ['zoom', 'gridVisible', 'selectedIds', 'cursor']) assert.equal(key in snapshot, false)
})

test('출력 배율과 안전 상한은 화면 DPR과 독립적이며 잘못된 입력은 중단한다', () => {
  const page = { objects: [] }
  const doubled = createExportSnapshot(page, { scale: 2 })
  assert.deepEqual([doubled.pixelWidth, doubled.pixelHeight], [2376, 1680])
  const limited = createExportSnapshot(page, { width: 8000, height: 6000, scale: 2 })
  assert.ok(limited.pixelWidth <= 4096 && limited.pixelWidth * limited.pixelHeight <= 8000000)
  assert.throws(() => createExportSnapshot(page, { scale: Infinity }), { code: 'EXPORT_SIZE_INVALID' })
  assert.throws(() => createExportSnapshot({ objects: [object('broken', { x: NaN })] }), { code: 'EXPORT_GEOMETRY_INVALID' })
  assert.throws(() => createExportSnapshot({ objects: [object('text', { type: 'text' })] }), { code: 'EXPORT_ELEMENT_UNSUPPORTED' })
})

test('중복 원본은 한 번 준비하고 출력 작업 자원만 한 번 해제한다', async () => {
  const page = { objects: [object('one'), object('copy', { mediaFileId: 'one', poster: 'small-thumbnail' })] }
  const before = JSON.stringify(page)
  let reads = 0, disposed = 0
  const prepared = await prepareExportSnapshot(createExportSnapshot(page), async (o) => {
    assert.equal(o.mediaFileId, 'one'); reads++
    return { uri: 'blob:original-export', dispose: () => disposed++ }
  })
  assert.equal(reads, 1)
  assert.ok(prepared.objects.every((o) => o.src === 'blob:original-export' && !o.poster && !o.mediaFileId))
  assert.equal(JSON.stringify(page), before)
  prepared.dispose(); prepared.dispose()
  assert.equal(disposed, 1)
})

test('보이는 필수 원본 하나라도 실패하면 이전 출력 자원을 정리하고 문서를 유지한다', async () => {
  const page = { objects: [object('one'), object('missing')] }
  const before = JSON.stringify(page)
  let disposed = 0
  await assert.rejects(prepareExportSnapshot(createExportSnapshot(page), async (o) => {
    if (o.id === 'missing') throw new Error('Missing original')
    return { uri: 'blob:one', dispose: () => disposed++ }
  }), { code: 'EXPORT_MEDIA_FAILED' })
  assert.equal(disposed, 1)
  assert.equal(JSON.stringify(page), before)
})

test('GIF는 재생 화면이나 작은 poster를 출력하지 않고 명시적으로 중단한다', async () => {
  await assert.rejects(exportImage({ blob: new Blob(['GIF89a-frames']) }), { code: 'EXPORT_GIF_PENDING' })
})

test('네이티브는 전용 영역을 지정한 PNG 픽셀 크기로 캡처하고 임시 결과만 해제한다', async (t) => {
  let captured, released
  globalThis.__exportNative = {
    captureRef: async (node, options) => { captured = { node, options }; return 'file:///export.png' },
    releaseCapture: (uri) => { released = uri },
  }
  const hooks = registerHooks({
    resolve(specifier, context, next) { return specifier === 'react-native-view-shot' ? { url: 'export-test:view-shot', shortCircuit: true } : next(specifier, context) },
    load(url, context, next) { return url === 'export-test:view-shot' ? { format: 'module', source: 'export const {captureRef,releaseCapture}=globalThis.__exportNative', shortCircuit: true } : next(url, context) },
  })
  t.after(() => { hooks.deregister(); delete globalThis.__exportNative })
  const { capturePage } = await import('../src/editor/utils/capturePage.native.js')
  const output = await capturePage('export-surface', createExportSnapshot({ objects: [] }))
  assert.equal(captured.node, 'export-surface')
  assert.deepEqual(captured.options, { format: 'png', result: 'tmpfile', width: 1188, height: 840 })
  output.dispose()
  assert.equal(released, 'file:///export.png')
})
