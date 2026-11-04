import test from 'node:test'
import assert from 'node:assert/strict'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { createPageHydrator } from '../src/editor/utils/pageHydrator.js'
import { createDocumentStore } from '../src/editor/services/documentStore.js'

const loaded = (id, objects = [{ id: `${id}-o`, type: 'sticker', x: 0, y: 0 }]) => ({ id, canvasWidth: 100, canvasHeight: 100, objects })
const hollow = (id) => ({ id, canvasWidth: 100, canvasHeight: 100, objects: [], unloaded: true })
const partial = (pages, pageId) => createInitialState({ id: 'd', title: 't', pages }, pageId)

test('내용을 다 읽기 전에는 복제 · 삭제 · 초기화를 막는다', () => {
  const state = partial([loaded('a'), hollow('b')], 'a')
  assert.equal(state.pagesLoading, true)
  for (const action of [{ type: 'duplicatePage', id: 'a' }, { type: 'removePage', id: 'a' }, { type: 'removePages', ids: ['b'] }, { type: 'resetDiary' }]) {
    assert.equal(editorReducer(state, action), state, action.type)
  }
})

test('지금 페이지를 읽기 전에는 요소를 바꿀 수 없다', () => {
  const state = partial([loaded('a'), hollow('b')], 'b')
  for (const action of [
    { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] },
    { type: 'updateObject', id: 'x', patch: {} },
    { type: 'pasteObjects', objects: [{ id: 'n', x: 0, y: 0 }] },
    { type: 'removeObjects', ids: [] },
    { type: 'checkpoint' },
    { type: 'setPlanner', planner: {} },
  ]) assert.equal(editorReducer(state, action), state, action.type)
})

test('읽은 페이지는 다른 페이지를 읽는 중에도 편집할 수 있다', () => {
  const state = partial([loaded('a'), hollow('b')], 'a')
  const next = editorReducer(state, { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] })
  assert.deepEqual(next.doc.pages[0].objects.map((object) => object.id), ['a-o', 'n'])
  assert.equal(next.doc.pages[1].unloaded, true)
  assert.equal(next.past.length, 1)
})

test('페이지 이동과 페이지 정보 변경은 읽는 중에도 된다', () => {
  const state = partial([loaded('a'), hollow('b')], 'a')
  assert.equal(editorReducer(state, { type: 'selectPage', id: 'b' }).pageId, 'b')
  const indexed = editorReducer(state, { type: 'togglePageIndex', id: 'b' })
  assert.equal(indexed.doc.pages[1].indexed, true)
  assert.equal(indexed.doc.pages[1].unloaded, true)
})

test('읽어 온 내용은 문서와 되돌리기 기록에 함께 채워지고 기록을 늘리지 않는다', () => {
  let state = partial([loaded('a'), hollow('b'), hollow('c')], 'a')
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] })
  state = editorReducer(state, { type: 'togglePageIndex', id: 'b' })
  const objects = [{ id: 'b-o', type: 'sticker' }]
  state = editorReducer(state, { type: 'hydratePages', items: [{ id: 'b', objects }], done: false })
  assert.equal(state.past.length, 2)
  assert.equal(state.pagesLoading, true)
  const page = state.doc.pages[1]
  assert.equal(page.objects, objects)
  assert.equal(page.indexed, true)
  assert.equal('unloaded' in page, false)
  assert.equal(state.past[0].pages[1].objects, objects)
  assert.equal(state.past[0].pages[1].indexed, undefined)
  state = editorReducer(state, { type: 'hydratePages', items: [{ id: 'c', objects: [] }], done: true })
  assert.equal('pagesLoading' in state, false)
  assert.equal(state.doc.pages.some((item) => item.unloaded), false)
  assert.equal(state.past.some((doc) => doc.pages.some((item) => item.unloaded)), false)
})

test('되돌렸다가 내용이 채워져도 편집이 섞이지 않는다', () => {
  let state = partial([loaded('a'), hollow('b')], 'a')
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] })
  state = editorReducer(state, { type: 'undo' })
  state = editorReducer(state, { type: 'hydratePages', items: [{ id: 'b', objects: [{ id: 'b-o' }] }], done: true })
  assert.deepEqual(state.doc.pages[0].objects.map((object) => object.id), ['a-o'])
  state = editorReducer(state, { type: 'redo' })
  assert.deepEqual(state.doc.pages[0].objects.map((object) => object.id), ['a-o', 'n'])
  assert.deepEqual(state.doc.pages[1].objects.map((object) => object.id), ['b-o'])
})

test('다 읽은 뒤에는 복제 · 삭제가 된다', () => {
  let state = partial([loaded('a'), hollow('b')], 'a')
  state = editorReducer(state, { type: 'hydratePages', items: [{ id: 'b', objects: [{ id: 'b-o', type: 'text' }] }], done: true })
  assert.equal(editorReducer(state, { type: 'duplicatePage', id: 'b' }).doc.pages.length, 3)
  assert.equal(editorReducer(state, { type: 'removePage', id: 'b' }).doc.pages.length, 1)
})

