import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'
import { memberKeys } from '../src/diary/services/memberStorage.js'
import { diaryCreateInput } from '../src/diary/services/diaryCreateInput.js'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createCanvasMedia, createMediaRequest } from '../src/collaboration/canvasMedia.js'
import { fetchPdfSource, setPdfSourceFetcher } from '../src/editor/services/pdfSourceRemote.js'

const diaryId = '11111111-2222-3333-4444-555555555555'
const pages = ['aaaaaaaa-bbbb-cccc-dddd-000000000001', 'aaaaaaaa-bbbb-cccc-dddd-000000000002']
const stamp = '2026-10-27T00:00:00.123456Z'
const localImage = ['20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002']
const sourceId = '50000000-0000-4000-8000-000000000001'
const remotePdf = '60000000-0000-4000-8000-000000000001'
const form = {
  title: 'PDF 다이어리', color: '#123456', pattern: null, pageSize: 'portrait',
  templateConfig: { version: 2, dateMode: 'undated', orientation: 'portrait', cover: false, dividers: false, monthly: false, weekly: false, daily: false, reusable: [], legacyEndPages: [] },
  importedPages: [
    { src: `media:${localImage[0]}`, mediaFileId: localImage[0], aspect: 1.5, name: 'a.pdf', pdfSource: { sourceId, pageIndex: 0, edge: 3000 } },
    { src: `media:${localImage[1]}`, mediaFileId: localImage[1], aspect: 0.5, name: 'a.pdf', pdfSource: { sourceId, pageIndex: 1, edge: 3000 } },
  ],
}

test('PDF 쪽 수만큼 서버에 빈 페이지를 만들고, 만든 뒤 쪽마다 크기를 맞춘다', () => {
  const input = diaryCreateInput(form)
  assert.equal(input.initialPages.length, 2)
  assert.ok(input.initialPages.every(page => page.templateConfig.blank === true && page.templateConfig.paperAppearance.backgroundColor === '#FFFFFF'))
  assert.equal(input.importedPages.length, 2)
  assert.equal(diaryCreateInput({ ...form, importedPages: undefined }).importedPages, undefined)
})

test('회원 다이어리 문서는 서버 페이지 id 에 PDF 쪽 크기와 잠근 바탕 그림을 얹어 저장한다', async () => {
  const values = new Map(), sizes = []
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v) }, removeItem: async k => { values.delete(k) } }
  const row = { id: diaryId, title: form.title, color: form.color, coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1' }
  const api = {
    create: async input => { assert.equal(input.initialPages.length, 2); return { ...row, firstPageId: pages[0], pageIds: pages } },
    setPageSizes: async list => { sizes.push(...list) },
    list: async () => ({ items: [{ ...row, pageCount: 2, isShared: false }], hasNext: false, nextCursor: null }),
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, makeRequestId: () => 'member-pdf-key' })
  await store.load(); await store.create(form)
  const doc = JSON.parse(values.get(memberKeys('101').doc(diaryId)))
  assert.deepEqual(doc.pages.map(page => page.id), pages)
  assert.deepEqual(sizes.map(item => item.pageId), pages)
  assert.deepEqual(sizes.map(item => [item.canvasWidth, item.canvasHeight]), doc.pages.map(page => [page.canvasWidth, page.canvasHeight]))
  assert.ok(doc.pages[0].canvasWidth > doc.pages[0].canvasHeight && doc.pages[1].canvasWidth < doc.pages[1].canvasHeight)
  for (const [index, page] of doc.pages.entries()) {
    assert.equal(page.objects.length, 1)
    assert.equal(page.objects[0].backdrop, true); assert.equal(page.objects[0].locked, true)
    assert.equal(page.objects[0].mediaFileId, localImage[index]); assert.equal(page.objects[0].pdfSource.sourceId, sourceId)
  }
})

test('크기를 맞추다 실패하면 문서를 쓰지 않고 같은 생성 요청을 다시 시도할 수 있게 남긴다', async () => {
  const values = new Map(); let fail = true
  const storage = { getItem: async k => values.get(k) ?? null, setItem: async (k, v) => { values.set(k, v) }, removeItem: async k => { values.delete(k) } }
  const row = { id: diaryId, title: form.title, color: form.color, coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1' }
  const api = {
    create: async () => ({ ...row, firstPageId: pages[0], pageIds: pages }),
    setPageSizes: async () => { if (fail) throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }) },
    list: async () => ({ items: [], hasNext: false, nextCursor: null }),
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, makeRequestId: () => 'member-pdf-key' })
  await store.load()
  await assert.rejects(store.create(form), { code: 'NETWORK_ERROR' })
  assert.equal(values.has(memberKeys('101').doc(diaryId)), false)
  assert.equal(store.getSnapshot().pending.uncertain, true)
  fail = false
  await store.create(form)
  assert.equal(store.getSnapshot().pending, null)
  assert.equal(values.has(memberKeys('101').doc(diaryId)), true)
})

