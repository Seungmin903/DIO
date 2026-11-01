import test from 'node:test'
import assert from 'node:assert/strict'
import { collectPdfSourceIds } from '../src/diary/utils/pdfSource.js'
import { cleanupRemovedEntry, findUnshared } from '../src/diary/utils/libraryCleanup.js'
import { collectMediaIds } from '../src/editor/utils/mediaReferences.js'
import { SWEEP_GRACE_MS, addImportGroup, normalizeImportGroups, removeImportGroup, sweepGroups } from '../src/diary/utils/pdfImportSweep.js'

const keys = { doc: 'doc', diaries: 'diaries', customDecor: 'decor', myCovers: 'covers', myPapers: 'papers', pdfImports: 'imports' }
const page = (n, source) => ({ src: `media:m${n}`, mediaFileId: `m${n}`, aspect: 0.7, pdfSource: { sourceId: source, pageIndex: n - 1, edge: 3000 } })
const entry = { id: 'p1', pages: [page(1, 'srcA'), page(2, 'srcA')] }
const docWith = (...pages) => JSON.stringify({ pages: [{ objects: pages.map(p => ({ type: 'sticker', mediaFileId: p.mediaFileId, src: p.src, pdfSource: p.pdfSource })) }] })

const fakeStorage = records => ({
  getAllKeys: async () => Object.keys(records),
  multiGet: async list => list.map(key => [key, records[key] ?? null]),
})
const run = async records => {
  const removed = { media: [], source: [] }
  const result = await cleanupRemovedEntry({ entry, storage: fakeStorage(records), keys, collectMediaIds, collectSourceIds: collectPdfSourceIds,
    removeMedia: async id => { removed.media.push(id) }, removeSource: async id => { removed.source.push(id) } })
  return { result, removed }
}

test('문서 · 보관함 값 안의 원본 PDF id 를 모은다', () => {
  assert.deepEqual(collectPdfSourceIds(entry).sort(), ['srcA'])
  assert.deepEqual(collectPdfSourceIds({ a: [{ pdfSource: { sourceId: 'x', pageIndex: 0 } }, { b: { pdfSource: { sourceId: '../bad', pageIndex: 0 } } }] }), ['x'])
  assert.deepEqual(collectPdfSourceIds(null), [])
})

test('다른 곳이 쓰는 쪽 그림 · 원본은 남기고 아무도 안 쓰는 것만 골라낸다', () => {
  const unshared = findUnshared({ target: entry, raws: [docWith(page(1, 'srcA'))], collectMediaIds, collectSourceIds: collectPdfSourceIds })
  assert.deepEqual(unshared, { mediaIds: ['m2'], sourceIds: [] })
  const all = findUnshared({ target: entry, raws: [], collectMediaIds, collectSourceIds: collectPdfSourceIds })
  assert.deepEqual(all.mediaIds.sort(), ['m1', 'm2']); assert.deepEqual(all.sourceIds, ['srcA'])
})

test('나의 속지를 지우면 쪽 그림 · 원본을 지우되, 같은 PDF 를 쓰는 다이어리가 있으면 그것은 남긴다', async () => {
  const lone = await run({ 'doc:d1': JSON.stringify({ pages: [{ objects: [] }] }), papers: '[]', covers: '[]' })
  assert.deepEqual(lone.removed.media.sort(), ['m1', 'm2']); assert.deepEqual(lone.removed.source, ['srcA'])
  // 첫 쪽만 쓰는 다이어리가 있다: 첫 쪽 그림과 원본은 남고 둘째 쪽만 지운다
  const shared = await run({ 'doc:d1': docWith(page(1, 'srcA')), papers: '[]' })
  assert.deepEqual(shared.removed.media, ['m2']); assert.deepEqual(shared.removed.source, [])
  // 기본 문서 · 내 꾸미기 소재 · 다른 나의 속지가 써도 남긴다
  const kept = await run({ doc: docWith(page(1, 'srcA'), page(2, 'srcA')) })
  assert.deepEqual(kept.removed, { media: [], source: [] })
  const other = await run({ papers: JSON.stringify([{ id: 'p2', pages: [page(2, 'srcA')] }]), decor: '[]' })
  assert.deepEqual(other.removed.media, ['m1']); assert.deepEqual(other.removed.source, [])
  // 다이어리 목록의 표지 사진(첫 쪽을 표지로 쓴 경우)도 쓰는 곳이다
  const cover = await run({ diaries: JSON.stringify([{ id: 'd1', cover: { photo: { src: 'media:m1', mediaFileId: 'm1' } } }]) })
  assert.deepEqual(cover.removed.media, ['m2']); assert.deepEqual(cover.removed.source.sort(), ['srcA'])
  // 불러온 PDF 기록은 모든 id 를 들고 있으므로 참조로 세지 않는다
  const registry = await run({ imports: JSON.stringify([{ sourceId: 'srcA', mediaFileIds: ['m1', 'm2'] }]) })
  assert.deepEqual(registry.removed.media.sort(), ['m1', 'm2'])
})