test('합치기만 한 변경인지 알 수 있다', () => {
  let state = partial([loaded('a'), hollow('b'), hollow('c')], 'a')
  state = editorReducer(state, { type: 'hydratePages', items: [{ id: 'b', objects: [] }], done: false })
  assert.equal(state.hydratedDoc, state.doc)
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] })
  assert.notEqual(state.hydratedDoc, state.doc)
})

test('읽는 중 편집한 문서를 저장하고 끝까지 읽어도 모든 내용이 남는다', async () => {
  const dirs = new Map()
  const files = {
    async directories() { return [...dirs.keys()] },
    async names(dir) { return [...(dirs.get(dir)?.keys() ?? [])] },
    async ensure(dir) { if (!dirs.has(dir)) dirs.set(dir, new Map()) },
    async read(dir, name) { return dirs.get(dir).get(name) },
    async write(dir, name, text) { dirs.get(dir).set(name, text) },
    async replace(dir, from, to) { dirs.get(dir).set(to, dirs.get(dir).get(from)); dirs.get(dir).delete(from) },
    async remove(dir, name) { dirs.get(dir).delete(name) },
    async removeAll(dir) { dirs.delete(dir) },
  }
  const original = { id: 'd', title: 't', pages: [loaded('a'), loaded('b'), loaded('c')] }
  await createDocumentStore({ files }).writeDocument('k', original)
  const store = createDocumentStore({ files })
  const outline = await store.readOutline('k')
  const [first] = await store.readObjects('k', ['a'])
  let state = editorReducer(createInitialState(outline, 'a'), { type: 'hydratePages', items: [first], done: false })
  state = editorReducer(state, { type: 'addObjects', objects: [{ id: 'n', type: 'text' }] })
  state = editorReducer(state, { type: 'togglePageIndex', id: 'c' })
  await store.writeDocument('k', state.doc)
  state = editorReducer(state, { type: 'hydratePages', items: await store.readObjects('k', ['b', 'c']), done: true })
  await store.writeDocument('k', state.doc)
  const back = await createDocumentStore({ files }).readDocument('k')
  assert.deepEqual(back.pages.map((page) => page.objects.map((object) => object.id)), [['a-o', 'n'], ['b-o'], ['c-o']])
  assert.equal(back.pages[2].indexed, true)
})

const settle = () => new Promise((resolve) => setImmediate(resolve))
async function runHydrator(options) {
  const reads = [], flushed = []
  let finished = false
  const hydrator = createPageHydrator({
    read: async (ids) => { reads.push(ids); return ids.map((id) => ({ id, objects: [] })) },
    onPages: (items, done) => { flushed.push(items.map((item) => item.id)); if (done) finished = true },
    onError() {},
    wait: () => Promise.resolve(),
    ...options,
  })
  hydrator.start()
  for (let i = 0; i < 2000 && !finished; i += 1) await settle()
  return { reads, flushed, finished, hydrator }
}

test('보고 있는 페이지에서 가까운 순서로 모두 읽는다', async () => {
  const ids = Array.from({ length: 30 }, (_, index) => `p${index}`)
  const { reads, flushed, finished } = await runHydrator({ ids, currentId: () => 'p10' })
  assert.equal(finished, true)
  assert.equal(reads[0][0], 'p10')
  assert.deepEqual(reads[0].slice(1, 3), ['p11', 'p9'])
  assert.equal(new Set(reads.flat()).size, 30)
  assert.equal(new Set(flushed.flat()).size, 30)
})

test('문서가 커도 화면에 합치는 횟수는 일정하다', async () => {
  const ids = Array.from({ length: 5000 }, (_, index) => `p${index}`)
  const { flushed, finished } = await runHydrator({ ids, currentId: () => 'p0' })
  assert.equal(finished, true)
  assert.ok(flushed.length <= 12, `합친 횟수 ${flushed.length}`)
  assert.equal(new Set(flushed.flat()).size, 5000)
})

test('보던 페이지가 바뀌면 다음 묶음은 그 근처에서 읽는다', async () => {
  const ids = Array.from({ length: 60 }, (_, index) => `p${index}`)
  let current = 'p0'
  const seen = []
  await runHydrator({ ids, currentId: () => current, read: async (batch) => { seen.push(batch); current = 'p50'; return batch.map((id) => ({ id, objects: [] })) } })
  assert.equal(seen[0][0], 'p0')
  assert.equal(seen[1][0], 'p50')
})

