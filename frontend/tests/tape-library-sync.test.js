import test from 'node:test'
import assert from 'node:assert/strict'
import { createTapeLibrarySync, localItem, mergeTapeFolders } from '../src/editor/services/tapeLibrarySync.js'

// 서버 한 대(계정 하나)와 기기 여러 대를 흉내 낸다. 서버는 TapeLibraryService 처럼 칸 순서를 고정하고 빈 칸을 null 로 돌려주며,
// 앱(StickerLibrarySyncHost 의 readLibrary)처럼 null 을 뺀 뒤 넘긴다(칸 순서 · null 때문에 매번 '바뀜'으로 보이지 않는지 본다)
const FIELDS = ['id', 'mediaFileId', 'pattern', 'palette', 'name', 'imageWidth', 'imageHeight', 'crop', 'size', 'pieceRatio']
const asServer = folders => folders.map(f => ({ id: f.id, name: f.name, items: f.items.map(item => Object.fromEntries(FIELDS.map(k => [k, k === 'crop' && item.crop ? { fx: item.crop.fx, fy: item.crop.fy, zoom: item.crop.zoom } : item[k] ?? null]))) }))
const asApp = folders => folders.map(f => ({ ...f, items: f.items.map(item => Object.fromEntries(Object.entries(item).filter(([, v]) => v != null))) }))
function server() {
  const state = { version: 0, folders: [], puts: 0, uploads: new Map(), conflictOnce: false }
  let serial = 0
  return {
    state,
    api: {
      get: async () => structuredClone({ version: state.version, folders: asApp(asServer(state.folders)) }),
      put: async (expected, folders) => {
        state.puts++
        if (state.conflictOnce) { state.conflictOnce = false; state.version++; state.folders = [...state.folders, { id: 'other', name: '다른 기기', items: [] }] }
        if (expected !== state.version) throw Object.assign(Error('conflict'), { status: 409 })
        state.version++; state.folders = asApp(asServer(structuredClone(folders)))
        return structuredClone({ version: state.version, folders: state.folders })
      },
    },
    upload: async localId => { const id = `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`; state.uploads.set(id, localId); return id },
  }
}
function device(remote, { account = '1', folders = [], storage = new Map(), failUploads = new Set() } = {}) {
  const local = { folders: structuredClone(folders) }, listeners = new Set(), downloads = [], errors = []
  const decor = {
    snapshot: () => local.folders,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    replace: next => { local.folders = next; listeners.forEach(listener => listener()) },
  }
  const edit = next => { local.folders = next; listeners.forEach(listener => listener()) }
  const sync = createTapeLibrarySync({
    account, api: remote.api, decor, key: 'tape-sync',
    storage: { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v) } },
    media: { upload: async id => { if (failUploads.has(id)) throw Error('too large'); return remote.upload(id) }, download: async id => { downloads.push(id) } },
    setTimer: run => ({ run }), clearTimer: timer => { timer.cleared = true },
    onError: error => errors.push(error.message),
  })
  return { sync, local, edit, downloads, errors, storage }
}
const L1 = '10000000-0000-4000-8000-000000000001', L2 = '10000000-0000-4000-8000-000000000002'
// 공방에서 사진으로 만든 테이프(DecorationStudioScreen 의 addTape 와 같은 칸)
const photoTape = (id, media, name = '테이프 1') => ({ id, src: `media:${media}`, mediaFileId: media, poster: undefined, name, imageWidth: 1200, imageHeight: 800, crop: { fx: 0.25, fy: 0.5, zoom: 2 }, size: 'standard', pieceRatio: 5.29 })
const folder = (id, name, items) => ({ id, name, items })

test('기기 A 공방에서 추가한 테이프가 서버(TAPE)에 올라가고, 새 기기 B · 재설치 기기에서 같은 테이프 탭이 복원된다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '내 테이프', [photoTape('t1', L1), { id: 't2', pattern: 'dots', palette: 'mint', name: '테이프 2' }])] })
  await a.sync.start()
  assert.equal(remote.state.version, 1)
  const uploaded = remote.state.folders[0].items[0].mediaFileId
  assert.equal(remote.state.uploads.get(uploaded), L1)
  assert.deepEqual(remote.state.folders[0].items[0], { id: 't1', mediaFileId: uploaded, name: '테이프 1', imageWidth: 1200, imageHeight: 800, crop: { fx: 0.25, fy: 0.5, zoom: 2 }, size: 'standard', pieceRatio: 5.29 })
  assert.deepEqual(remote.state.folders[0].items[1], { id: 't2', pattern: 'dots', palette: 'mint', name: '테이프 2' })

  const b = device(remote) // 같은 계정의 새 기기(재설치 기기도 기기 기록이 비어 같다)
  await b.sync.start()
  assert.deepEqual(b.downloads, [uploaded])
  assert.deepEqual(b.local.folders[0].items[0], { id: 't1', mediaFileId: uploaded, src: `media:${uploaded}`, name: '테이프 1', imageWidth: 1200, imageHeight: 800, size: 'standard', pieceRatio: 5.29, crop: { fx: 0.25, fy: 0.5, zoom: 2 } })
  assert.equal(b.local.folders[0].items[1].pattern, 'dots')
  assert.equal(remote.state.puts, 1) // B 는 받기만 했다
  // 받은 뒤 다시 맞춰도 바뀐 것이 없으면 올리지 않는다(칸 순서 · null 때문에 매번 올리지 않는다)
  await b.sync.sync(); await a.sync.sync()
  assert.equal(remote.state.puts, 1)
})

