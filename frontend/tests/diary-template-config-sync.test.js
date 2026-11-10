import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createMemberAppStore } from '../src/diary/services/memberAppStore.js'
import { memberKeys } from '../src/diary/services/memberStorage.js'
import { serverTemplateReference } from '../src/editor/templates/serverCatalog.js'

// 다이어리 단위 속지 구성(templateConfig)을 서버에 두어 다른 기기에서도 속지 요약·첫 속지 미리보기·기본 표지 날짜 표시가 같게 한다.
const id = '11111111-2222-3333-4444-555555555555'
const page = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const stamp = '2026-10-27T00:00:00.123456Z'
const config = { version: 2, dateMode: 'undated', orientation: 'portrait', paper: { sections: [{ kind: 'pages' }] } }
const wire = { diaryId: id, diaryTitle: 'member', coverColor: '#123456', coverStyle: 'PLAIN', visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, canEdit: true, version: '1', myRole: 'OWNER', myMembership: { isFavorite: false }, permissions: { canEditMetadata: true, canEditCanvas: true, canTrash: true, canRestore: false, canPermanentlyDelete: false } }
const input = { title: 'member', color: '#123456', initialPages: [{ templateId: '2026-cover-landscape',
  ...serverTemplateReference('2026-cover-landscape', '1.0.0', 'landscape'), templateConfig: { width: 1024, height: 768 } }] }
const flush = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)) }

test('생성 요청에 표시된 속지 구성만 싣고 응답의 속지 구성을 돌려준다', async () => {
  const calls = []
  const api = createMemberDiaryApi(async call => { calls.push(call); return { diary: { ...wire, templateConfig: call.body?.templateConfig ?? config }, firstPageId: page, pageIds: [page] } })
  const created = await api.create({ ...input, templateConfig: config, diaryTemplateConfig: config }, { requestId: 'member-template-key' })
  assert.deepEqual(calls[0].body.templateConfig, config)
  assert.deepEqual(created.templateConfig, config)
  // 예전 앱이 남긴 미확인 생성 요청: 기기 목록용 templateConfig 는 있어도 본문은 바꾸지 않는다.
  await api.create({ ...input, templateConfig: config }, { requestId: 'legacy-template-key' })
  assert.equal(Object.hasOwn(calls[1].body, 'templateConfig'), false)
})

test('수정은 속지 구성을 보내고 서버가 저장하지 않으면 실패로 알린다', async () => {
  const calls = []
  const api = createMemberDiaryApi(async call => { calls.push(call); return { diary: { ...wire, version: '2', ...(call.body.diaryTitle ? {} : { templateConfig: call.body.templateConfig }) } } })
  const result = await api.update(id, { expectedVersion: '1', templateConfig: config })
  assert.deepEqual(calls[0].body, { expectedVersion: '1', templateConfig: config })
  assert.deepEqual(result.templateConfig, config)
  const dropped = createMemberDiaryApi(async () => ({ diary: { ...wire, version: '2' } }))
  await assert.rejects(dropped.update(id, { expectedVersion: '1', templateConfig: config }), { code: 'TEMPLATE_CONFIG_NOT_SAVED' })
  await assert.rejects(createMemberDiaryApi(async () => ({ diary: { ...wire, templateConfig: [1] } })).get(id), { code: 'INVALID_RESPONSE' })
})

function setup({ role = 'OWNER', server = {}, local = { templateConfig: config } } = {}) {
  const row = { id, title: '속지', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: role === 'OWNER', visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1', myRole: role, permissions: { canTrash: role === 'OWNER' }, ...server }
  const values = new Map([[memberKeys('101').index, JSON.stringify([{ ...row, ...local, source: 'member-api', memberAccountId: '101' }])]])
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  const updates = []
  let current = row
  const api = {
    async list() { return { items: [{ ...current, pageCount: 1, isShared: false }], hasNext: false, nextCursor: null } },
    async get() { return { ...current } },
    async update(target, body) {
      updates.push({ target, body })
      if (body.expectedVersion !== current.version) throw Object.assign(new Error('conflict'), { status: 409 })
      current = { ...current, templateConfig: body.templateConfig, version: String(Number(current.version) + 1) }
      return { ...current }
    },
  }
  const store = createMemberAppStore({ accountId: '101', api, storage, serverLibrary: true, makeRequestId: () => 'k-123456789' })
  return { store, updates }
}

test('주인이 열면 이 기기에만 있는 속지 구성을 서버로 옮긴다', async () => {
  const { store, updates } = setup()
  await store.load()
  const diary = await store.refresh(id)
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0].body, { templateConfig: config, expectedVersion: '1' })
  assert.deepEqual(diary.templateConfig, config)
})

test('목록을 받을 때도 이 기기에만 있는 내 다이어리의 속지 구성을 뒤에서 올린다', async () => {
  const { store, updates } = setup()
  await store.load()
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true })
  await flush()
  assert.equal(updates.length, 1)
  assert.deepEqual(updates[0].body.templateConfig, config)
})

test('서버에 이미 있거나 주인이 아니면 옮기지 않고 서버 값을 쓴다', async () => {
  const other = { ...config, dateMode: 'dated' }
  const owned = setup({ server: { templateConfig: other } })
  await owned.store.load()
  const diary = await owned.store.refresh(id)
  assert.equal(owned.updates.length, 0)
  assert.deepEqual(diary.templateConfig, other)
  const editor = setup({ role: 'EDITOR' })
  await editor.store.load()
  await editor.store.refresh(id)
  assert.equal(editor.updates.length, 0)
})

test('다른 기기(기기 목록 없음)는 서버 목록의 속지 구성으로 채운다', async () => {
  const { store } = setup({ server: { templateConfig: config }, local: {} })
  await store.load()
  await store.queryLibrary(store.getSnapshot().library.criteria, { force: true })
  assert.deepEqual(store.getSnapshot().diaries.find(row => row.id === id).templateConfig, config)
})
