import test from 'node:test'
import assert from 'node:assert/strict'
import { createStickerLibrarySync, mergeFolders } from '../src/editor/services/stickerLibrarySync.js'

// 서버 한 대(계정 하나)와 기기 여러 대를 흉내 낸다
function server() {
  const state = { version: 0, folders: [], puts: 0, uploads: new Map(), conflictOnce: false }
  let serial = 0
  return {
    state,
    api: {
      get: async () => structuredClone({ version: state.version, folders: state.folders }),
      put: async (expected, folders) => {
        state.puts++
        if (state.conflictOnce) { state.conflictOnce = false; state.version++; state.folders = [...state.folders, { id: 'other', name: '다른 기기', items: [] }] }
        if (expected !== state.version) throw Object.assign(Error('conflict'), { status: 409 })
        state.version++; state.folders = structuredClone(folders)
        return structuredClone({ version: state.version, folders: state.folders })
      },
    },
    // 서버에 올린 이미지: 기기 id → 서버 id
    upload: async localId => { const id = `90000000-0000-4000-8000-${String(++serial).padStart(12, '0')}`; state.uploads.set(id, localId); return id },
  }
}
function device(remote, { account = '1', folders = [], storage = new Map(), failUploads = new Set() } = {}) {
  const local = { folders: structuredClone(folders) }, listeners = new Set(), downloads = [], errors = [], timers = []
  const decor = {
    snapshot: () => local.folders,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    replace: next => { local.folders = next; listeners.forEach(listener => listener()) },
  }
  const edit = next => { local.folders = next; listeners.forEach(listener => listener()) }
  const sync = createStickerLibrarySync({
    account, api: remote.api, decor, key: 'sync',
    storage: { getItem: async k => storage.get(k) ?? null, setItem: async (k, v) => { storage.set(k, v) } },
    media: { upload: async id => { if (failUploads.has(id)) throw Error('too large'); return remote.upload(id) }, download: async id => { downloads.push(id) } },
    setTimer: (run, ms) => { const timer = { run, ms }; timers.push(timer); return timer }, clearTimer: timer => { timer.cleared = true },
    onError: error => errors.push(error.message),
  })
  return { sync, local, edit, downloads, errors, storage, timers }
}
const L1 = '10000000-0000-4000-8000-000000000001', L2 = '10000000-0000-4000-8000-000000000002', L3 = '10000000-0000-4000-8000-000000000003'
const sticker = (id, name = '스티커') => ({ mediaFileId: id, src: `media:${id}`, name, aspect: 1 })
const folder = (id, name, items) => ({ id, name, items })

test('기기 A에서 만든 폴더 · 스티커가 서버에 올라가고, 새 기기 B(재설치)에서 같은 구성으로 복원된다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [sticker(L1, '고양이'), { builtin: 'heart' }]), folder('f2', '빈 폴더', [])] })
  await a.sync.start()
  assert.equal(remote.state.version, 1)
  assert.equal(remote.state.folders.length, 2)
  const uploaded = remote.state.folders[0].items[0].mediaFileId
  assert.equal(remote.state.uploads.get(uploaded), L1)
  assert.deepEqual(remote.state.folders[0].items[1], { builtin: 'heart' })

  const b = device(remote)
  await b.sync.start()
  assert.deepEqual(b.downloads, [uploaded])
  assert.deepEqual(b.local.folders.map(f => [f.id, f.name, f.items.length]), [['f1', '여행', 2], ['f2', '빈 폴더', 0]])
  assert.deepEqual(b.local.folders[0].items[0], { mediaFileId: uploaded, src: `media:${uploaded}`, name: '고양이', aspect: 1 })
  assert.equal(remote.state.puts, 1) // B 는 받기만 했다
})

test('같은 계정에서 기기만 바뀌면 올리고, 서버만 바뀌면 받으며, 올린 스티커는 기기 원본을 그대로 쓴다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [sticker(L1)])] })
  await a.sync.start()
  const b = device(remote)
  await b.sync.start()
  // B 에서 폴더 이름을 바꾸고 스티커를 더한다(받은 스티커는 서버 id)
  b.edit([{ ...b.local.folders[0], name: '바다', items: [...b.local.folders[0].items, sticker(L2)] }])
  await b.sync.whenIdle()
  assert.equal(remote.state.version, 2)
  assert.equal(remote.state.folders[0].name, '바다')
  // A 를 다시 맞추면 서버 것을 받는다. A 가 올린 L1 은 내려받지 않고 기기 원본 id 를 쓴다
  await a.sync.sync()
  assert.equal(a.local.folders[0].name, '바다')
  assert.equal(a.local.folders[0].items[0].mediaFileId, L1)
  assert.equal(a.downloads.length, 1) // B 가 올린 L2 만 받는다
  assert.equal(remote.state.puts, 2)
})

