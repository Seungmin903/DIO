import test from 'node:test'
import assert from 'node:assert/strict'
import { createCoverLibrarySync, mergeCovers } from '../src/diary/services/coverLibrarySync.js'
import { normalizeMyCovers } from '../src/diary/utils/myLibrary.js'

// 서버 한 대(계정 하나)와 기기 여러 대를 흉내 낸다. 서버는 CoverLibraryService 처럼 바깥 칸 순서를 고정하고 빈 칸을 null 로 돌려주며,
// 앱(StickerLibrarySyncHost 의 readCovers)처럼 바깥 null 을 뺀 뒤 넘긴다. 기기 목록은 useMyLibrary 처럼 normalizeMyCovers 를 거친다.
const asServer = covers => covers.map(c => ({ id: c.id, name: c.name, createdAt: c.createdAt ?? null, orientation: c.orientation, cover: JSON.parse(JSON.stringify(c.cover)) }))
const asApp = covers => covers.map(c => Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)))
function server() {
  const state = { version: 0, covers: [], puts: 0, uploads: new Map(), categories: [], conflictOnce: null }
  let serial = 0
  return {
    state,
    api: {
      get: async () => structuredClone({ version: state.version, covers: asApp(asServer(state.covers)) }),
      put: async (expected, covers) => {
        state.puts++
        if (state.conflictOnce) { state.version++; state.covers = [...state.covers, state.conflictOnce]; state.conflictOnce = null }
        if (expected !== state.version) throw Object.assign(Error('conflict'), { status: 409 })
        state.version++; state.covers = asApp(asServer(structuredClone(covers)))
        return structuredClone({ version: state.version, covers: state.covers })
      },
    },
    upload: async (localId, category) => { const id = `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`; state.uploads.set(id, localId); state.categories.push(category); return id },
  }
}
function device(remote, { account = '1', covers = [], storage = new Map(), failUploads = new Set(), onDownload = () => {}, failDownloads = new Map() } = {}) {
  const statuses = []
  const local = { covers: normalizeMyCovers(structuredClone(covers)) }, listeners = new Set(), downloads = [], errors = []
  const library = {
    ready: async () => {},
    snapshot: () => local.covers,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    replace: async (next, base) => { if (base !== local.covers) return false; local.covers = normalizeMyCovers(next); listeners.forEach(listener => listener()); return true },
  }
  const edit = next => { local.covers = normalizeMyCovers(next); listeners.forEach(listener => listener()) }
  const sync = createCoverLibrarySync({
    account, api: remote.api, library, key: 'cover-sync',
    storage: { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v) } },
    media: { upload: async (id, category) => { if (failUploads.has(id)) throw Error('too large'); return remote.upload(id, category) }, download: async id => { downloads.push(id); onDownload(id); if (failDownloads.has(id)) throw Object.assign(Error('download failed'), { status: failDownloads.get(id) }) } },
    setTimer: run => ({ run }), clearTimer: timer => { timer.cleared = true },
    onError: error => errors.push(error.message),
    onStatus: next => statuses.push(next.error),
  })
  return { sync, local, edit, downloads, errors, storage, statuses }
}
const L1 = '10000000-0000-4000-8000-000000000001', L2 = '10000000-0000-4000-8000-000000000002', L3 = '10000000-0000-4000-8000-000000000003'
// 공방에서 PDF 첫 쪽으로 만든 사진 표지 + 내 스티커 하나 · 기본 스티커 하나(addMyCover 와 같은 칸)
const photoCover = (id, photo, sticker, name = '여행 표지') => ({ id, name, createdAt: '2026-11-10T01:00:00.000Z', orientation: 'portrait', cover: {
  kind: 'photo', photo: { src: `media:${photo}`, mediaFileId: photo, aspect: 0.75 },
  stickers: [{ id: 's1', src: `media:${sticker}`, mediaFileId: sticker, name: '고양이', x: 40, y: 60, size: 14, rotation: 0 }, { id: 's2', builtin: 'heart', x: 50, y: 50, size: 14, rotation: 12.5 }],
} })
const plainCover = (id, name = '색 표지') => ({ id, name, createdAt: '2026-11-09T00:00:00.000Z', orientation: 'landscape', cover: { kind: 'plain', color: '#112233' } })