test('저장값을 읽다 실패하면 아무것도 지우지 않는다', async () => {
  const unreadable = await cleanupRemovedEntry({ entry, storage: { getAllKeys: async () => { throw new Error('storage') }, multiGet: async () => [] }, keys,
    collectMediaIds, collectSourceIds: collectPdfSourceIds, removeMedia: async () => { throw new Error('should not run') }, removeSource: async () => { throw new Error('should not run') } })
  assert.deepEqual(unreadable, { mediaIds: [], sourceIds: [] })
  assert.deepEqual((await cleanupRemovedEntry({ entry: null, storage: fakeStorage({}), keys, collectMediaIds, collectSourceIds: collectPdfSourceIds, removeMedia() {}, removeSource() {} })), { mediaIds: [], sourceIds: [] })
})

test('휴지통 영구 삭제도 다른 문서 · 나의 속지가 안 쓰는 원본 PDF 만 지운다', async () => {
  const { purgeTrashedDiary } = await import('../src/diary/utils/trashRetention.js')
  const run = async others => {
    const store = { diaries: JSON.stringify([{ id: 'd1', trashedAt: '2026-01-01T00:00:00.000Z' }]), 'doc:d1': docWith(page(1, 'srcA'), page(2, 'srcB')), ...others }
    const storage = { ...fakeStorage(store), getItem: async key => store[key] ?? null, setItem: async (key, value) => { store[key] = value }, removeItem: async key => { delete store[key] } }
    let diaries = JSON.parse(store.diaries)
    const removed = { media: [], source: [] }
    const ok = await purgeTrashedDiary({ id: 'd1', storage, keys, getDiaries: () => diaries, updateDiaries: change => { diaries = change(diaries) }, forgetDoc() {}, forgetView: async () => true,
      collectMediaIds, removeMedia: async id => { removed.media.push(id) }, collectSourceIds: collectPdfSourceIds, removeSource: async id => { removed.source.push(id) } })
    return { ok, removed }
  }
  const alone = await run({})
  assert.equal(alone.ok, true); assert.deepEqual(alone.removed.media.sort(), ['m1', 'm2']); assert.deepEqual(alone.removed.source.sort(), ['srcA', 'srcB'])
  // 나의 속지가 srcA 의 한 쪽을 쓰고 있으면 그 쪽 그림과 srcA 는 남는다
  const shared = await run({ papers: JSON.stringify([{ id: 'p', pages: [page(1, 'srcA')] }]) })
  assert.deepEqual(shared.removed.media, ['m2']); assert.deepEqual(shared.removed.source, ['srcB'])
})


const DAY = SWEEP_GRACE_MS
const NOW = Date.parse('2026-11-10T00:00:00Z')
const group = (sourceId, mediaFileIds, ageMs) => ({ sourceId, mediaFileIds, createdAt: new Date(NOW - ageMs).toISOString() })

test('불러온 PDF 기록은 잘못된 항목을 버리고, 같은 원본은 한 줄로 갱신한다', () => {
  assert.deepEqual(normalizeImportGroups('bad'), [])
  assert.deepEqual(normalizeImportGroups([null, {}, { sourceId: 'a', mediaFileIds: ['m1', 3] }, { sourceId: '', mediaFileIds: [] }]).map(g => [g.sourceId, g.mediaFileIds]), [['a', ['m1']]])
  const first = addImportGroup([], { sourceId: 'a', mediaFileIds: ['m1'] }, NOW)
  const again = addImportGroup(first, { sourceId: 'a', mediaFileIds: ['m1', 'm2'] }, NOW)
  assert.equal(again.length, 1); assert.deepEqual(again[0].mediaFileIds, ['m1', 'm2'])
  assert.deepEqual(removeImportGroup(again, 'a'), [])
})

test('고아 점검: 하루가 안 된 기록은 건드리지 않고, 오래된 것 중 어디에도 없는 쪽 그림 · 원본만 지운다', () => {
  const groups = [group('fresh', ['f1'], DAY / 2), group('old', ['o1', 'o2', 'o3'], DAY * 3), group('kept', ['k1'], DAY * 3), group('gone', ['g1'], DAY * 3)]
  const raws = [JSON.stringify({ cover: { mediaFileId: 'o2' } }), JSON.stringify({ pages: [{ pdfSource: { sourceId: 'kept' }, mediaFileId: 'k1' }] }), null, '깨진 값 {{']
  const { mediaIds, sourceIds, remaining } = sweepGroups({ groups, raws, now: NOW })
  assert.deepEqual(mediaIds.sort(), ['g1', 'o1', 'o3'])
  assert.deepEqual(sourceIds.sort(), ['gone', 'old'])
  // 남는 기록: 새것, 아직 쓰는 쪽(o2)만 남은 old(원본은 지워서 null), kept
  assert.deepEqual(remaining.map(g => [g.sourceId, g.mediaFileIds]), [['fresh', ['f1']], [null, ['o2']], ['kept', ['k1']]])
  // 나중에 o2 · kept 도 안 쓰게 되면 다음 점검에서 지운다
  const next = sweepGroups({ groups: remaining, raws: [], now: NOW })
  assert.deepEqual(next.mediaIds.sort(), ['k1', 'o2']); assert.deepEqual(next.sourceIds.sort(), ['kept'])
  assert.deepEqual(next.remaining.map(g => g.sourceId), ['fresh'])
})
