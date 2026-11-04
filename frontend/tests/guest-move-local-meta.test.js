import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'
import { memberKeys } from '../src/diary/services/memberStorage.js'
import { sortMovedByCreated } from '../src/diary/utils/libraryQuery.js'
import { purgeTrashedDiary } from '../src/diary/utils/trashRetention.js'
import { loadServerPageSnapshot } from '../src/collaboration/serverPages.js'
import { collectMediaIds } from '../src/editor/utils/mediaReferences.js'

const accountId = '7', keys = memberKeys(accountId)
const memory = (initial = {}) => {
  const disk = new Map(Object.entries(initial))
  return { disk, getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value) }, removeItem: async key => { disk.delete(key) }, getAllKeys: async () => [...disk.keys()] }
}
const row = { id: 'server-1', title: '세로 일기', color: '#F2A7A0', canEdit: true, permissions: { canTrash: true }, createdAt: '2026-11-04T00:00:00Z', updatedAt: '2026-11-04T00:00:00Z' }
const api = { list: async () => ({ items: [row], hasNext: false, nextCursor: null }) }
const meta = { 'server-1': { pageSize: 'portrait', cover: { title: { text: '여행' } }, originalCreatedAt: '2026-03-01T00:00:00.000Z' } }

for (const serverLibrary of [false, true]) {
  test(`옮겨 온 다이어리의 표지 · 방향 · 처음 만든 날짜가 회원 목록에 이어진다(serverLibrary=${serverLibrary})`, async () => {
    const storage = memory({ [keys.localMeta]: JSON.stringify(meta) })
    const store = createMemberAppStore({ accountId, api, storage, makeRequestId: () => 'r', serverLibrary })
    await store.load()
    const [diary] = store.getSnapshot().diaries
    assert.equal(diary.pageSize, 'portrait')
    assert.deepEqual(diary.cover, meta['server-1'].cover)
    assert.equal(diary.originalCreatedAt, '2026-03-01T00:00:00.000Z')
    assert.equal(diary.createdAt, row.createdAt)
    store.dispose()
  })
}

const settle = async store => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); return store.getSnapshot() }

for (const serverLibrary of [false, true]) {
  test(`다른 기기에서 옮긴 다이어리의 방향을 서버 페이지 크기로 한 번만 채운다(serverLibrary=${serverLibrary})`, async () => {
    const asked = []
    const storage = memory()
    const store = createMemberAppStore({ accountId, api: { ...api, pageOrientation: async id => { asked.push(id); return 'portrait' } }, storage, makeRequestId: () => 'r', serverLibrary })
    await store.load()
    if (serverLibrary) await store.queryLibrary({})
    const state = await settle(store)
    assert.equal(state.diaries[0].pageSize, 'portrait')
    if (serverLibrary) assert.equal(state.library.items[0].pageSize, 'portrait')
    assert.equal(JSON.parse(storage.disk.get(keys.index))[0].pageSize, 'portrait')
    await store.reload(); await settle(store)
    assert.deepEqual(asked, ['server-1'])
    store.dispose()
  })
}

test('방향을 읽지 못해도 목록은 그대로고 다음 목록 때 다시 읽는다', async () => {
  let calls = 0
  const store = createMemberAppStore({ accountId, api: { ...api, pageOrientation: async () => { if (++calls === 1) throw new Error('offline'); return 'portrait' } }, storage: memory(), makeRequestId: () => 'r' })
  await store.load()
  let state = await settle(store)
  assert.equal(state.diaries[0].pageSize, undefined)
  await store.reload()
  state = await settle(store)
  assert.equal(state.diaries[0].pageSize, 'portrait')
  store.dispose()
})

test('이미 아는 방향은 서버에 묻지 않는다', async () => {
  let calls = 0
  const storage = memory({ [keys.localMeta]: JSON.stringify(meta) })
  const store = createMemberAppStore({ accountId, api: { ...api, pageOrientation: async () => { calls++; return 'landscape' } }, storage, makeRequestId: () => 'r' })
  await store.load()
  const state = await settle(store)
  assert.equal(calls, 0)
  assert.equal(state.diaries[0].pageSize, 'portrait')
  store.dispose()
})

test('사용자가 나중에 고친 표지는 옮길 때의 값으로 되돌아가지 않는다', async () => {
  const edited = { ...row, source: 'member-api', memberAccountId: accountId, cover: { title: { text: '고친 제목' } } }
  const storage = memory({ [keys.localMeta]: JSON.stringify(meta), [keys.index]: JSON.stringify([edited]) })
  const store = createMemberAppStore({ accountId, api, storage, makeRequestId: () => 'r' })
  await store.load()
  assert.equal(store.getSnapshot().diaries[0].cover.title.text, '고친 제목')
  store.dispose()
})

