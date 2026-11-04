import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { findUnusedIds } from '../src/diary/utils/storedScan.js'
import { purgeTrashedDiary } from '../src/diary/utils/trashRetention.js'
import { collectMediaIds } from '../src/editor/utils/mediaReferences.js'
import { collectPdfSourceIds } from '../src/diary/utils/pdfSource.js'

// 패키지 없이 포장 객체만 시험하려고 런타임 의존 줄을 뺀 사본을 불러온다.
const source = readFileSync(new URL('../src/editor/services/documentStorage.js', import.meta.url), 'utf8')
  .replace(/^import AsyncStorage.*$/m, '')
  .replace(/^import \{ documentFiles \}.*$/m, '')
  .replace("'./readStoredDocument.js'", `'${new URL('../src/editor/services/readStoredDocument.js', import.meta.url).href}'`)
  .replace(/^const documentStorage = .*$/m, '')
  .replace(/^export default documentStorage$/m, '')
  .replace("'../utils/storageContract.js'", `'${new URL('../src/editor/utils/storageContract.js', import.meta.url).href}'`)
  .replace("'./documentStore.js'", `'${new URL('../src/editor/services/documentStore.js', import.meta.url).href}'`)
  .replace("'../utils/strokeCodec.js'", `'${new URL('../src/editor/utils/strokeCodec.js', import.meta.url).href}'`)
const { createDocumentStorage, isDocumentKey, sameDocument } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

function memoryStorage(initial = {}) {
  const rows = new Map(Object.entries(initial))
  const calls = { getFails: new Set() }
  return {
    rows, calls,
    async getItem(key) { if (calls.getFails.has(key)) throw new Error('Row too big'); return rows.get(key) ?? null },
    async setItem(key, value) { rows.set(key, value) },
    async removeItem(key) { rows.delete(key) },
    async getAllKeys() { return [...rows.keys()] },
    async multiGet(keys) { return keys.map((key) => [key, rows.get(key) ?? null]) },
  }
}
function memoryFiles() {
  const dirs = new Map()
  return {
    dirs,
    async directories() { return [...dirs.keys()] },
    async names(dir) { return [...(dirs.get(dir)?.keys() ?? [])] },
    async ensure(dir) { if (!dirs.has(dir)) dirs.set(dir, new Map()) },
    async read(dir, name) { const value = dirs.get(dir)?.get(name); if (value == null) throw new Error('missing'); return value },
    async write(dir, name, text) { dirs.get(dir).set(name, text) },
    async replace(dir, from, to) { dirs.get(dir).set(to, dirs.get(dir).get(from)); dirs.get(dir).delete(from) },
    async remove(dir, name) { dirs.get(dir).delete(name) },
    async removeAll(dir) { dirs.delete(dir) },
  }
}
const KEY = 'dio:editor:doc:v4:d1'
const makeDoc = (mediaFileId = 'media-1') => ({ id: 'd1', title: 't', pages: [{ id: 'a', objects: [{ id: 'o', type: 'sticker', mediaFileId }, { id: 's', type: 'stroke', points: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }] }] })

test('문서 키만 파일로 보낸다', () => {
  assert.ok(isDocumentKey('dio:editor:doc:v4'))
  assert.ok(isDocumentKey(KEY))
  assert.ok(isDocumentKey('dio:member:v1:12:doc:abc'))
  for (const key of ['dio:member:v1:12:doc:abc:media-uploads:v1:x', 'dio:member:v1:12:doc:abc:text-sync:v1:p', 'dio:editor:view:v1:dio:editor:doc:v4:d1', 'dio:diary:list:v1', 'dio:editor:doc:v4:d1:extra', null])
    assert.equal(isDocumentKey(key), false, String(key))
})

test('다른 키는 원래 저장소에 그대로 저장한다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.setItem('dio:diary:list:v1', '[1]')
  assert.equal(storage.rows.get('dio:diary:list:v1'), '[1]')
  assert.equal(files.dirs.size, 0)
})

test('문서는 파일에 저장되고 같은 값으로 읽힌다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.setItem(KEY, JSON.stringify(makeDoc()))
  assert.equal(storage.rows.has(KEY), false)
  assert.deepEqual(JSON.parse(await wrapped.getItem(KEY)), makeDoc())
  assert.deepEqual(await wrapped.loadDocument(KEY), makeDoc())
})

test('파일로 옮긴 문서의 사진 id 를 전체 훑기에서 찾을 수 있다', async () => {
  const storage = memoryStorage({ 'dio:diary:list:v1': '[]' }), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc('사진-아이디'))
  const keys = await wrapped.getAllKeys()
  assert.ok(keys.includes(KEY))
  const records = await wrapped.multiGet(keys)
  assert.ok(records.some(([, raw]) => raw?.includes('사진-아이디')))
  assert.deepEqual(records.map(([key]) => key), keys)
})

