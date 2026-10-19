import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { indexedDB, IDBObjectStore } from 'fake-indexeddb'
import { checkDimensions, checkSize, detectMediaType, displayDimensions, MEDIA_POLICY } from '../src/editor/utils/mediaPolicy.js'
import { attachMediaPreviews, createMediaImporter } from '../src/editor/utils/mediaImport.js'
import { selectImages } from '../src/editor/utils/mediaPicker.web.js'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const gif = new TextEncoder().encode('GIF89a')
const heic = new Uint8Array([0, 0, 0, 24, ...new TextEncoder().encode('ftypmif1'), 0, 0, 0, 0, ...new TextEncoder().encode('heicmif1')])
const code = (expected) => (error) => error.code === expected

test('웹 picker는 HEIC를 사전 디코딩하지 않고 파일을 반환하며 취소 시 정리한다', async (t) => {
  const previousDocument = globalThis.document
  const previousWindow = globalThis.window
  let input
  let removed = 0
  let opened = 0
  const listeners = new Set()
  globalThis.document = {
    createElement: () => (input = { style: {}, click: () => { opened += 1 }, remove: () => { removed += 1 } }),
    body: { appendChild() {} },
  }
  globalThis.window = { addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) }
  t.after(() => { globalThis.document = previousDocument; globalThis.window = previousWindow })
  const pending = selectImages({ multiple: true })
  assert.equal(opened, 1) // 사용자 클릭과 같은 실행 구간에서 즉시 열린다.
  const file = new File([heic], 'test.heic', { type: 'image/heic' })
  input.files = [file]
  input.onchange()
  assert.equal((await pending).assets[0].file, file)
  assert.equal(listeners.size, 0)
  const canceled = selectImages({ multiple: false })
  input.oncancel()
  assert.deepEqual(await canceled, { canceled: true, assets: [] })
  assert.equal(removed, 2)
})

test('저장 후 썸네일 조회·생성 실패도 저장된 모든 원본 참조를 화면에 반환한다', async () => {
  const items = await importer()([{ fileName: 'one.png' }, { fileName: 'two.png' }, { fileName: 'three.png' }])
  let count = 0
  const results = await attachMediaPreviews(items, async () => {
    count += 1
    if (count === 1) throw new Error('repository read failed')
    if (count === 2) throw new Error('thumbnail failed')
    return 'data:image/png;base64,preview'
  })
  assert.deepEqual(results.map(({ mediaFileId }) => mediaFileId), items.map(({ mediaFileId }) => mediaFileId))
  assert.deepEqual(results.map(({ poster }) => poster), [null, null, 'data:image/png;base64,preview'])
  assert.deepEqual(results.map(({ name }) => name), ['one', 'two', 'three'])
})

test('허용 형식은 확장자가 아닌 시그니처로 검사한다', () => {
  assert.equal(detectMediaType(png).mimeType, 'image/png')
  assert.equal(detectMediaType(gif).mimeType, 'image/gif')
  assert.equal(detectMediaType(heic).mimeType, 'image/heic')
  assert.throws(() => detectMediaType(new TextEncoder().encode('....ftypavif....')), code('UNSUPPORTED_MEDIA_TYPE'))
  assert.equal(detectMediaType(new Uint8Array([255, 216, 255])).mimeType, 'image/jpeg')
  assert.equal(detectMediaType(new TextEncoder().encode('RIFF1234WEBP')).mimeType, 'image/webp')
  assert.throws(() => detectMediaType(new TextEncoder().encode('<svg>')), code('UNSUPPORTED_MEDIA_TYPE'))
})

test('빈 파일·초과 용량·초과 해상도를 거부하고 경계값은 허용한다', () => {
  checkSize(MEDIA_POLICY.maxBytes)
  checkDimensions({ width: 8064, height: 6048 })
  assert.throws(() => checkSize(0), code('INVALID_MEDIA'))
  assert.throws(() => checkSize(MEDIA_POLICY.maxBytes + 1), code('FILE_TOO_LARGE'))
  assert.throws(() => checkDimensions({ width: 12001, height: 1 }), code('IMAGE_TOO_LARGE'))
  assert.throws(() => checkDimensions({ width: 9000, height: 8000 }), code('IMAGE_TOO_LARGE'))
  assert.throws(() => checkDimensions({ width: 4097, height: 1 }, { extension: 'gif' }), code('IMAGE_TOO_LARGE'))
  assert.throws(() => checkSize(11 * 1024 * 1024, { extension: 'gif' }), code('FILE_TOO_LARGE'))
  assert.throws(() => checkDimensions({ width: NaN, height: 1 }), code('MEDIA_DECODE_FAILED'))
})

