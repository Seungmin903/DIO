import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
// 목 API 는 타이머 없이 바로 끝나므로 이벤트 루프를 몇 바퀴 돌리면 뒤에서 올리는 표지 동기화까지 끝난다
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)) }

test('590: 처음 불러오는 동안은 빈 화면 자리 가운데 스피너만(목록 위 글자 줄 없음)', () => {
  const empty = read('../src/diary/components/EmptyState.js')
  assert.match(empty, /export function LoadingSpot\(/)
  assert.match(empty, /accessibilityRole="progressbar" accessibilityLabel=\{label\} accessibilityState=\{\{ busy: true \}\} accessibilityLiveRegion="polite"/)
  assert.match(read('../src/diary/screens/LibraryScreen.js'), /suppressEmpty \? \(loading \? <LoadingSpot compact=\{compact\} label="다이어리를 불러오고 있어요\." \/> : null\)/)
  assert.match(read('../src/diary/screens/TrashScreen.js'), /suppressEmpty \? \(loading \? <LoadingSpot compact=\{compact\} art="dio" label="휴지통을 불러오고 있어요\." \/> : null\)/)
  assert.doesNotMatch(read('../src/diary/components/MemberLibraryNotice.js'), /다이어리를 불러오고 있어요|ActivityIndicator/)
  assert.doesNotMatch(read('../src/diary/components/MemberTrashNotice.js'), /불러오고 있어요/)
  const app = read('../App.js')
  assert.match(app, /loading=\{libraryLoading\}/)
  assert.match(app, /loading=\{member && Boolean\(diaryState\.trashLoading && !diaryState\.trashLoaded && !diaryState\.trash\?\.length\)\}/)
})

test('617: 참여자 동그라미는 반지름이 폭의 절반(둥근 네모가 아니다)', () => {
  assert.match(read('../src/sharing/styles.js'), /memberCircle: \{\n    width: 30,\n    height: 30,\n    borderRadius: 15,/)
})

test('620: 즐겨찾기 별은 폰 · 태블릿 모두 표지 오른쪽 위', () => {
  const styles = read('../src/diary/styles.js')
  assert.match(styles, /cardFavorite: \{ position: 'absolute', top: 12, right: 12,/)
  assert.match(styles, /cardFavoriteCompact: \{ top: 6, right: 6 \}/)
  assert.doesNotMatch(styles, /cardFavorite: \{[^}]*left: 12/)
})

test('623: 목록을 받을 때 서버에 표지가 없고 이 기기에만 있는 내 다이어리는 뒤에서 올린다', async () => {
  const { createMemberAppStore } = await import('../src/diary/services/memberAppStore.js')
  const { memberKeys } = await import('../src/diary/services/memberStorage.js')
  const id = '11111111-2222-3333-4444-555555555555', stamp = '2026-10-27T00:00:00.123456Z'
  const row = { id, title: '표지', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1', myRole: 'OWNER', permissions: { canTrash: true } }
  const cover = { kind: 'photo', photo: { src: 'media://abc', mediaFileId: 'abc' } }
  const values = new Map([[memberKeys('101').index, JSON.stringify([{ ...row, cover, source: 'member-api', memberAccountId: '101' }])]])
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  const updates = []
  const api = {
    async list() { return { items: [{ ...row, pageCount: 1, isShared: false }], hasNext: false, nextCursor: null } },
    async get() { return { ...row } },
    async update(target, input) { updates.push({ target, input }); return { ...row, cover: input.cover, version: '2' } },
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true, makeRequestId: () => 'k-123456789' })
  await store.load()
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true })
  await flush()
  assert.equal(updates.length, 1)
  assert.equal(updates[0].target, id)
  assert.deepEqual(updates[0].input.cover, cover)
  // 같은 세션에서 다시 받아도 또 올리지 않는다
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true })
  await flush()
  assert.equal(updates.length, 1)
})