test('전체 훑기는 페이지를 못 읽으면 실패해서 호출자가 아무것도 지우지 않게 한다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc())
  const fresh = createDocumentStorage({ storage, files })
  const realRead = files.read
  files.read = async (dir, name) => { if (name.startsWith('p')) throw new Error('읽기 실패'); return realRead(dir, name) }
  await assert.rejects(fresh.multiGet(await fresh.getAllKeys()))
})

test('훑기는 문서를 목차와 페이지로 나눠 넘기고 사진 id 를 찾는다', async () => {
  const storage = memoryStorage({ 'dio:diary:list:v1': '["목록"]', 'dio:editor:doc:v4:old': '{"pages":[]}' }), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, { id: 'd1', pages: [{ id: 'a', objects: [{ id: 'o1', type: 'sticker', mediaFileId: '첫째' }] }, { id: 'b', objects: [{ id: 'o2', type: 'sticker', mediaFileId: '둘째' }] }] })
  const seen = []
  await wrapped.scanText(['dio:diary:list:v1', 'dio:editor:doc:v4:old', KEY], (key, raw) => { seen.push([key, raw]) })
  assert.deepEqual(seen.slice(0, 2), [['dio:diary:list:v1', '["목록"]'], ['dio:editor:doc:v4:old', '{"pages":[]}']])
  const chunks = seen.filter(([key]) => key === KEY).map(([, raw]) => raw)
  assert.equal(chunks.length, 3)
  assert.equal(chunks.filter((raw) => raw.includes('첫째') && raw.includes('둘째')).length, 0)
  assert.equal(chunks.filter((raw) => raw.includes('첫째') || raw.includes('둘째')).length, 2)
})

test('훑기는 false 를 받으면 멈춘다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc())
  await wrapped.saveDocument('dio:editor:doc:v4:d2', makeDoc())
  let visits = 0
  await wrapped.scanText([KEY, 'dio:editor:doc:v4:d2'], () => { visits += 1; return false })
  assert.equal(visits, 1)
})

test('훑기는 페이지를 못 읽거나 도중에 저장되면 실패한다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc())
  const realRead = files.read
  // 페이지를 읽는 사이에 저장이 끝난다.
  let saving = null
  files.read = async (dir, name) => { const text = await realRead(dir, name); if (name.startsWith('p')) await saving; return text }
  await assert.rejects(wrapped.scanText([KEY], () => { saving ??= wrapped.saveDocument(KEY, { ...makeDoc(), title: '바뀜' }) }), /changed during scan/)
  files.read = async (dir, name) => { if (name.startsWith('p')) throw new Error('읽기 실패'); return realRead(dir, name) }
  await assert.rejects(wrapped.scanText([KEY], () => {}), /읽기 실패/)
})

test('목차가 깨진 문서가 있으면 참조 검사가 실패해 사진을 지우지 않는다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc('쓰는 사진'))
  const dir = [...files.dirs.keys()][0]
  files.dirs.get(dir).set('manifest.json', '{깨짐')
  const fresh = createDocumentStorage({ storage, files })
  const keys = await fresh.getAllKeys()
  assert.deepEqual(keys, [KEY])
  await assert.rejects(findUnusedIds(fresh, keys, ['쓰는 사진']))
})

test('첫 저장 중 꺼져 쓰다 만 임시 목차만 남으면 옛 행으로 읽고 다시 옮긴다', async () => {
  const raw = JSON.stringify(makeDoc())
  const storage = memoryStorage({ [KEY]: raw }), files = memoryFiles()
  const first = createDocumentStorage({ storage, files })
  await first.migrateLegacyDocuments()
  const dir = [...files.dirs.keys()][0]
  files.dirs.get(dir).delete('manifest.json')
  files.dirs.get(dir).set('manifest.tmp', '{"version":5,"pa')
  const reopened = createDocumentStorage({ storage, files })
  assert.deepEqual(await reopened.loadDocument(KEY), makeDoc())
  assert.deepEqual(JSON.parse(await reopened.getItem(KEY)), makeDoc())
  assert.deepEqual(await reopened.migrateLegacyDocuments(), { migrated: 1, removed: 0, failed: 0 })
  assert.equal(files.dirs.get(dir).has('manifest.tmp'), false)
  assert.deepEqual(await createDocumentStorage({ storage, files }).loadDocument(KEY), makeDoc())
})

test('파일 저장소가 없는 웹도 같은 방식으로 훑는다', async () => {
  const wrapped = createDocumentStorage({ storage: memoryStorage({ a: '1', b: '2' }), files: null })
  const seen = []
  await wrapped.scanText(['a', 'b'], (key, raw) => { seen.push([key, raw]); return false })
  assert.deepEqual(seen, [['a', '1']])
})