test('setPageSizes 는 페이지마다 가로 세로를 함께 PATCH 하고 응답 페이지가 다르면 거절한다', async () => {
  const calls = []
  const api = createMemberDiaryApi(async request => { calls.push(request); return { page: { pageId: request.path.split('/').pop() } } })
  await api.setPageSizes([{ pageId: pages[0], canvasWidth: 1024, canvasHeight: 683 }, { pageId: pages[1], canvasWidth: 512, canvasHeight: 1024 }])
  assert.deepEqual(calls.map(call => [call.method, call.path, call.body]), [
    ['PATCH', `/pages/${pages[0]}`, { canvasWidth: 1024, canvasHeight: 683 }],
    ['PATCH', `/pages/${pages[1]}`, { canvasWidth: 512, canvasHeight: 1024 }],
  ])
  const wrong = createMemberDiaryApi(async () => ({ page: { pageId: pages[1] } }))
  await assert.rejects(wrong.setPageSizes([{ pageId: pages[0], canvasWidth: 1, canvasHeight: 1 }]), { code: 'INVALID_RESPONSE' })
})

function mediaFixture({ stored = {}, upload } = {}) {
  const disk = new Map(Object.entries(stored)), posts = [], saved = new Map(), downloads = []
  const files = {
    upload: upload ?? (async (id, category) => ({ id, category })),
    cached: async () => true, save: async () => {},
    hasDocument: async id => saved.has(id), saveDocument: async (id, bytes) => { saved.set(id, bytes) },
  }
  const media = createCanvasMedia({
    storage: { getItem: async k => disk.get(k) ?? null, setItem: async (k, v) => { disk.set(k, v) } }, key: 'm', files,
    request: async (path, options = {}) => {
      if (path === '/media') { posts.push(options.body); return { mediaFileId: remotePdf } }
      downloads.push([path, options]); return new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1])
    },
  })
  return { media, posts, saved, downloads, disk }
}
const backdropRow = extra => ({ elementType: 'STICKER', propertiesJson: { backdrop: true, pdfSource: { sourceId, pageIndex: 0, edge: 3000, ...extra } } })

test('캔버스 요소를 올릴 때 원본 PDF 를 DOCUMENT 로 한 번만 올려 pdfSource.mediaFileId 를 단다', async () => {
  const f = mediaFixture()
  const body = { changes: { creates: [backdropRow(), backdropRow()] } }
  const result = await f.media.prepare(body)
  assert.equal(f.posts.length, 1); assert.equal(f.posts[0].category, 'DOCUMENT')
  assert.ok(result.changes.creates.every(row => row.propertiesJson.pdfSource.mediaFileId === remotePdf && row.propertiesJson.pdfSource.sourceId === sourceId))
  assert.equal(body.changes.creates[0].propertiesJson.pdfSource.mediaFileId, undefined)
  await f.media.prepare({ changes: { updates: [backdropRow({ mediaFileId: remotePdf })] } })
  assert.equal(f.posts.length, 1)
})

test('다른 곳에서 온 서버 id 는 믿지 않고 이 기기의 원본으로 다시 올리며, 이미 아는 서버 id 는 그대로 둔다', async () => {
  const foreign = '70000000-0000-4000-8000-000000000001'
  const f = mediaFixture()
  const first = await f.media.prepare({ changes: { creates: [backdropRow({ mediaFileId: foreign })] } })
  assert.equal(first.changes.creates[0].propertiesJson.pdfSource.mediaFileId, remotePdf); assert.equal(f.posts.length, 1)
  await f.media.hydrate([{ propertiesJson: { pdfSource: { sourceId, mediaFileId: foreign } } }])
  const known = await f.media.prepare({ changes: { updates: [backdropRow({ mediaFileId: foreign })] } })
  assert.equal(known.changes.updates[0].propertiesJson.pdfSource.mediaFileId, foreign); assert.equal(f.posts.length, 1)
  assert.equal(f.downloads.length, 0)
})