function importer(overrides = {}) {
  return createMediaImporter({
    readAsset: async (asset) => ({ size: 8, header: png, source: asset }),
    decode: async () => ({ width: 2, height: 3 }),
    save: async () => 'saved-uri', remove: async () => {}, createId: randomUUID,
    ...overrides,
  })
}

test('취소·빈 선택은 파일을 저장하지 않는다', async () => {
  assert.deepEqual(await importer({ save: () => assert.fail('must not save') })([]), [])
})

test('여러 장 중 손상 파일이 있으면 앞서 저장한 원본·표시본을 롤백한다', async () => {
  let decoded = 0
  const removed = []
  const run = importer({ decode: async () => {
    if (++decoded === 2) throw new Error('bad image')
    return { width: 1, height: 1 }
  }, remove: async (id) => removed.push(id) })
  await assert.rejects(run([{}, {}]), code('MEDIA_DECODE_FAILED'))
  assert.equal(removed.length, 1)
})

test('화면용 크기는 용도별 제한을 적용하고 작은 소재는 확대하지 않는다', () => {
  assert.deepEqual(displayDimensions({ width: 8064, height: 6048 }), { width: 2048, height: 1536 })
  assert.deepEqual(displayDimensions({ width: 4000, height: 2000 }, 'sticker'), { width: 512, height: 256 })
  assert.deepEqual(displayDimensions({ width: 4000, height: 2000 }, 'tape'), { width: 1400, height: 700 })
  assert.deepEqual(displayDimensions({ width: 100, height: 200 }), { width: 100, height: 200 })
})

test('HEIC·48MP 원본은 변경 없이 저장하고 표시본 정보와 가공 캐시 정리를 분리한다', async () => {
  let disposed = false
  const raw = new Blob([heic])
  const preview = { source: new Blob(['jpeg-preview']), metadata: { width: 2048, height: 1536, extension: 'jpg', mimeType: 'image/jpeg' } }
  const run = importer({
    readAsset: async () => ({ source: raw, size: raw.size, header: heic }),
    decode: async (_, format) => { assert.equal(format.extension, 'heic'); return { width: 8064, height: 6048 } },
    createDisplay: async (_, format, dimensions, usage) => { assert.equal(usage, 'photo'); assert.equal(dimensions.width, 8064); return preview },
    save: async (source, media, display) => {
      assert.equal(source, raw)
      assert.equal(media.extension, 'heic')
      assert.equal(media.width, 8064)
      assert.deepEqual(media.display, preview.metadata)
      assert.equal(display, preview)
      return 'display-uri'
    },
    dispose: async () => { disposed = true },
  })
  const [media] = await run([{ fileName: 'camera.heic', fileSize: 20 * 1024 * 1024 }])
  assert.equal(media.uri, 'display-uri')
  assert.equal(disposed, true)
})

test('표시본 가공 실패 시 임시 자원을 정리하고 이전에 저장한 파일을 롤백한다', async () => {
  let count = 0
  let disposed = 0
  let removed = 0
  const run = importer({
    createDisplay: async () => { if (++count === 2) throw new Error('conversion failed'); return null },
    dispose: async () => { disposed += 1 }, remove: async () => { removed += 1 },
  })
  await assert.rejects(run([{}, {}]), code('MEDIA_PROCESS_FAILED'))
  assert.equal(disposed, 2)
  assert.equal(removed, 1)
})