test('옮기기 확인은 값이 달라진 사본을 거부하고 옛 행을 그대로 둔다', async () => {
  for (const [name, corrupt] of [
    ['글자', (text) => text.replace('"글"', '"다른 글"')],
    ['사진', (text) => text.replace('media-1', 'media-2')],
    ['필기 좌표', (text) => text.replace('"x":1', '"x":5')],
  ]) {
    const doc = { id: 'd1', title: 't', pages: [{ id: 'a', objects: [
      { id: 't', type: 'text', text: '글' },
      { id: 'o', type: 'sticker', mediaFileId: 'media-1' },
      { id: 's', type: 'stroke', points: [{ x: 1, y: 2 }] },
    ] }] }
    const raw = JSON.stringify(doc)
    const storage = memoryStorage({ [KEY]: raw }), files = memoryFiles()
    const realRead = files.read
    files.read = async (dir, file) => { const text = await realRead(dir, file); return file.startsWith('p') ? corrupt(text) : text }
    const result = await createDocumentStorage({ storage, files }).migrateLegacyDocuments()
    assert.equal(result.failed, 1, name)
    assert.equal(storage.rows.get(KEY), raw, name)
    assert.equal(files.dirs.size, 0, name)
  }
})

test('옮기기 확인은 필기 좌표 · 필압의 저장 눈금 오차만 허용한다', () => {
  const stroke = (x, pressure, time = 10) => ({ id: 's', type: 'stroke', points: [{ x, y: 1, pressure, time }] })
  const docOf = (...objects) => ({ id: 'd', pages: [{ id: 'a', objects }] })
  assert.ok(sameDocument(docOf(stroke(1.00049, 0.50004)), docOf(stroke(1, 0.5))))
  assert.equal(sameDocument(docOf(stroke(1.002, 0.5)), docOf(stroke(1, 0.5))), false)
  assert.equal(sameDocument(docOf(stroke(1, 0.5, 10.04)), docOf(stroke(1, 0.5, 10))), false)
  assert.equal(sameDocument({ id: 'd', title: '가', pages: [] }, { id: 'd', title: '나', pages: [] }), false)
  assert.equal(sameDocument({ id: 'd', pages: [{ id: 'a', paper: 1, objects: [] }] }, { id: 'd', pages: [{ id: 'a', paper: 2, objects: [] }] }), false)
})

test('지우면 파일과 옛 행이 모두 사라져 고아 복구로 살아나지 않는다', async () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify(makeDoc()) }), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.migrateLegacyDocuments()
  await wrapped.removeItem(KEY)
  assert.equal(await wrapped.getItem(KEY), null)
  assert.deepEqual(await wrapped.getAllKeys(), [])
})

test('옮긴 직후에는 옛 행을 남기고 다음 실행에서 지운다', async () => {
  const raw = JSON.stringify(makeDoc())
  const storage = memoryStorage({ [KEY]: raw }), files = memoryFiles()
  const first = await createDocumentStorage({ storage, files }).migrateLegacyDocuments()
  assert.deepEqual(first, { migrated: 1, removed: 0, failed: 0 })
  assert.equal(storage.rows.get(KEY), raw)
  const reopened = createDocumentStorage({ storage, files })
  assert.deepEqual(await reopened.loadDocument(KEY), makeDoc())
  const second = await reopened.migrateLegacyDocuments()
  assert.deepEqual(second, { migrated: 0, removed: 1, failed: 0 })
  assert.equal(storage.rows.has(KEY), false)
  assert.deepEqual(await reopened.loadDocument(KEY), makeDoc())
})

test('옮기기 전 저장된 새 내용을 옛 행으로 덮어쓰지 않는다', async () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify(makeDoc('옛')) }), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(KEY, makeDoc('새'))
  await wrapped.migrateLegacyDocuments()
  assert.equal((await wrapped.loadDocument(KEY)).pages[0].objects[0].mediaFileId, '새')
})

test('옮기기 실패 시 사본을 지우고 옛 행을 그대로 쓴다', async () => {
  const storage = memoryStorage({ [KEY]: JSON.stringify(makeDoc()) }), files = memoryFiles()
  const realReplace = files.replace
  files.replace = async () => { throw new Error('디스크 가득') }
  const wrapped = createDocumentStorage({ storage, files })
  assert.equal((await wrapped.migrateLegacyDocuments()).failed, 1)
  assert.ok(storage.rows.has(KEY))
  files.replace = realReplace
  assert.deepEqual(await wrapped.loadDocument(KEY), makeDoc())
  assert.equal((await wrapped.migrateLegacyDocuments()).migrated, 1)
})