test('원본이 없거나 25MB 를 넘으면 원본 없이 올려 편집을 막지 않고, 일시적 실패는 다시 시도하게 던진다', async () => {
  const missing = mediaFixture({ upload: async () => { throw Object.assign(Error('없어요'), { code: 'PDF_SOURCE_MISSING' }) } })
  const a = await missing.media.prepare({ changes: { creates: [backdropRow()] } })
  assert.equal(a.changes.creates[0].propertiesJson.pdfSource.mediaFileId, undefined); assert.equal(a.changes.creates[0].propertiesJson.pdfSource.sourceId, sourceId)
  const large = mediaFixture({ upload: async () => { throw Object.assign(Error('크요'), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' }) } })
  const b = await large.media.prepare({ changes: { creates: [backdropRow()] } })
  assert.equal(b.changes.creates[0].propertiesJson.pdfSource.mediaFileId, undefined)
  const offline = mediaFixture({ upload: async () => { throw Object.assign(Error('offline'), { status: 0, code: 'NETWORK_ERROR' }) } })
  await assert.rejects(offline.media.prepare({ changes: { creates: [backdropRow()] } }), { code: 'NETWORK_ERROR' })
})

test('올린 기록이 있으면(재시작 뒤) 같은 원본을 다시 올리지 않는다', async () => {
  const f = mediaFixture({ stored: { [`m:doc:${sourceId}`]: remotePdf } })
  const result = await f.media.prepare({ changes: { creates: [backdropRow()] } })
  assert.equal(f.posts.length, 0); assert.equal(result.changes.creates[0].propertiesJson.pdfSource.mediaFileId, remotePdf)
})

test('친구 기기는 서버 PDF 를 sourceId 로 보관하고, 이미 있으면 받지 않으며, PDF 가 아니면 거절한다', async () => {
  const f = mediaFixture()
  await f.media.fetchDocument(sourceId, remotePdf)
  assert.equal(f.downloads.length, 1); assert.equal(f.downloads[0][0], `/media/${remotePdf}/file`)
  assert.equal(f.downloads[0][1].maxBytes, 25 * 1024 * 1024); assert.ok(f.saved.has(sourceId))
  await f.media.fetchDocument(sourceId, remotePdf); assert.equal(f.downloads.length, 1)
  await assert.rejects(f.media.fetchDocument('../x', remotePdf), /PDF 원본 참조/)
  await assert.rejects(f.media.fetchDocument(sourceId, 'not-a-uuid'), /PDF 원본 참조/)
  const html = createCanvasMedia({ storage: { getItem: async () => null, setItem: async () => {} }, key: 'm',
    files: { hasDocument: async () => false, saveDocument: async () => { throw Error('저장하면 안 돼요') } }, request: async () => new Uint8Array([60, 104, 116, 109, 108, 62]) })
  await assert.rejects(html.fetchDocument(sourceId, remotePdf), { code: 'INVALID_SERVER_MEDIA' })
})

test('미디어 요청은 PDF 원본에 한해 더 큰 응답과 더 긴 시간을 받는다', async () => {
  const body = new Uint8Array(6 * 1024 * 1024).fill(1)
  const auth = { getSessionKey: () => 's', getAccessToken: async () => 't', getConnectionOptions: () => ({ getAuthHeaders: () => ({}) }) }
  const request = createMediaRequest({ auth, accountId: '1', sessionKey: 's', baseUrl: 'http://x/api/v1', fetchImpl: async () => new Response(body, { status: 200 }) })
  await assert.rejects(request(`/media/${remotePdf}/file`, { binary: true }), { code: 'INVALID_SERVER_MEDIA' })
  assert.equal((await request(`/media/${remotePdf}/file`, { binary: true, maxBytes: 25 * 1024 * 1024 })).length, body.length)
})

test('PdfDetail 이 쓰는 내려받기는 같은 원본을 한 번만 받고 실패하면 잠시 다시 받지 않는다', async () => {
  let calls = 0, fail = true
  setPdfSourceFetcher(async () => { calls++; if (fail) throw Error('offline') })
  const source = { sourceId, mediaFileId: remotePdf }
  await Promise.all([fetchPdfSource(source).catch(() => {}), fetchPdfSource(source).catch(() => {})])
  assert.equal(calls, 1)
  await assert.rejects(fetchPdfSource(source), { message: 'PDF_SOURCE_BACKOFF' }); assert.equal(calls, 1)
  await assert.rejects(fetchPdfSource({ sourceId }), { message: 'PDF_SOURCE_UNAVAILABLE' })
  setPdfSourceFetcher(null); fail = false
  setPdfSourceFetcher(async () => { calls++ })
  await fetchPdfSource(source); assert.equal(calls, 2)
  setPdfSourceFetcher(null)
})
