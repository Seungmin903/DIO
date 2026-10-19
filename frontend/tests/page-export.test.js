import test from 'node:test'
import assert from 'node:assert/strict'
import { createExportSnapshot, prepareExportSnapshot } from '../src/editor/utils/pageExport.js'
import { exportImage } from '../src/editor/utils/exportImage.web.js'
import { registerHooks } from 'node:module'

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