test('읽지 못하는 옛 행은 건드리지 않고 다른 문서는 계속 옮긴다', async () => {
  const other = 'dio:editor:doc:v4:d2'
  const storage = memoryStorage({ [KEY]: 'x'.repeat(10), [other]: JSON.stringify(makeDoc()) }), files = memoryFiles()
  storage.calls.getFails.add(KEY)
  const wrapped = createDocumentStorage({ storage, files })
  const result = await wrapped.migrateLegacyDocuments()
  assert.equal(result.failed, 1)
  assert.equal(result.migrated, 1)
  assert.ok(storage.rows.has(KEY))
  await assert.rejects(wrapped.loadDocument(KEY))
})

test('옛 행의 JSON 이 깨졌으면 오류로 알리고, 옮기지도 지우지도 않는다', async () => {
  const storage = memoryStorage({ [KEY]: '{깨짐' }), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await assert.rejects(wrapped.loadDocument(KEY), { code: 'EDITOR_DOCUMENT_CORRUPT' })
  await wrapped.migrateLegacyDocuments()
  assert.equal(storage.rows.get(KEY), '{깨짐')
  assert.equal(files.dirs.size, 0)
})

test('파일 저장소가 없는 웹은 기존 저장소를 그대로 쓴다', async () => {
  const storage = memoryStorage()
  const wrapped = createDocumentStorage({ storage, files: null })
  await wrapped.saveDocument(KEY, makeDoc())
  assert.deepEqual(JSON.parse(storage.rows.get(KEY)), makeDoc())
  assert.deepEqual(await wrapped.loadDocument(KEY), makeDoc())
})

test('파일로 옮긴 두 문서가 같은 사진 · PDF 를 쓰면 한쪽을 영구 삭제해도 공유 파일은 남는다', async () => {
  const docKey = 'dio:editor:doc:v4'
  const page = (id, ...mediaIds) => ({ id, objects: mediaIds.map((mediaFileId) => ({ id: `${id}-${mediaFileId}`, type: 'sticker', mediaFileId })) })
  const source = (sourceId) => ({ sourceId, pageIndex: 0 })
  const document = (id, sourceId, ...pages) => ({ id, title: id, pages: pages.map((item, index) => (index ? item : { ...item, pdfSource: source(sourceId) })) })
  const storage = memoryStorage()
  const files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  await wrapped.saveDocument(`${docKey}:a`, document('a', 'pdf-shared', page('a1', 'photo-only-a'), page('a2', 'photo-shared')))
  await wrapped.saveDocument(`${docKey}:b`, document('b', 'pdf-shared', page('b1'), page('b2', 'photo-shared')))
  let diaries = [{ id: 'a', title: 'a', trashedAt: '2026-01-01T00:00:00.000Z' }, { id: 'b', title: 'b', trashedAt: null }]
  const removedMedia = [], removedSources = []
  const done = await purgeTrashedDiary({
    id: 'a', storage: wrapped, keys: { diaries: 'diaries', doc: docKey, customDecor: 'decor', myCovers: 'covers', myPapers: 'papers' },
    getDiaries: () => diaries, updateDiaries: (update) => { diaries = update(diaries) }, forgetDoc: () => {}, forgetView: async () => true,
    collectMediaIds, removeMedia: async (id) => removedMedia.push(id), collectSourceIds: collectPdfSourceIds, removeSource: async (id) => removedSources.push(id),
  })
  assert.equal(done, true)
  assert.deepEqual(removedMedia, ['photo-only-a'])
  assert.deepEqual(removedSources, [])
  assert.equal(await wrapped.getItem(`${docKey}:a`), null)
  assert.ok(await wrapped.getItem(`${docKey}:b`))
})

test('문서 키 목록은 목차를 읽지 않고 폴더 이름으로 만든다', async () => {
  const storage = memoryStorage(), files = memoryFiles()
  const wrapped = createDocumentStorage({ storage, files })
  const keyWithMarks = 'dio:member:v1:7:doc:가_나-1'
  await wrapped.saveDocument(keyWithMarks, makeDoc())
  const fresh = createDocumentStorage({ storage, files: { ...files, read: async () => { throw new Error('목차를 읽으면 안 된다') } } })
  assert.ok((await fresh.getAllKeys()).includes(keyWithMarks))
})

test('옮긴 파일을 끝까지 읽지 못하면 다음 실행에도 옛 행을 지우지 않는다', async () => {
  const raw = JSON.stringify(makeDoc())
  const storage = memoryStorage({ [KEY]: raw }), files = memoryFiles()
  await createDocumentStorage({ storage, files }).migrateLegacyDocuments()
  const [dir] = [...files.dirs.values()]
  const pageFile = [...dir.keys()].find((name) => name !== 'manifest.json')
  assert.ok(pageFile)
  dir.delete(pageFile)
  const second = await createDocumentStorage({ storage, files }).migrateLegacyDocuments()
  assert.deepEqual(second, { migrated: 0, removed: 0, failed: 1 })
  assert.equal(storage.rows.get(KEY), raw)
})