test('기기 A 공방에서 만든 표지가 서버에 올라가고, 새 기기 B · 재설치 기기에서 같은 표지 목록이 복원된다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c1', L1, L2), plainCover('c2')] })
  await a.sync.start()
  assert.equal(remote.state.version, 1)
  const sent = remote.state.covers[0].cover
  assert.equal(remote.state.uploads.get(sent.photo.mediaFileId), L1)
  assert.equal(sent.photo.src, `media:${sent.photo.mediaFileId}`)
  assert.equal(remote.state.uploads.get(sent.stickers[0].mediaFileId), L2)
  assert.deepEqual(remote.state.categories, ['PHOTO', 'STICKER'])
  assert.equal(sent.stickers[1].builtin, 'heart')
  assert.deepEqual(remote.state.covers.map(c => c.id), ['c1', 'c2'])

  const b = device(remote) // 같은 계정의 새 기기(재설치 기기도 기기 기록이 비어 같다)
  await b.sync.start()
  assert.deepEqual(b.local.covers.map(c => [c.id, c.name, c.orientation]), [['c1', '여행 표지', 'portrait'], ['c2', '색 표지', 'landscape']])
  assert.equal(b.local.covers[0].cover.kind, 'photo')
  assert.equal(b.local.covers[0].cover.photo.mediaFileId, sent.photo.mediaFileId)
  assert.equal(b.local.covers[0].cover.photo.src, `media:${sent.photo.mediaFileId}`)
  assert.deepEqual(b.downloads.sort(), [sent.photo.mediaFileId, sent.stickers[0].mediaFileId].sort())
  assert.equal(remote.state.puts, 1) // 받기만 했으니 다시 올리지 않는다

  // 다시 맞춰도(앱이 다시 앞으로 와도) 바뀐 것이 없으면 저장하지 않는다(칸 순서 · null · 정리 때문에 '바뀜'으로 보이지 않는다)
  await a.sync.sync(); await b.sync.sync()
  assert.equal(remote.state.puts, 1)
})

test('기기 A 는 자기가 올린 그림을 다시 받지 않고 기기 원본을 그대로 쓴다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c1', L1, L2)] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  b.edit([plainCover('c9', '새 표지'), ...b.local.covers])
  await b.sync.whenIdle()
  await a.sync.sync()
  assert.deepEqual(a.local.covers.map(c => c.id), ['c9', 'c1'])
  assert.equal(a.local.covers[1].cover.photo.mediaFileId, L1)
  assert.equal(a.local.covers[1].cover.stickers[0].src, `media:${L2}`)
  assert.deepEqual(a.downloads, [])
})

test('지우기 · 이름 바꾸기 · 표지 편집이 다른 기기에 반영된다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c1', L1, L2), plainCover('c2')] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  a.edit([{ ...a.local.covers[0], name: '바꾼 이름', cover: { ...a.local.covers[0].cover, color: '#445566' } }])
  await a.sync.whenIdle()
  await b.sync.sync()
  assert.deepEqual(b.local.covers.map(c => [c.id, c.name, c.cover.color]), [['c1', '바꾼 이름', '#445566']])
})