test('누르는 동안 쉬고, 뗀 뒤에 이어서 읽는다', async () => {
  const ids = Array.from({ length: 100 }, (_, index) => `p${index}`)
  const reads = []
  let finished = false
  const hydrator = createPageHydrator({
    ids, currentId: () => 'p0', resumeDelayMs: 5, wait: () => new Promise((resolve) => setImmediate(resolve)),
    read: async (batch) => { reads.push(batch); return batch.map((id) => ({ id, objects: [] })) },
    onPages: (_, done) => { if (done) finished = true },
    onError() {},
  })
  hydrator.start()
  await settle()
  hydrator.pause()
  await settle(); await settle()
  const during = reads.length
  for (let i = 0; i < 20; i += 1) await settle()
  assert.equal(reads.length, during)
  assert.equal(finished, false)
  hydrator.resume()
  for (let i = 0; i < 200 && !finished; i += 1) await new Promise((resolve) => setTimeout(resolve, 2))
  assert.equal(finished, true)
  assert.equal(new Set(reads.flat()).size, 100)
})

test('쉬는 중에도 보고 있는 페이지는 읽는다', async () => {
  const ids = Array.from({ length: 100 }, (_, index) => `p${index}`)
  let current = 'p0'
  const reads = [], flushed = []
  const hydrator = createPageHydrator({
    ids, currentId: () => current, resumeDelayMs: 5, wait: () => new Promise((resolve) => setImmediate(resolve)),
    read: async (batch) => { reads.push(batch); return batch.map((id) => ({ id, objects: [] })) },
    onPages: (items) => flushed.push(...items.map((item) => item.id)),
    onError() {},
  })
  hydrator.start()
  await settle()
  hydrator.pause()
  await settle(); await settle()
  current = 'p90'
  hydrator.prioritize()
  for (let i = 0; i < 20; i += 1) await settle()
  assert.ok(reads.flat().includes('p90'))
  assert.ok(flushed.includes('p90'))
  hydrator.stop()
})

test('읽기에 실패하면 멈추고 알린다', async () => {
  const errors = []
  let done = false
  createPageHydrator({
    ids: ['a', 'b'], currentId: () => 'a', wait: () => Promise.resolve(),
    read: async () => { throw new Error('읽기 실패') },
    onPages: () => { done = true },
    onError: (error) => errors.push(error.message),
  }).start()
  await settle()
  assert.deepEqual(errors, ['읽기 실패'])
  assert.equal(done, false)
})

test('멈추면 더 읽지 않고 내용을 보내지 않는다', async () => {
  const calls = []
  let release
  const hydrator = createPageHydrator({
    ids: ['a', 'b'], currentId: () => 'a', wait: () => Promise.resolve(),
    read: (ids) => { calls.push(ids); return new Promise((resolve) => { release = () => resolve(ids.map((id) => ({ id, objects: [] }))) }) },
    onPages: () => assert.fail('멈춘 뒤에는 보내지 않는다'),
    onError: () => assert.fail('멈춘 뒤에는 알리지 않는다'),
  })
  hydrator.start()
  await settle()
  hydrator.stop()
  release()
  await settle()
  assert.equal(calls.length, 1)
})

test('돌려받지 못한 페이지가 있으면 다 읽었다고 하지 않고 실패로 알린다', async () => {
  const done = [], errors = []
  let reads = 0
  await new Promise((resolve) => {
    createPageHydrator({
      ids: ['a', 'b'],
      read: async () => { reads += 1; return [{ id: 'a', objects: [] }] },
      onPages: (_, finished) => done.push(finished),
      onError: (error) => { errors.push(error.message); resolve() },
      currentId: () => 'a',
      wait: async () => {},
    }).start()
  })
  assert.deepEqual(done, [])
  assert.deepEqual(errors, ['Page content not found: b'])
  assert.equal(reads, 2)
})

test('한 번 실패한 읽기는 다시 시도해 이어서 읽는다', async () => {
  const errors = []
  let reads = 0
  const items = await new Promise((resolve) => {
    createPageHydrator({
      ids: ['a'],
      read: async () => { reads += 1; if (reads === 1) throw new Error('잠깐 실패'); return [{ id: 'a', objects: [] }] },
      onPages: (pages, finished) => { if (finished) resolve(pages) },
      onError: (error) => errors.push(error),
      currentId: () => 'a',
      wait: async () => {},
    }).start()
  })
  assert.deepEqual(items.map((item) => item.id), ['a'])
  assert.deepEqual(errors, [])
})

test('되돌리기 기록은 20단계까지 남긴다', () => {
  let state = partial([loaded('a')], 'a')
  for (let i = 0; i < 25; i += 1) state = editorReducer(state, { type: 'addObjects', objects: [{ id: `n${i}`, type: 'text' }] })
  assert.equal(state.past.length, 20)
  for (let i = 0; i < 20; i += 1) state = editorReducer(state, { type: 'undo' })
  assert.equal(state.past.length, 0)
  assert.equal(editorReducer(state, { type: 'undo' }), state)
  assert.equal(state.doc.pages[0].objects.length, 6)
})
