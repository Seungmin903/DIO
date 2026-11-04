import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as bookSpread from '../src/diary/utils/bookSpread.js'
import * as memberStorage from '../src/diary/services/memberStorage.js'
import * as session from '../src/editor/services/sessionDocuments.js'

const require = createRequire(import.meta.url), expo = createRequire(require.resolve('expo/package.json'))
const { code } = expo('@babel/core').transformSync(readFileSync(new URL('../src/editor/services/editorDocs.js', import.meta.url), 'utf8'), {
  configFile: false, babelrc: false, plugins: [expo.resolve('@babel/plugin-transform-modules-commonjs')],
})

const page = (id, filled) => ({ id, objects: filled ? [{ id: `${id}-o` }] : [] })

function fixture(pages, { legacy = false } = {}) {
  const calls = []
  const storage = {
    loadSummary: async () => { calls.push('summary'); return legacy ? null : { doc: { updatedAt: 't1' }, pageCount: pages.length, filled: pages.map(bookSpread.pageHasContent) } },
    loadPagesAt: async (key, indexes) => { calls.push(['pages', indexes]); return indexes.map((index) => pages[index]) },
    loadDocument: async () => { calls.push('full'); return { updatedAt: 't1', pages } },
    saveDocument: async () => {},
  }
  const mocks = {
    './documentStorage': { __esModule: true, default: storage },
    '../../diary/services/memberStorage.js': memberStorage,
    '../../diary/utils/bookSpread.js': bookSpread,
    '../state/defaultDoc': { createDefaultDoc: () => ({ pages: [] }), migrateUntouchedAnnualDoc: (doc) => doc },
    '../templates/catalog.js': { templateReference: () => null },
    '../templates/loadTemplate': {},
    './mediaStore': {},
    './sessionDocuments.js': session,
    './editorViewState': { loadViewedPage: async () => null },
    './storage': { STORAGE_KEYS: { doc: 'guest:doc' } },
  }
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', code)((id) => mocks[id], mod, mod.exports)
  return { docs: mod.exports, calls, storage }
}
const diary = { id: 'd' }

test('보관함 요약은 페이지 내용을 읽지 않는다', async () => {
  const { docs, calls } = fixture([page('a', true), page('b', false)])
  assert.deepEqual(await docs.loadEditorSummary(diary), { pageCount: 2, updatedAt: 't1' })
  assert.deepEqual(calls, ['summary'])
})

test('펼침면은 마지막으로 쓴 쪽과 마주 보는 쪽만 읽는다', async () => {
  const pages = [page('a', true), page('b', false), page('c', false), page('d', true), page('e', false), page('f', false)]
  const { docs, calls } = fixture(pages)
  const source = await docs.loadEditorSpread(diary)
  assert.deepEqual(calls, ['summary', ['pages', [3, 4]]])
  assert.equal(source.latest, 4)
  assert.equal(source.total, 6)
  assert.equal(source.pageAt(4).id, 'd')
  assert.equal(source.pageAt(5).id, 'e')
})

test('펼침면의 쪽 번호 계산이 문서 전체로 계산한 결과와 같다', async () => {
  for (const flags of [[false], [true], [true, false], [false, true], [true, true, true], [false, false, true, false], [false, false, false, true]]) {
    const pages = flags.map((filled, index) => page(`p${index}`, filled))
    const whole = bookSpread.spreadOf(pages)
    const { docs } = fixture(pages)
    const source = await docs.loadEditorSpread(diary)
    const partial = bookSpread.spreadAt(source.pageAt, source.latest, source.total)
    assert.deepEqual(partial, whole, JSON.stringify(flags))
  }
})

test('다시 볼 때는 파일을 또 읽지 않고, 문서가 바뀌면 새로 읽는다', async () => {
  const { docs, calls } = fixture([page('a', true)])
  const key = docs.editorDocKey(diary)
  const first = await docs.loadEditorSpread(diary)
  calls.length = 0
  assert.equal(await docs.loadEditorSpread(diary), first)
  assert.equal(docs.peekEditorSpread(key), first)
  assert.deepEqual(calls, [])
  const edited = { pages: [page('new', true)] }
  docs.rememberEditorDoc(key, edited)
  assert.equal(docs.peekEditorSpread(key).doc, edited)
  docs.forgetEditorDoc(key)
  assert.equal(docs.peekEditorSpread(key), null)
})

test('목차가 없는 문서는 전체를 읽는다', async () => {
  const { docs, calls } = fixture([page('a', true)], { legacy: true })
  const source = await docs.loadEditorSpread(diary)
  assert.equal(source.doc.pages[0].id, 'a')
  assert.ok(calls.includes('full'))
  assert.equal((await docs.loadEditorSummary({ id: 'other' })).pageCount, 1)
})

test('미리 읽기는 상한까지만 문서 전체를 올리고 큰 문서는 건너뛴다', async () => {
  const { docs, calls, storage } = fixture([page('a', true)])
  const sizes = { small: 100, big: 1000, next: 300, over: 700 }
  storage.loadSummary = async (key) => ({ doc: {}, pageCount: 1, filled: [true], bytes: sizes[key.split(':').pop()] })
  storage.loadDocument = async (key) => { calls.push(['full', key.split(':').pop()]); return { pages: [page('a', true)] } }
  await docs.prefetchEditors([{ id: 'small' }, { id: 'big' }, { id: 'next' }, { id: 'over' }], { limit: 500 })
  assert.deepEqual(calls.filter((call) => call[0] === 'full').map((call) => call[1]), ['small', 'next'])
})

test('미리 읽기는 취소되면 멈추고, 목차가 없는 문서는 그대로 읽는다', async () => {
  const { docs, calls } = fixture([page('a', true)], { legacy: true })
  await docs.prefetchEditors([{ id: 'x' }, { id: 'y' }], { isCancelled: () => true })
  assert.ok(!calls.includes('full'))
  await docs.prefetchEditors([{ id: 'x' }])
  assert.ok(calls.includes('full'))
})

test('편집 중인 문서는 저장소 대신 메모리 값을 쓴다', async () => {
  const { docs, calls } = fixture([page('a', true)])
  const key = docs.editorDocKey(diary)
  docs.rememberEditorDoc(key, { updatedAt: 't9', pages: [page('x', true), page('y', true)] })
  assert.deepEqual(await docs.loadEditorSummary(diary), { pageCount: 2, updatedAt: 't9' })
  assert.deepEqual(calls, [])
})