test('B 에서 테이프를 더하고 이름을 바꾸면 A 가 받고, A 가 올린 사진 테이프는 기기 원본을 그대로 쓴다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '내 테이프', [photoTape('t1', L1)])] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  b.edit([{ ...b.local.folders[0], items: [photoTape('t3', L2, '테이프 2'), { ...b.local.folders[0].items[0], name: '하늘' }] }])
  await b.sync.whenIdle()
  await a.sync.sync()
  assert.deepEqual(a.local.folders[0].items.map(t => [t.id, t.name]), [['t3', '테이프 2'], ['t1', '하늘']])
  assert.equal(a.local.folders[0].items[1].mediaFileId, L1)
  assert.equal(a.downloads.length, 1) // B 가 올린 L2 만 받는다
})

test('두 기기에서 동시에 바꾸면(409) 합쳐 저장하고, 같은 사진 · 무늬라도 id 가 다른 테이프는 둘 다 남긴다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '내 테이프', [{ id: 'p1', pattern: 'dots', palette: 'mint' }])] })
  await a.sync.start()
  remote.state.conflictOnce = true
  a.edit([folder('f1', '내 테이프', [{ id: 'p2', pattern: 'dots', palette: 'mint' }, { id: 'p1', pattern: 'dots', palette: 'mint' }])])
  await a.sync.whenIdle()
  assert.deepEqual(remote.state.folders.map(f => f.id), ['f1', 'other'])
  assert.deepEqual(remote.state.folders[0].items.map(t => t.id), ['p2', 'p1'])
  assert.deepEqual(a.local.folders.map(f => f.id), ['f1', 'other'])
  const merged = mergeTapeFolders([folder('f', 'F', [{ id: 'a', pattern: 'x' }])], [folder('f', 'F', [{ id: 'a', pattern: 'x' }, { id: 'b', pattern: 'x' }])])
  assert.deepEqual(merged[0].items.map(t => t.id), ['a', 'b'])
})

test('올리지 못한 사진 테이프 · 잘못된 자른 자리는 기기에 남기고 다음에 다시 올린다', async () => {
  const remote = server(), failUploads = new Set([L2])
  const a = device(remote, { failUploads, folders: [folder('f1', '내 테이프', [photoTape('t1', L1), photoTape('t2', L2), { id: 't3', pattern: 'dots', crop: { fx: 3, fy: 0, zoom: 0 } }])] })
  await a.sync.start()
  assert.deepEqual(remote.state.folders[0].items.map(t => t.id), ['t1', 't3'])
  assert.equal(remote.state.folders[0].items[1].crop, undefined) // 서버가 거절할 자른 자리는 보내지 않는다
  assert.equal(a.local.folders[0].items.length, 3)
  failUploads.clear()
  await a.sync.sync()
  assert.deepEqual(remote.state.folders[0].items.map(t => t.id), ['t1', 't2', 't3'])
})

test('다른 계정이 쓰던 기기에서는 그 테이프를 올리지 않고 이 계정의 서버 보관함을 받는다', async () => {
  const remote1 = server(), storage = new Map()
  const a = device(remote1, { account: '1', storage, folders: [folder('f1', '1번 계정', [photoTape('t1', L1)])] })
  await a.sync.start()
  const remote2 = server()
  remote2.state.version = 3; remote2.state.folders = [folder('g', '2번 계정', [])]
  const b = device(remote2, { account: '2', storage, folders: a.local.folders })
  await b.sync.start()
  assert.equal(remote2.state.puts, 0)
  assert.deepEqual(b.local.folders.map(f => f.name), ['2번 계정'])
})

test('id 없이 저장된 테이프도 기기에서 지우고 이름을 바꿀 수 있게 id 를 붙인다', () => {
  assert.equal(localItem({ mediaFileId: L1 }).id, `m-${L1}`)
  assert.match(localItem({ pattern: 'dots', palette: '#fff' }).id, /^[A-Za-z0-9_-]{1,64}$/)
})
