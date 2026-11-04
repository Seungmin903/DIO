import test from 'node:test'
import assert from 'node:assert/strict'
import { createDocumentStore, documentDirectory } from '../src/editor/services/documentStore.js'

function memoryFiles() {
  const dirs = new Map()
  const log = []
  const fail = { write: null, replace: null, read: null }
  const files = {
    async directories() { return [...dirs.keys()] },
    async names(dir) { return [...(dirs.get(dir)?.keys() ?? [])] },
    async ensure(dir) { if (!dirs.has(dir)) dirs.set(dir, new Map()) },
    async read(dir, name) {
      if (fail.read?.(name)) throw new Error('read failed')
      const value = dirs.get(dir)?.get(name)
      if (value == null) throw new Error(`missing ${name}`)
      return value
    },
    async write(dir, name, text) {
      if (fail.write?.(name)) throw new Error('write failed')
      log.push(`write ${name}`)
      dirs.get(dir).set(name, text)
    },
    async replace(dir, from, to) {
      if (fail.replace?.(from)) throw new Error('replace failed')
      log.push(`replace ${to}`)
      dirs.get(dir).set(to, dirs.get(dir).get(from))
      dirs.get(dir).delete(from)
    },
    async remove(dir, name) { dirs.get(dir).delete(name) },
    async removeAll(dir) { dirs.delete(dir) },
  }
  return { files, dirs, log, fail }
}

const stroke = (id) => ({ id, type: 'stroke', points: [{ x: 1.5, y: 2.5, pressure: 1 }, { x: 3.25, y: 4.75, pressure: 1.25 }] })
const makeDoc = () => ({
  id: 'd',
  title: '일기',
  updatedAt: 't1',
  pages: [{ id: 'a', objects: [stroke('s1')] }, { id: 'b', objects: [] }, { id: 'c', objects: [{ id: 'k', type: 'sticker', mediaFileId: 'media-1' }] }],
})

test('저장한 문서를 그대로 읽는다', async () => {
  const { files } = memoryFiles()
  const store = createDocumentStore({ files })
  await store.writeDocument('k', makeDoc())
  assert.deepEqual(await store.readDocument('k'), makeDoc())
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('없는 문서는 null, 깨진 목차는 reject', async () => {
  const { files, dirs } = memoryFiles()
  const store = createDocumentStore({ files })
  assert.equal(await store.readDocument('없음'), null)
  await store.writeDocument('k', makeDoc())
  dirs.get(documentDirectory('k')).set('manifest.json', '{깨짐')
  await assert.rejects(createDocumentStore({ files }).readDocument('k'))
})

test('페이지 파일을 못 읽으면 reject 해서 빈 문서로 덮어쓰지 않는다', async () => {
  const { files, fail } = memoryFiles()
  const store = createDocumentStore({ files })
  await store.writeDocument('k', makeDoc())
  fail.read = (name) => name.startsWith('p')
  await assert.rejects(store.readDocument('k'))
})

test('바뀐 페이지만 쓰고 안 쓰는 파일은 지운다', async () => {
  const { files, log, dirs } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  log.length = 0
  const pages = [doc.pages[0], { ...doc.pages[1], objects: [{ id: 'n', type: 'text' }] }, doc.pages[2]]
  await store.writeDocument('k', { ...doc, pages, updatedAt: 't2' })
  assert.deepEqual(log, ['write p4.json', 'write manifest.tmp', 'replace manifest.json'])
  assert.deepEqual([...dirs.get(documentDirectory('k')).keys()].sort(), ['manifest.json', 'p1.json', 'p3.json', 'p4.json'])
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.equal(back.updatedAt, 't2')
  assert.equal(back.pages[1].objects[0].id, 'n')
})

test('읽어 온 문서를 저장할 때도 바뀐 페이지만 쓴다', async () => {
  const { files, log } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const doc = await store.readDocument('k')
  log.length = 0
  await store.writeDocument('k', { ...doc, title: '새 제목' })
  assert.deepEqual(log, ['write manifest.tmp', 'replace manifest.json'])
})

test('페이지 순서 변경과 삭제는 페이지를 다시 쓰지 않는다', async () => {
  const { files, log } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  log.length = 0
  await store.writeDocument('k', { ...doc, pages: [doc.pages[2], doc.pages[0]] })
  assert.deepEqual(log, ['write manifest.tmp', 'replace manifest.json'])
  assert.deepEqual((await createDocumentStore({ files }).readDocument('k')).pages.map((page) => page.id), ['c', 'a'])
})

test('페이지를 쓰다 실패하면 이전 문서가 그대로 남는다', async () => {
  const { files, fail } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  fail.write = (name) => name === 'p4.json'
  await assert.rejects(store.writeDocument('k', { ...doc, title: '실패', pages: [{ id: 'z', objects: [] }] }))
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), doc)
})