test('기기 값이 깨져도 목록은 그대로 보인다', async () => {
  const storage = memory({ [keys.localMeta]: '{broken' })
  const store = createMemberAppStore({ accountId, api, storage, makeRequestId: () => 'r' })
  await store.load()
  assert.equal(store.getSnapshot().diaries[0].id, 'server-1')
  store.dispose()
})

test('최근 생성순에서 옮겨 온 다이어리는 처음 만든 날짜 자리에 선다', () => {
  const old = { id: 'moved', createdAt: '2026-11-04T00:00:00Z', originalCreatedAt: '2026-01-01T00:00:00Z' }
  const newer = { id: 'new', createdAt: '2026-11-01T00:00:00Z' }, middle = { id: 'middle', createdAt: '2026-06-01T00:00:00Z' }
  assert.deepEqual(sortMovedByCreated([old, newer, middle]).map(item => item.id), ['new', 'middle', 'moved'])
  const plain = [middle, newer]
  assert.equal(sortMovedByCreated(plain), plain)
})

const purgeArgs = (storage, removed, overrides = {}) => {
  let diaries = [{ id: 'a', title: 'a', trashedAt: '2026-01-01T00:00:00.000Z' }]
  return { id: 'a', storage, keys: { diaries: 'diaries', doc: 'doc' }, getDiaries: () => diaries, updateDiaries: change => { diaries = change(diaries) }, forgetDoc() {}, forgetView: async () => true,
    collectMediaIds: value => JSON.stringify(value).match(/photo-[a-z]+/g) ?? [], removeMedia: async id => { removed.push(id) }, ...overrides }
}

test('대상 문서를 읽지 못해도 영구 삭제를 끝내고 사진 파일은 남긴다', async () => {
  const storage = memory({ 'doc:a': '{}' })
  // 파일로 옮긴 문서의 목차가 깨진 경우: 대상 문서를 훑는 동안만 실패한다.
  storage.scanText = async (scanned, visit) => {
    if (scanned.includes('doc:a')) throw new Error('목차를 읽지 못함')
    for (const key of scanned) visit(key, storage.disk.get(key))
  }
  const removed = []
  assert.equal(await purgeTrashedDiary(purgeArgs(storage, removed)), true)
  assert.equal(storage.disk.has('doc:a'), false)
  assert.deepEqual(removed, [])
})

test('다른 곳을 읽지 못하면 지우지 않고 다음에 다시 시도한다', async () => {
  const storage = memory({ 'doc:a': '{}', 'doc:b': '{}' })
  storage.scanText = async scanned => { if (scanned.includes('doc:b')) throw new Error('읽기 실패') }
  assert.equal(await purgeTrashedDiary(purgeArgs(storage, [])), false)
  assert.equal(storage.disk.has('doc:a'), true)
})

test('회원 쪽 표지 · 문서가 쓰는 사진 파일은 게스트 다이어리를 지워도 남는다', async () => {
  const doc = JSON.stringify({ pages: [{ src: 'photo-cover' }, { src: 'photo-doc' }, { src: 'photo-only' }] })
  const storage = memory({ 'doc:a': doc, [keys.localMeta]: JSON.stringify({ s: { cover: { src: 'photo-cover' } } }), [keys.doc('s')]: JSON.stringify({ src: 'photo-doc' }) })
  const removed = []
  assert.equal(await purgeTrashedDiary(purgeArgs(storage, removed)), true)
  assert.deepEqual(removed, ['photo-only'])
})

test('서버 페이지 목록의 크기가 속지 기본 크기보다 우선한다', async () => {
  const diaryId = '00000000-0000-4000-8000-000000000001', pageId = '00000000-0000-4000-8000-000000000002'
  const page = { pageId, diaryId, title: null, canvasWidth: 745, canvasHeight: 1024, templateId: 1, gridVisible: false, templateConfig: { blank: true }, templateCode: 'dio-blank-portrait', templateVersion: '1.0.0' }
  const transport = async ({ path }) => path.endsWith('/pages') ? { items: [page] } : { page, elements: [] }
  const { settings } = await loadServerPageSnapshot(transport, diaryId, { knownIds: [pageId] })
  assert.equal(settings[0].canvasWidth, 745)
  assert.equal(settings[0].canvasHeight, 1024)
})

test('요소에 붙은 원본 PDF는 이미지 참조로 세지 않는다', () => {
  const doc = { pages: [{ objects: [{ mediaFileId: 'page-image', pdfSource: { sourceId: 's', mediaFileId: 'pdf-file' } }] }] }
  assert.deepEqual(collectMediaIds(doc), ['page-image'])
})
