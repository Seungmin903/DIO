import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// 패키지 없이 포장 객체만 시험하려고 런타임 의존 줄을 뺀 사본을 불러온다.
const source = readFileSync(new URL('../src/editor/services/documentStorage.js', import.meta.url), 'utf8')
  .replace(/^import AsyncStorage.*$/m, '')
  .replace(/^import \{ documentFiles \}.*$/m, '')
  .replace("'./readStoredDocument.js'", `'${new URL('../src/editor/services/readStoredDocument.js', import.meta.url).href}'`)
  .replace(/^const documentStorage = .*$/m, '')
  .replace(/^export default documentStorage$/m, '')
  .replace("'../utils/storageContract.js'", `'${new URL('../src/editor/utils/storageContract.js', import.meta.url).href}'`)
  .replace("'./documentStore.js'", `'${new URL('../src/editor/services/documentStore.js', import.meta.url).href}'`)
const { createDocumentStorage, isDocumentKey } = await import(`data:text/javascript,${encodeURIComponent(source)}`)

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