test('623: 표지를 올리지 못하면 다음 목록 갱신 때 다시 올린다', async () => {
  const { createMemberAppStore } = await import('../src/diary/services/memberAppStore.js')
  const { memberKeys } = await import('../src/diary/services/memberStorage.js')
  const id = '11111111-2222-3333-4444-666666666666', stamp = '2026-10-27T00:00:00.123456Z'
  const row = { id, title: '표지', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1', myRole: 'OWNER', permissions: { canTrash: true } }
  const cover = { kind: 'photo', photo: { src: 'media://abc', mediaFileId: 'abc' } }
  const values = new Map([[memberKeys('101').index, JSON.stringify([{ ...row, cover, source: 'member-api', memberAccountId: '101' }])]])
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  let gets = 0, updates = 0
  const api = {
    async list() { return { items: [{ ...row, pageCount: 1, isShared: false }], hasNext: false, nextCursor: null } },
    async get() { gets++; if (gets === 1) throw Object.assign(new Error('network'), { status: 0 }); return { ...row } },
    async update(target, input) {
      updates++
      if (updates === 1) throw Object.assign(new Error('server'), { status: 500 })
      return { ...row, cover: input.cover, version: '2' }
    },
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true, makeRequestId: () => 'k-123456789' })
  const settle = flush
  await store.load(); await settle() // 서버 목록 모드의 load 는 목록도 받는다: 첫 get 이 실패한다
  assert.equal(gets, 1); assert.equal(updates, 0)
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true }); await settle()
  assert.equal(updates, 1)
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true }); await settle()
  assert.equal(updates, 2)
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true }); await settle()
  assert.equal(updates, 2)
  assert.equal(store.getSnapshot().metadataError ?? null, null) // 뒤에서 올리다 실패해도 안내를 띄우지 않는다
})

test('623: 계속 실패하면 세션에서 다이어리당 3번까지만 다시 해 본다', async () => {
  const { createMemberAppStore } = await import('../src/diary/services/memberAppStore.js')
  const { memberKeys } = await import('../src/diary/services/memberStorage.js')
  const id = '11111111-2222-3333-4444-777777777777', stamp = '2026-10-27T00:00:00.123456Z'
  const row = { id, title: '표지', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1', myRole: 'OWNER', permissions: { canTrash: true } }
  const cover = { kind: 'photo', photo: { src: 'media://abc', mediaFileId: 'abc' } }
  const values = new Map([[memberKeys('101').index, JSON.stringify([{ ...row, cover, source: 'member-api', memberAccountId: '101' }])]])
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  let updates = 0
  const api = {
    async list() { return { items: [{ ...row, pageCount: 1, isShared: false }], hasNext: false, nextCursor: null } },
    async get() { return { ...row } },
    async update() { updates++; throw Object.assign(new Error('server'), { status: 500 }) },
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true, makeRequestId: () => 'k-123456789' })
  const settle = flush
  await store.load(); await settle()
  for (let i = 0; i < 5; i++) { await store.queryLibrary(store.getSnapshot().library.criteria, { force: true }); await settle() }
  assert.equal(updates, 3)
  assert.equal(store.getSnapshot().metadataError ?? null, null)
})

test('623: 서버 목록에 이미 표지가 있으면 올리지 않는다', async () => {
  const { createMemberAppStore } = await import('../src/diary/services/memberAppStore.js')
  const { memberKeys } = await import('../src/diary/services/memberStorage.js')
  const id = '11111111-2222-3333-4444-888888888888', stamp = '2026-10-27T00:00:00.123456Z'
  const row = { id, title: '표지', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1', myRole: 'OWNER', permissions: { canTrash: true } }
  const cover = { kind: 'photo', photo: { src: 'media://abc', mediaFileId: 'abc' } }
  const values = new Map([[memberKeys('101').index, JSON.stringify([{ ...row, cover, source: 'member-api', memberAccountId: '101' }])]])
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  let gets = 0, updates = 0
  const api = {
    async list() { return { items: [{ ...row, cover, pageCount: 1, isShared: false }], hasNext: false, nextCursor: null } },
    async get() { gets++; return { ...row, cover } },
    async update() { updates++; return { ...row, cover, version: '2' } },
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true, makeRequestId: () => 'k-123456789' })
  await store.load(); await flush()
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true }); await flush()
  assert.equal(gets, 0)
  assert.equal(updates, 0)
})