test('목차를 쓰다 실패해도 이전 문서가 그대로 남는다', async () => {
  const { files, fail } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  fail.replace = () => true
  await assert.rejects(store.writeDocument('k', { ...doc, title: '실패', pages: [{ id: 'z', objects: [] }] }))
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), doc)
})

test('실패한 뒤 다시 저장하면 새 문서가 저장된다', async () => {
  const { files, fail } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  fail.write = () => true
  const next = { ...doc, pages: [{ id: 'z', objects: [] }] }
  await assert.rejects(store.writeDocument('k', next))
  fail.write = null
  await store.writeDocument('k', next)
  assert.deepEqual((await createDocumentStore({ files }).readDocument('k')).pages.map((page) => page.id), ['z'])
})

test('교체 중 꺼져 완성된 임시 목차만 남으면 그것을 읽는다', async () => {
  const { files, dirs } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const dir = dirs.get(documentDirectory('k'))
  dir.set('manifest.tmp', dir.get('manifest.json'))
  dir.delete('manifest.json')
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('임시 목차만 남은 문서를 저장하다 실패해도 문서를 잃지 않는다', async () => {
  const { files, dirs, fail } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const dir = dirs.get(documentDirectory('k'))
  dir.set('manifest.tmp', dir.get('manifest.json'))
  dir.delete('manifest.json')
  const store = createDocumentStore({ files })
  const doc = await store.readDocument('k')
  const realWrite = files.write
  files.write = async (d, name, text) => {
    if (name === 'manifest.tmp') { dirs.get(d).set(name, text.slice(0, 5)); throw new Error('꺼짐') }
    return realWrite(d, name, text)
  }
  await assert.rejects(store.writeDocument('k', { ...doc, title: '새 제목' }))
  files.write = realWrite
  fail.write = null
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('쓰다 만 임시 목차는 진짜 목차가 있으면 무시한다', async () => {
  const { files, dirs } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  dirs.get(documentDirectory('k')).set('manifest.tmp', '{쓰다 만')
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('같은 문서의 저장이 겹쳐도 순서대로 끝난다', async () => {
  const { files } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await Promise.all([
    store.writeDocument('k', { ...doc, title: '1' }),
    store.writeDocument('k', { ...doc, title: '2' }),
    store.writeDocument('k', { ...doc, title: '3', pages: [{ id: 'z', objects: [] }] }),
  ])
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.equal(back.title, '3')
  assert.deepEqual(back.pages.map((page) => page.id), ['z'])
})

test('필기 점은 압축해서 저장한다', async () => {
  const { files, dirs } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const saved = dirs.get(documentDirectory('k')).get('p1.json')
  assert.ok(saved.includes('packedPoints'))
  assert.ok(!saved.includes('"points"'))
})

test('목차 요약은 페이지 파일을 읽지 않는다', async () => {
  const { files, fail } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  fail.read = (name) => name.startsWith('p')
  const summary = await createDocumentStore({ files }).readSummary('k')
  assert.equal(summary.pageCount, 3)
  assert.equal(summary.doc.updatedAt, 't1')
  assert.deepEqual(summary.filled, [true, false, true])
  assert.ok(summary.bytes > 0)
})

test('바뀌지 않은 페이지의 크기도 목차에 유지된다', async () => {
  const { files, dirs } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  const before = (await store.readSummary('k')).bytes
  await store.writeDocument('k', { ...doc, title: '새 제목' })
  assert.equal((await store.readSummary('k')).bytes, before)
  const sizes = [...dirs.get(documentDirectory('k'))].filter(([name]) => name.startsWith('p')).reduce((sum, [, text]) => sum + text.length, 0)
  assert.equal(before, sizes)
})

test('페이지 정보만 바뀌면 내용 파일을 다시 쓰지 않는다', async () => {
  const { files, log } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  log.length = 0
  const pages = doc.pages.map((page, index) => (index === 0 ? { ...page, indexed: true, paperAppearance: { backgroundColor: '#fff' } } : page))
  await store.writeDocument('k', { ...doc, pages })
  assert.deepEqual(log, ['write manifest.tmp', 'replace manifest.json'])
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.equal(back.pages[0].indexed, true)
  assert.equal(back.pages[0].objects[0].id, 's1')
})

test('되돌리기로 돌아온 옛 내용은 파일이 지워졌으면 다시 쓴다', async () => {
  const { files } = memoryFiles()
  const store = createDocumentStore({ files })
  const doc = makeDoc()
  await store.writeDocument('k', doc)
  const edited = { ...doc, pages: [{ ...doc.pages[0], objects: [] }, doc.pages[1], doc.pages[2]] }
  await store.writeDocument('k', edited)
  await store.writeDocument('k', doc)
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('내용을 읽지 않은 페이지의 정보를 바꿔 저장해도 내용은 그대로다', async () => {
  const { files, log } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  assert.deepEqual(outline.pages.map((page) => [page.id, page.unloaded, page.objects.length]), [['a', true, 0], ['b', true, 0], ['c', true, 0]])
  log.length = 0
  await store.writeDocument('k', { ...outline, title: '새 제목', pages: outline.pages.map((page) => ({ ...page, indexed: true })) })
  assert.deepEqual(log, ['write manifest.tmp', 'replace manifest.json'])
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.equal(back.title, '새 제목')
  assert.deepEqual(back.pages.map((page) => page.indexed), [true, true, true])
  assert.deepEqual(back.pages.map(({ indexed, ...page }) => page), makeDoc().pages)
  assert.equal(back.pages.some((page) => 'unloaded' in page), false)
  assert.deepEqual((await store.readSummary('k')).filled, [true, false, true])
})

test('내용을 읽지 않은 페이지를 지우고 순서를 바꿔도 남은 내용은 그대로다', async () => {
  const { files } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  await store.writeDocument('k', { ...outline, pages: [outline.pages[2], outline.pages[0]] })
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.deepEqual(back.pages, [makeDoc().pages[2], makeDoc().pages[0]])
})

test('파일을 찾을 수 없는 unloaded 페이지가 있으면 저장 전체를 거부한다', async () => {
  const { files } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  await assert.rejects(store.writeDocument('k', { ...outline, title: '실패', pages: [...outline.pages, { id: 'copy', objects: [], unloaded: true }] }))
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), makeDoc())
})

test('읽지 않은 페이지와 읽은 페이지가 섞여도 읽은 페이지의 수정만 저장한다', async () => {
  const { files, log } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  const [loaded] = await store.readObjects('k', ['c'])
  assert.equal(loaded.objects[0].mediaFileId, 'media-1')
  log.length = 0
  const pages = outline.pages.map((page) => {
    if (page.id !== 'c') return page
    const { unloaded, ...rest } = page
    return { ...rest, objects: [...loaded.objects, { id: 'new', type: 'text' }] }
  })
  await store.writeDocument('k', { ...outline, pages })
  assert.deepEqual(log, ['write p4.json', 'write manifest.tmp', 'replace manifest.json'])
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.deepEqual(back.pages[0], makeDoc().pages[0])
  assert.deepEqual(back.pages[2].objects.map((object) => object.id), ['k', 'new'])
})

test('읽어 온 내용을 그대로 다시 저장하면 파일을 다시 쓰지 않는다', async () => {
  const { files, log } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  const loaded = await store.readObjects('k', ['a', 'b', 'c'])
  const byId = new Map(loaded.map((item) => [item.id, item.objects]))
  log.length = 0
  await store.writeDocument('k', { ...outline, pages: outline.pages.map(({ unloaded, ...page }) => ({ ...page, objects: byId.get(page.id) })) })
  assert.deepEqual(log, ['write manifest.tmp', 'replace manifest.json'])
})

test('objects 가 없는 페이지와 빈 페이지도 그대로 복원한다', async () => {
  const { files } = memoryFiles()
  const doc = { id: 'd', pages: [{ id: 'none' }, { id: 'empty', objects: [] }] }
  await createDocumentStore({ files }).writeDocument('k', doc)
  assert.deepEqual(await createDocumentStore({ files }).readDocument('k'), doc)
  const outline = await createDocumentStore({ files }).readOutline('k')
  assert.deepEqual(outline.pages[0], { id: 'none' })
})

test('지정한 페이지만 읽고 다른 페이지 파일은 건드리지 않는다', async () => {
  const { files } = memoryFiles()
  await createDocumentStore({ files }).writeDocument('k', makeDoc())
  const realRead = files.read, read = []
  files.read = async (dir, name) => { read.push(name); return realRead(dir, name) }
  const pages = await createDocumentStore({ files }).readPagesAt('k', [2])
  assert.deepEqual(pages.map((page) => page.id), ['c'])
  assert.deepEqual(read, ['manifest.json', 'p3.json'])
})

test('목록과 삭제', async () => {
  const { files } = memoryFiles()
  const store = createDocumentStore({ files })
  await store.writeDocument('dio:editor:doc:v4:a', makeDoc())
  await store.writeDocument('dio:member:v1:1:doc:b', makeDoc())
  assert.deepEqual((await store.listKeys()).sort(), ['dio:editor:doc:v4:a', 'dio:member:v1:1:doc:b'])
  await store.removeDocument('dio:editor:doc:v4:a')
  assert.equal(await store.readDocument('dio:editor:doc:v4:a'), null)
  assert.deepEqual(await store.listKeys(), ['dio:member:v1:1:doc:b'])
})

test('폴더 이름에 쓸 수 없는 글자를 겹치지 않게 바꾼다', () => {
  assert.match(documentDirectory('dio:editor:doc:v4:ab-1'), /^[A-Za-z0-9_-]+$/)
  assert.notEqual(documentDirectory('a:b'), documentDirectory('a_b'))
})
