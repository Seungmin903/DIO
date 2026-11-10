import test from 'node:test'
import assert from 'node:assert/strict'
import { createPaperLibrarySync, mergePapers } from '../src/diary/services/paperLibrarySync.js'
import { normalizeMyPapers } from '../src/diary/utils/myLibrary.js'
import { normalizePaperAppearance } from '../src/editor/templates/appearance.js'

// 서버 한 대(계정 하나)와 기기 여러 대를 흉내 낸다. 서버는 PaperLibraryService 처럼 칸 순서를 고정하고 빈 칸을 null 로 돌려주며,
// 앱(StickerLibrarySyncHost 의 readPapers)처럼 null 을 뺀 뒤 넘긴다. 기기 목록은 useMyLibrary 처럼 normalizeMyPapers 를 거친다.
const dropNulls = item => Object.fromEntries(Object.entries(item ?? {}).filter(([, v]) => v != null))
const asServerStyle = style => style ? { backgroundColor: style.backgroundColor.toUpperCase(), layoutColor: style.layoutColor.toUpperCase(), font: style.font ?? null } : null
const asServer = papers => papers.map(p => ({ id: p.id, name: p.name, createdAt: p.createdAt ?? null, orientation: p.orientation,
  pages: p.pages.map(page => ({ mediaFileId: page.mediaFileId, aspect: page.aspect, name: page.name ?? null })) }))