test('두 기기에서 동시에 바꾸면(409) 서버 것을 받아 합쳐 다시 저장한다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [sticker(L1)])] })
  await a.sync.start()
  remote.state.conflictOnce = true
  a.edit([folder('f1', '여행', [sticker(L1), sticker(L3)])])
  await a.sync.whenIdle()
  assert.deepEqual(remote.state.folders.map(f => f.id), ['f1', 'other'])
  assert.equal(remote.state.folders[0].items.length, 2)
})

test('양쪽이 모두 바뀌었으면 합쳐서 올리고 서버에서 온 스티커도 기기에 들인다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [sticker(L1)])] })
  await a.sync.start()
  remote.state.version++; remote.state.folders = [...remote.state.folders, folder('f9', '다른 기기 폴더', [{ emoji: '⭐' }])]
  a.edit([folder('f1', '여행', [sticker(L1), sticker(L2)])])
  await a.sync.whenIdle()
  assert.deepEqual(remote.state.folders.map(f => [f.id, f.items.length]), [['f1', 2], ['f9', 1]])
  assert.deepEqual(a.local.folders.map(f => f.id), ['f1', 'f9'])
})

test('다른 계정이 쓰던 기기에서는 그 스티커를 올리지 않고 이 계정의 서버 보관함을 받는다', async () => {
  const remote1 = server(), storage = new Map()
  const a = device(remote1, { account: '1', storage, folders: [folder('f1', '1번 계정', [sticker(L1)])] })
  await a.sync.start()
  const remote2 = server()
  remote2.state.version = 3; remote2.state.folders = [folder('g', '2번 계정', [])]
  const b = device(remote2, { account: '2', storage, folders: a.local.folders })
  await b.sync.start()
  assert.equal(remote2.state.puts, 0)
  assert.equal(remote2.state.uploads.size, 0)
  assert.deepEqual(b.local.folders.map(f => f.name), ['2번 계정'])
})

test('올리지 못한 스티커는 이번에는 빼고 나머지는 저장하며, 다음 저장에서 다시 올린다', async () => {
  const remote = server(), failUploads = new Set([L2])
  const a = device(remote, { failUploads, folders: [folder('f1', '여행', [sticker(L1), sticker(L2)])] })
  await a.sync.start()
  assert.equal(remote.state.folders[0].items.length, 1)
  assert.deepEqual(a.errors, ['too large'])
  assert.equal(a.local.folders[0].items.length, 2) // 기기에는 남는다
  failUploads.clear()
  await a.sync.sync()
  assert.equal(remote.state.folders[0].items.length, 2)
})

test('받아서 바꾼 것은 다시 올리지 않고, 기기에서 바꾼 것만 잠시 모아 올린다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [])] })
  await a.sync.start()
  remote.state.version++; remote.state.folders = [folder('f1', '서버에서 바꿈', [])]
  await a.sync.sync()
  assert.equal(a.timers.length, 0)
  a.edit([folder('f1', '하나', [])]); a.edit([folder('f1', '둘', [])])
  assert.equal(a.timers.filter(timer => !timer.cleared).length, 1)
  assert.equal(a.timers.at(-1).ms, 1500)
  await a.sync.whenIdle()
  assert.equal(remote.state.folders[0].name, '둘')
  a.sync.stop()
  a.edit([folder('f1', '셋', [])])
  assert.equal(a.timers.filter(timer => !timer.cleared).length, 0)
})

test('합치기는 앞쪽 순서를 지키고 뒤쪽에만 있는 폴더 · 스티커를 덧붙인다', () => {
  const merged = mergeFolders([folder('a', 'A', [{ mediaFileId: L1 }])], [folder('b', 'B', []), folder('a', 'A2', [{ mediaFileId: L1 }, { builtin: 'x' }])])
  assert.deepEqual(merged, [folder('a', 'A', [{ mediaFileId: L1 }, { builtin: 'x' }]), folder('b', 'B', [])])
})