test('두 기기에서 따로 만든 표지는 합쳐 모두 남는다(409 포함)', async () => {
  const remote = server()
  const a = device(remote, { covers: [plainCover('a1', 'A')] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  // 서로 모르는 사이 양쪽에서 새 표지를 만든다
  b.edit([plainCover('b1', 'B'), ...b.local.covers])
  remote.state.conflictOnce = asServer([plainCover('x1', '다른 기기')])[0]
  await b.sync.whenIdle()
  assert.deepEqual(remote.state.covers.map(c => c.id), ['b1', 'a1', 'x1'])
  assert.deepEqual(b.local.covers.map(c => c.id), ['b1', 'a1', 'x1'])
  a.edit([plainCover('a2', 'A2'), ...a.local.covers])
  await a.sync.whenIdle()
  assert.deepEqual(remote.state.covers.map(c => c.id), ['a2', 'a1', 'b1', 'x1'])
  assert.deepEqual(a.local.covers.map(c => c.id), ['a2', 'a1', 'b1', 'x1'])
  assert.deepEqual(mergeCovers([{ id: 'a' }], [{ id: 'a', x: 1 }, { id: 'b' }]), [{ id: 'a' }, { id: 'b' }])
})

test('그림을 올리지 못한 표지는 기기에 남고, 다음 맞추기에서 다시 올린다', async () => {
  const remote = server()
  const failUploads = new Set([L3])
  const a = device(remote, { covers: [photoCover('c3', L3, L2, '큰 사진'), plainCover('c2')], failUploads })
  await a.sync.start()
  assert.deepEqual(remote.state.covers.map(c => c.id), ['c2'])
  assert.deepEqual(a.local.covers.map(c => c.id), ['c3', 'c2'])
  // 다른 기기에서 서버가 바뀌어 받아도 올리지 못한 표지는 지우지 않는다
  const b = device(remote)
  await b.sync.start()
  b.edit([plainCover('b1', 'B'), ...b.local.covers])
  await b.sync.whenIdle()
  await a.sync.sync()
  assert.deepEqual(a.local.covers.map(c => c.id).sort(), ['b1', 'c2', 'c3'])
  failUploads.clear()
  await a.sync.sync()
  assert.deepEqual(remote.state.covers.map(c => c.id).sort(), ['b1', 'c2', 'c3'])
})

test('다른 계정이 쓰던 기기에서는 그 표지를 올리지 않고 이 계정 목록을 받는다', async () => {
  const remote = server()
  const storage = new Map()
  const first = device(remote, { account: '1', covers: [plainCover('mine')], storage })
  await first.sync.start()
  first.sync.stop()
  const other = server()
  other.state.covers = asApp(asServer([plainCover('theirs')])); other.state.version = 4
  const second = device(other, { account: '2', covers: first.local.covers, storage })
  await second.sync.start()
  assert.deepEqual(second.local.covers.map(c => c.id), ['theirs'])
  assert.equal(other.state.puts, 0)
})

test('받는 사이 이 기기에서 고치면 덮어쓰지 않고 다시 맞춘다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c1', L1, L2)] })
  await a.sync.start()
  // 새 기기가 서버 표지 그림을 받는 동안 사용자가 표지를 하나 만든다
  let b
  b = device(remote, { onDownload: () => { if (!b.local.covers.length) b.edit([plainCover('b1', 'B')]) } })
  await b.sync.start()
  await b.sync.whenIdle()
  assert.deepEqual(b.local.covers.map(c => c.id), ['b1', 'c1'])
  assert.deepEqual(remote.state.covers.map(c => c.id), ['b1', 'c1'])
})

test('올리지 못한 표지가 남아도 새로 올라간 것이 없으면 저장을 반복하지 않고 표지 탭에 실패를 알린다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c3', L3, L2, '큰 사진'), plainCover('c2')], failUploads: new Set([L3]) })
  await a.sync.start()
  assert.equal(remote.state.puts, 1)
  assert.match(a.statuses.at(-1), /표지 1개를 계정에 올리지 못했어요/)
  await a.sync.sync(); await a.sync.sync()
  assert.equal(remote.state.puts, 1) // version 이 계속 올라 다른 기기가 매번 다시 받지 않게
  assert.match(a.statuses.at(-1), /표지 1개/)
})

test('받지 못한 표지 그림은 다음 맞추기에서 다시 받고, 서버에 없으면(404) 더 받지 않는다', async () => {
  const remote = server()
  const a = device(remote, { covers: [photoCover('c1', L1, L2)] })
  await a.sync.start()
  const [photo, sticker] = [remote.state.covers[0].cover.photo.mediaFileId, remote.state.covers[0].cover.stickers[0].mediaFileId]
  const failDownloads = new Map([[photo, 503], [sticker, 404]])
  const b = device(remote, { failDownloads })
  await b.sync.start()
  assert.deepEqual(b.local.covers.map(c => c.id), ['c1']) // 못 받은 그림이 있어도 표지는 들인다
  assert.match(b.statuses.at(-1), /표지 그림 1개를 받지 못했어요/) // 404 는 다시 받아도 소용없어 세지 않는다
  failDownloads.clear()
  b.downloads.length = 0
  await b.sync.sync()
  assert.deepEqual(b.downloads, [photo]) // 503 이던 그림만 다시 받는다
  assert.equal(b.statuses.at(-1), null)
})

test('연결 오류는 표지 탭에 알린다', async () => {
  const remote = server()
  const a = device(remote, { covers: [plainCover('c1')] })
  remote.api.get = async () => { throw Object.assign(Error('offline'), { status: 0 }) }
  await a.sync.start()
  assert.equal(a.statuses.at(-1), '내 표지를 계정과 맞추지 못했어요. 연결을 확인해 주세요.')
})