const asApp = doc => ({ version: doc.version, papers: doc.papers.map(p => ({ ...dropNulls(p), pages: p.pages.map(dropNulls) })), style: doc.style ? dropNulls(doc.style) : null })
function server() {
  const state = { version: 0, papers: [], style: null, puts: 0, uploads: new Map(), categories: [], conflictOnce: null }
  let serial = 0
  const doc = () => asApp(structuredClone({ version: state.version, papers: asServer(state.papers), style: asServerStyle(state.style) }))
  return {
    state,
    api: {
      get: async () => doc(),
      put: async (expected, papers, style) => {
        state.puts++
        if (state.conflictOnce) { state.version++; state.papers = [...state.papers, state.conflictOnce]; state.conflictOnce = null }
        if (expected !== state.version) throw Object.assign(Error('conflict'), { status: 409 })
        state.version++; state.papers = structuredClone(papers); state.style = style ? structuredClone(style) : null
        return doc()
      },
    },
    upload: async (localId, category) => { const id = `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`; state.uploads.set(id, localId); state.categories.push(category); return id },
  }
}
function device(remote, { account = '1', papers = [], style = null, storage = new Map(), failUploads = new Set(), failDownloads = new Map() } = {}) {
  const local = { papers: normalizeMyPapers(structuredClone(papers)), style: style ? normalizePaperAppearance(style) : null }
  const listeners = new Set(), downloads = [], errors = [], statuses = []
  const fire = () => listeners.forEach(listener => listener())
  const library = {
    ready: async () => {},
    papers: () => local.papers,
    style: () => local.style,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    replacePapers: async (next, base) => { if (base !== local.papers) return false; local.papers = normalizeMyPapers(next); fire(); return true },
    replaceStyle: async (next, base) => { if (base !== local.style) return false; local.style = next == null ? null : normalizePaperAppearance(next); fire(); return true },
  }
  const edit = next => { local.papers = normalizeMyPapers(next); fire() }
  const setStyle = next => { local.style = normalizePaperAppearance(next); fire() }
  const sync = createPaperLibrarySync({
    account, api: remote.api, library, key: 'paper-sync',
    storage: { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v) } },
    media: { upload: async (id, category) => { if (failUploads.has(id)) throw Error('too large'); return remote.upload(id, category) }, download: async id => { if (failDownloads.has(id)) throw Object.assign(Error('download failed'), { status: failDownloads.get(id) }); downloads.push(id) } },
    setTimer: run => ({ run }), clearTimer: timer => { timer.cleared = true },
    onError: error => errors.push(error.message),
    onStatus: next => statuses.push(next.error),
  })
  return { sync, local, edit, setStyle, downloads, errors, statuses, storage }
}
const L = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`
// 공방에서 PDF 로 만든 속지 묶음(pickPdfPages 결과 모양: 쪽마다 확대용 원본 PDF 연결 pdfSource)
const planner = (id, pages, name = '플래너') => ({ id, name, createdAt: '2026-11-10T01:00:00.000Z', orientation: 'portrait',
  pages: pages.map((media, index) => ({ src: `media:${media}`, mediaFileId: media, aspect: 0.7071067811865476, name: `${name} ${index + 1}쪽`, pdfSource: { sourceId: 'pdf1', pageIndex: index, edge: 3000 } })) })
const CREAM = { backgroundColor: '#FFF8E7', layoutColor: '#33476B', font: 'nanum-gothic' }

test('기기 A 의 내 속지 · 기본 속지 스타일이 서버에 올라가고, 새 기기 B · 재설치 기기에서 같게 복원된다', async () => {
  const remote = server()
  const a = device(remote, { papers: [planner('p1', [L(1), L(2)]), planner('p2', [L(3)], '모눈')], style: CREAM })
  await a.sync.start()
  assert.equal(remote.state.version, 1)
  assert.deepEqual(remote.state.papers.map(p => p.id), ['p1', 'p2'])
  assert.deepEqual(remote.state.papers[0].pages.map(page => remote.state.uploads.get(page.mediaFileId)), [L(1), L(2)])
  assert.equal(remote.state.papers[0].pages[0].pdfSource, undefined) // 원본 PDF 연결은 기기에만 둔다
  assert.deepEqual(remote.state.categories, ['PHOTO', 'PHOTO', 'PHOTO'])
  assert.deepEqual(remote.state.style, CREAM)

  const b = device(remote) // 같은 계정의 새 기기(재설치 기기도 기기 기록이 비어 같다)
  await b.sync.start()
  assert.deepEqual(b.local.papers.map(p => [p.id, p.name, p.orientation, p.pages.length]), [['p1', '플래너', 'portrait', 2], ['p2', '모눈', 'portrait', 1]])
  const first = remote.state.papers[0].pages[0].mediaFileId
  assert.equal(b.local.papers[0].pages[0].mediaFileId, first)
  assert.equal(b.local.papers[0].pages[0].src, `media:${first}`)
  assert.equal(b.local.papers[0].pages[1].name, '플래너 2쪽')
  assert.equal(b.local.papers[0].pages[0].aspect, 0.7071067811865476)
  assert.deepEqual(b.local.style, CREAM)
  assert.equal(b.downloads.length, 3)
  assert.equal(remote.state.puts, 1) // 받기만 했으니 다시 올리지 않는다

  // 다시 맞춰도 바뀐 것이 없으면 저장하지 않는다(칸 순서 · null · 정리 때문에 '바뀜'으로 보이지 않는다)
  await a.sync.sync(); await b.sync.sync()
  assert.equal(remote.state.puts, 1)
  // A 는 자기 그림 · 원본 PDF 연결을 그대로 쓴다
  assert.equal(a.local.papers[0].pages[0].mediaFileId, L(1))
  assert.equal(a.local.papers[0].pages[0].pdfSource.sourceId, 'pdf1')
})

test('기본 속지 스타일만 바꿔도 다른 기기에 반영되고, 속지를 지우면 다른 기기에서도 빠진다', async () => {
  const remote = server()
  const a = device(remote, { papers: [planner('p1', [L(1)]), planner('p2', [L(2)])] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  assert.equal(b.local.style, null) // 아무도 고르지 않았으면 기본값(고른 적 없음) 그대로

  b.setStyle({ backgroundColor: '#292929', layoutColor: '#FFFFFF' })
  await b.sync.whenIdle()
  await a.sync.sync()
  assert.deepEqual(a.local.style, { backgroundColor: '#292929', layoutColor: '#FFFFFF' })

  a.edit(a.local.papers.filter(p => p.id !== 'p2'))
  await a.sync.whenIdle()
  await b.sync.sync()
  assert.deepEqual(b.local.papers.map(p => p.id), ['p1'])
  assert.deepEqual(b.local.style, { backgroundColor: '#292929', layoutColor: '#FFFFFF' })
})

test('두 기기에서 따로 만든 속지는 합쳐 모두 남고, 동시 저장(409)도 서로 덮어쓰지 않는다', async () => {
  const remote = server()
  const a = device(remote, { papers: [planner('p1', [L(1)])] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  a.edit([planner('pa', [L(11)]), ...a.local.papers])
  b.edit([planner('pb', [L(21)]), ...b.local.papers])
  await a.sync.whenIdle(); await b.sync.whenIdle(); await a.sync.sync()
  assert.deepEqual(remote.state.papers.map(p => p.id).sort(), ['p1', 'pa', 'pb'])
  assert.deepEqual(a.local.papers.map(p => p.id).sort(), ['p1', 'pa', 'pb'])
  assert.deepEqual(b.local.papers.map(p => p.id).sort(), ['p1', 'pa', 'pb'])

  remote.state.conflictOnce = asServer(normalizeMyPapers([planner('pc', [L(1)])]))[0]
  a.edit([planner('pd', [L(31)]), ...a.local.papers])
  await a.sync.whenIdle()
  assert.ok(remote.state.papers.some(p => p.id === 'pc'))
  assert.ok(remote.state.papers.some(p => p.id === 'pd'))
})

test('올리지 못한 쪽이 있는 속지는 기기에만 남고 서버 목록에서 지워지지 않는다', async () => {
  const remote = server()
  const a = device(remote, { papers: [planner('p1', [L(1), L(2)]), planner('p2', [L(3)])], failUploads: new Set([L(2)]) })
  await a.sync.start()
  assert.deepEqual(remote.state.papers.map(p => p.id), ['p2'])
  assert.deepEqual(a.local.papers.map(p => p.id), ['p1', 'p2'])
  assert.equal(a.errors.length, 1)
})

test('다른 계정이 쓰던 기기에서는 이전 계정의 속지 · 스타일을 올리지 않고 서버 것을 받는다', async () => {
  const remote = server()
  const storage = new Map()
  const old = device(server(), { account: '7', papers: [planner('mine', [L(1)])], style: CREAM, storage })
  await old.sync.start()
  const next = device(remote, { account: '8', papers: old.local.papers, style: CREAM, storage })
  await next.sync.start()
  assert.equal(remote.state.puts, 0)
  assert.deepEqual(next.local.papers, [])
  assert.equal(next.local.style, null)
})

test('mergePapers 는 앞 목록 순서를 지키고 뒤 목록에만 있는 속지를 덧붙인다', () => {
  assert.deepEqual(mergePapers([{ id: 'a' }, { id: 'b' }], [{ id: 'b', name: 'x' }, { id: 'c' }]).map(p => p.id), ['a', 'b', 'c'])
})

test('받지 못한 쪽 그림은 기억해 두고 맞출 때마다 다시 받으며, 그동안 공방에 알린다(404 · 410 은 다시 받지 않는다)', async () => {
  const remote = server()
  const a = device(remote, { papers: [planner('p1', [L(1), L(2)]), planner('p2', [L(3)], '모눈')] })
  await a.sync.start()
  const [first, second] = remote.state.papers[0].pages.map(page => page.mediaFileId)
  const gone = remote.state.papers[1].pages[0].mediaFileId
  const storage = new Map()
  // 새 기기: 첫 쪽은 연결이 끊겨(상태 없음) 못 받고, 셋째 쪽은 서버에서 파일이 지워졌다(404)
  const failDownloads = new Map([[first, undefined], [gone, 404]])
  const b = device(remote, { storage, failDownloads })
  await b.sync.start()
  assert.deepEqual(b.downloads, [second])
  assert.deepEqual(b.local.papers.map(p => p.pages.length), [2, 1]) // 못 받은 쪽도 속지는 남긴다
  assert.match(b.statuses.at(-1), /속지 쪽 그림 1개를 받지 못했어요/)

  // 서버 문서가 그대로여도 다음 맞추기에서 다시 받는다. 404 였던 쪽은 다시 받지 않는다
  failDownloads.delete(first)
  await b.sync.sync()
  assert.deepEqual(b.downloads, [second, first])
  assert.equal(b.statuses.at(-1), null)
  await b.sync.sync()
  assert.deepEqual(b.downloads, [second, first])
  assert.equal(remote.state.puts, 1)

  // 앱을 다시 켜도(새 동기화 · 같은 기기 기록) 남은 쪽을 이어서 받는다
  const c = device(remote, { storage: new Map(), failDownloads: new Map([[first, undefined]]) })
  await c.sync.start()
  const again = device(remote, { storage: c.storage, papers: c.local.papers })
  await again.sync.start()
  assert.deepEqual(again.downloads, [first])
  assert.equal(again.statuses.at(-1), null)
})

test('쪽 그림을 올리지 못한 속지와 연결 오류는 공방에 알리고, 다시 올라가면 알림을 지운다', async () => {
  const remote = server()
  const failUploads = new Set([L(2)])
  const a = device(remote, { papers: [planner('p1', [L(1)]), planner('p2', [L(2)], '모눈')], failUploads })
  await a.sync.start()
  assert.deepEqual(remote.state.papers.map(p => p.id), ['p1'])
  assert.match(a.statuses.at(-1), /속지 1개를 계정에 올리지 못했어요/)
  failUploads.clear()
  await a.sync.sync()
  assert.deepEqual(remote.state.papers.map(p => p.id), ['p1', 'p2'])
  assert.equal(a.statuses.at(-1), null)

  const offline = server()
  offline.api.get = async () => { throw Error('offline') }
  const b = device(offline, { papers: [planner('p1', [L(1)])] })
  await b.sync.start()
  assert.match(b.statuses.at(-1), /내 속지를 계정과 맞추지 못했어요/)
})
