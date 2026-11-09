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

test('기기만 바뀐 저장이 409 로 다른 기기 변경과 합쳐지면 그 결과를 기기에도 들여, 다음 맞추기에서 다른 기기 폴더를 지우지 않는다', async () => {
  const remote = server()
  const a = device(remote, { folders: [folder('f1', '여행', [sticker(L1)])] })
  await a.sync.start()
  remote.state.conflictOnce = true // 저장 직전에 다른 기기가 'other' 폴더를 만든다
  a.edit([folder('f1', '여행 2', [sticker(L1)])])
  await a.sync.whenIdle()
  assert.deepEqual(remote.state.folders.map(f => f.id), ['f1', 'other'])
  assert.deepEqual(a.local.folders.map(f => f.id), ['f1', 'other'])
  // 다음 맞추기에서 서버를 기기 목록으로 덮어쓰지 않는다
  await a.sync.sync()
  assert.deepEqual(remote.state.folders.map(f => f.id), ['f1', 'other'])
})

test('서버 것을 들일 때도 아직 올리지 못한 스티커 · 보낼 수 없는 칸 · 맞춘 적 없는 폴더는 기기에서 지우지 않는다', async () => {
  const remote = server(), failUploads = new Set([L2])
  const a = device(remote, { failUploads, folders: [folder('f1', '여행', [sticker(L1)])] })
  await a.sync.start()
  // 서버가 다른 기기에서 바뀌었고, 그사이 이 기기에서는 올리지 못할 스티커와 스타일만 있는 칸, 보낼 수 없는 id 의 폴더를 더했다
  remote.state.version++; remote.state.folders = [folder('f1', '여행', [...remote.state.folders[0].items, { emoji: '⭐' }])]
  a.edit([folder('f1', '여행', [sticker(L1), sticker(L2), { style: 'only' }]), folder('로컬 폴더', '로컬', [])])
  await a.sync.whenIdle()
  const items = a.local.folders.find(f => f.id === 'f1').items
  assert.ok(items.some(item => item.mediaFileId === L2))
  assert.ok(items.some(item => item.style === 'only'))
  assert.ok(items.some(item => item.emoji === '⭐'))
  assert.ok(a.local.folders.some(f => f.id === '로컬 폴더'))
  assert.equal(remote.state.folders[0].items.some(item => item.emoji === '⭐'), true)
})

test('다른 기기에서 지운 폴더는 지우되, 그 폴더의 올리지 못한 스티커는 남긴다', async () => {
  const remote = server(), failUploads = new Set()
  const a = device(remote, { failUploads, folders: [folder('f1', '여행', [sticker(L1)]), folder('f2', '지울 폴더', [])] })
  await a.sync.start()
  remote.state.version++; remote.state.folders = [remote.state.folders[0]] // 다른 기기에서 f2 를 지웠다
  await a.sync.sync()
  assert.deepEqual(a.local.folders.map(f => f.id), ['f1'])
})

test('서버 한도에 맞춰 보낸다: 이름의 제어 문자 · 길이를 정리하고, 개수 한도를 넘는 것은 보내지 않고 기기에 남긴다', async () => {
  const remote = server()
  const many = Array.from({ length: 205 }, (_, i) => folder(`f${i}`, `폴더${i}`, []))
  many[0] = folder('f0', `이름\u0000${'가'.repeat(60)}`, [{ builtin: 'heart', name: `스티커\n${'나'.repeat(300)}` }, { builtin: 'x'.repeat(201) }])
  const a = device(remote, { folders: many })
  await a.sync.start()
  assert.equal(remote.state.folders.length, 200)
  assert.equal(remote.state.folders[0].name, `이름${'가'.repeat(38)}`)
  assert.deepEqual(remote.state.folders[0].items, [{ builtin: 'heart', name: `스티커${'나'.repeat(197)}` }])
  assert.equal(a.local.folders.length, 205) // 기기에는 모두 남는다
})