test('GIF 원본을 변경 없이 전달하고 UUID·실제 크기·파일 정보를 반환한다', async () => {
  const source = new Blob([gif])
  const run = importer({
    createDisplay: () => assert.fail('GIF must not be converted'),
    readAsset: async () => ({ source, size: source.size, header: gif }),
    save: async (value, metadata) => {
      assert.equal(value, source)
      assert.equal(metadata.mimeType, 'image/gif')
      return 'gif-uri'
    },
  })
  const [result] = await run([{ fileName: 'motion.gif' }])
  assert.match(result.mediaFileId, /^[0-9a-f-]{36}$/)
  assert.equal(result.originalName, 'motion.gif')
  assert.equal(result.fileSize, source.size)
  assert.equal(result.width, 2)
})

test('배치 저장 중 실패하면 이번 호출에서 저장한 파일만 롤백한다', async () => {
  let calls = 0
  const removed = []
  let firstId
  const run = importer({ save: async (_, media) => {
    if (++calls === 2) throw new DOMException('full', 'QuotaExceededError')
    firstId = media.mediaFileId
    return 'first-uri'
  }, remove: async (id) => removed.push(id) })
  await assert.rejects(run([{}, {}]), code('STORAGE_FULL'))
  assert.deepEqual(removed, [firstId])
})

test('IndexedDB v1 GIF 복원·v3 원본/표시본/메타데이터 커밋·실패 롤백', async () => {
  globalThis.indexedDB = indexedDB
  const oldBlob = new Blob([gif], { type: 'image/gif' })
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('dio-media', 1)
    req.onupgradeneeded = () => req.result.createObjectStore('blobs').put(oldBlob, 'legacy-gif')
    req.onerror = () => reject(req.error)
    req.onsuccess = () => { req.result.close(); resolve() }
  })
  const repository = await import('../src/editor/utils/mediaRepository.web.js')
  const legacy = await repository.get('legacy-gif')
  assert.deepEqual(new Uint8Array(await legacy.blob.arrayBuffer()), gif)
  assert.equal(legacy.media, null)

  const metadata = { mediaFileId: randomUUID(), mimeType: 'image/png', fileSize: png.length }
  const blob = new Blob([png], { type: 'image/png' })
  const uri = await repository.save(blob, metadata)
  URL.revokeObjectURL(uri)
  const stored = await repository.get(metadata.mediaFileId)
  assert.deepEqual(stored.media, metadata)
  assert.deepEqual(new Uint8Array(await stored.blob.arrayBuffer()), png)

  const displayBlob = new Blob(['display-jpeg'], { type: 'image/jpeg' })
  const displayMedia = { ...metadata, mediaFileId: randomUUID(), display: { extension: 'jpg', width: 2048, height: 1536 } }
  const displayUri = await repository.save(blob, displayMedia, { source: displayBlob })
  const split = await repository.get(displayMedia.mediaFileId)
  assert.deepEqual(new Uint8Array(await split.blob.arrayBuffer()), png)
  assert.equal(await split.displayBlob.text(), 'display-jpeg')
  assert.equal(await (await fetch(displayUri)).text(), 'display-jpeg')
  await repository.remove(displayMedia.mediaFileId, displayUri)
  await assert.rejects(repository.get(displayMedia.mediaFileId), code('MEDIA_NOT_FOUND'))

  // 메타데이터 저장 실패 시 먼저 저장한 Blob도 롤백한다.
  const add = IDBObjectStore.prototype.add
  const failedId = randomUUID()
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'metadata') throw new DOMException('full', 'QuotaExceededError')
    return add.apply(this, args)
  }
  try { await assert.rejects(repository.save(blob, { ...metadata, mediaFileId: failedId }), code('STORAGE_FULL')) }
  finally { IDBObjectStore.prototype.add = add }
  await assert.rejects(repository.get(failedId), code('MEDIA_NOT_FOUND'))
  const failedDisplayId = randomUUID()
  IDBObjectStore.prototype.add = function (...args) {
    if (this.name === 'displays') throw new DOMException('full', 'QuotaExceededError')
    return add.apply(this, args)
  }
  try { await assert.rejects(repository.save(blob, { ...displayMedia, mediaFileId: failedDisplayId }, { source: displayBlob }), code('STORAGE_FULL')) }
  finally { IDBObjectStore.prototype.add = add }
  await assert.rejects(repository.get(failedDisplayId), code('MEDIA_NOT_FOUND'))
  const restored = await repository.entries()
  assert.equal(restored.length, 2)
  restored.forEach((item) => URL.revokeObjectURL(item.uri))
})
