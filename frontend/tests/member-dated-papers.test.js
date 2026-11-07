import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { datedMonthId, datedBaseId } from '../src/editor/templates/dated.js'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { getTemplate } from '../src/editor/templates/catalog.js'
import { serverTemplateReference, serverTemplateConfigFor, localTemplateReference, toServerInitialPageSelections, DATED_CONFIG_KEY } from '../src/editor/templates/serverCatalog.js'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')
const id = datedMonthId('monthly', 2027, 3, 'portrait')
const base = datedBaseId(id)

test('날짜 속지는 같은 양식의 만년형 서버 행으로 만들고, 날짜 ID 는 설정의 datedTemplate 에 둔다(게스트와 같은 ID)', () => {
  const template = getTemplate(id)
  assert.deepEqual(serverTemplateReference(id, template.templateVersion, 'portrait'), serverTemplateReference(base, template.templateVersion, 'portrait'))
  assert.deepEqual(serverTemplateConfigFor(id), { [DATED_CONFIG_KEY]: id })
  assert.deepEqual(serverTemplateConfigFor(base), {})
})

test('읽을 때: 설정의 datedTemplate 이 그 만년형 속지의 날짜판이면 날짜 ID 로 그린다(아니면 만년형 그대로)', () => {
  const { templateCode, templateVersion } = serverTemplateReference(id, '1.0.0', 'portrait')
  assert.equal(localTemplateReference(templateCode, templateVersion, { datedTemplate: id }).backgroundAssetId, id)
  assert.equal(localTemplateReference(templateCode, templateVersion, {}).backgroundAssetId, base)
  // 다른 양식의 날짜 ID 는 받지 않는다
  const weekly = 'dated-weekly-blocks-2027-03-01-portrait'
  assert.equal(localTemplateReference(templateCode, templateVersion, { datedTemplate: weekly }).backgroundAssetId, base)
})

test('생성 요청에는 datedTemplate 을 빼고 보내며(서버가 설정 키를 제한), 어느 페이지에 넣을지 함께 돌려준다', () => {
  const { templateCode, templateVersion } = serverTemplateReference(id, '1.0.0', 'portrait')
  const config = { width: 768, height: 1024, paperAppearance: { backgroundColor: '#FFFFFF', layoutColor: '#292929' }, datedTemplate: id }
  const [selection] = toServerInitialPageSelections([{ templateId: id, templateCode, templateVersion, templateConfig: config }])
  assert.equal(selection.datedTemplate, id)
  assert.equal(DATED_CONFIG_KEY in JSON.parse(selection.configurationJson), false)
  // 앱 ID 와 설정의 날짜가 다르면 거부
  assert.throws(() => toServerInitialPageSelections([{ templateId: id, templateCode, templateVersion, templateConfig: { ...config, datedTemplate: 'dated-monthly-2027-04-portrait' } }]))
})

test('회원 새 다이어리: 만든 뒤 날짜 페이지 설정에 datedTemplate 을 넣고, 편집기 페이지 추가도 날짜 속지를 만든다', () => {
  const store = read('../src/diary/services/memberAppStore.js')
  assert.match(store, /if \(dated\.length\) \{ await api\.setDatedPages\(dated\); active\(\) \}/)
  const api = read('../src/diary/services/memberDiaryApi.js')
  assert.match(api, /async setDatedPages\(pages, options = \{\}\)/)
  assert.match(api, /body\.page\.templateConfig\?\.datedTemplate !== templateConfig\.datedTemplate/)
  assert.match(read('../src/collaboration/serverPages.js'), /if\(isDatedId\(backgroundAssetId\)\)base=datedBaseId\(backgroundAssetId\)/)
  // 회원도 날짜 있음 · 날짜 없이를 고른다(속지 글꼴만 서버에 칸이 없어 고르지 않는다)
  const modal = read('../src/diary/components/DiaryCreateModal.js')
  assert.doesNotMatch(modal, /dated: false/)
  assert.doesNotMatch(read('../src/diary/components/PaperOptions.js'), /undatedOnly/)
})

test('기간 시작(해 · 달) 두 칸은 날짜 있음 · 날짜 없이와 같은 반반 폭 · 사이 6', () => {
  const options = read('../src/diary/components/PaperOptions.js')
  assert.match(options, /period: \{ flexDirection: 'row', gap: 6 \}/)
  assert.match(options, /stepper: \{ flex: 1, minWidth: 0,[^}]*borderColor: colors\.cardBorder \}/)
})

test('setDatedPages 는 페이지마다 설정(+datedTemplate)을 PATCH 하고, 응답이 다르면 거절하며 설정 없는 쪽은 보내지 않는다', async () => {
  const pageIds = ['aaaaaaaa-bbbb-cccc-dddd-000000000001', 'aaaaaaaa-bbbb-cccc-dddd-000000000002']
  const calls = []
  const echo = async request => { calls.push(request); return { page: { pageId: request.path.split('/').pop(), templateConfig: request.body.templateConfig } } }
  const config = { width: 768, height: 1024, datedTemplate: id }
  await createMemberDiaryApi(echo).setDatedPages(pageIds.map(pageId => ({ pageId, templateConfig: config })))
  assert.deepEqual(calls.map(call => [call.method, call.path, call.body]), pageIds.map(pageId => ['PATCH', `/pages/${pageId}`, { templateConfig: config }]))
  const stale = createMemberDiaryApi(async request => ({ page: { pageId: request.path.split('/').pop(), templateConfig: { width: 768 } } }))
  await assert.rejects(stale.setDatedPages([{ pageId: pageIds[0], templateConfig: config }]), { code: 'INVALID_RESPONSE' })
  const before = calls.length
  await assert.rejects(createMemberDiaryApi(echo).setDatedPages([{ pageId: pageIds[0], templateConfig: { width: 1 } }]), { code: 'INVALID_RESPONSE' })
  assert.equal(calls.length, before)
})

test('동작: 회원 생성은 날짜 페이지에 datedTemplate 을 PATCH 하고, PATCH 가 실패하면 요청을 남겨 같은 키로 다시 시도해 복구한다', async () => {
  const { createMemberAppStore } = await import('../src/diary/services/memberAppStore.js')
  const { memberKeys } = await import('../src/diary/services/memberStorage.js')
  const { sectionsTemplateConfig, newSection, newRow } = await import('../src/diary/utils/paperChoice.js')
  const diaryId = '11111111-2222-3333-4444-555555555555'
  const pageIds = ['aaaaaaaa-bbbb-cccc-dddd-000000000001', 'aaaaaaaa-bbbb-cccc-dddd-000000000002']
  const stamp = '2026-10-27T00:00:00.123456Z'
  const row = { id: diaryId, title: '날짜', color: '#123456', coverStyle: 'PLAIN', pattern: null, canEdit: true, visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, version: '1' }
  const values = new Map(), keys = new Set(), patched = []
  let created = 0, failPatch = true
  const storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  const api = {
    async create(input, options) {
      keys.add(options.requestId); created++
      // 저장소가 넘기는 앱 입력에는 날짜 ID 가 있다(서버로 갈 때는 memberDiaryApi.create 가 뺀다 — 아래 테스트)
      assert.ok(input.initialPages.every(p => typeof p.templateConfig.datedTemplate === 'string'))
      return { ...row, firstPageId: pageIds[0], pageIds: [...pageIds] }
    },
    async setDatedPages(pages) {
      if (failPatch) { failPatch = false; throw Object.assign(new Error('patch failed'), { code: 'NETWORK_ERROR' }) }
      patched.push(...pages)
    },
    async get() { return { ...row } },
    async list() { return { items: created ? [{ ...row, pageCount: 2, isShared: false }] : [], hasNext: false, nextCursor: null } },
  }
  const section = { ...newSection(), rows: [newRow('monthly', 1, 'month')], year: 2027, startMonth: 3, months: 2 }
  const form = { title: '날짜', color: '#123456', pattern: null, pageSize: 'portrait', templateConfig: sectionsTemplateConfig([section], 'portrait') }
  const store = createMemberAppStore({ accountId: '101', api, storage, makeRequestId: () => 'dated-key' })
  await store.load()
  await assert.rejects(store.create(form), /patch failed/)
  assert.ok(store.getSnapshot().pending, '날짜를 못 넣으면 생성 요청을 남긴다')
  const diary = await store.retryCreation()
  assert.equal(diary.id, diaryId)
  assert.deepEqual([...keys], ['dated-key'])
  assert.deepEqual(patched.map(p => [p.pageId, p.templateConfig.datedTemplate]), [[pageIds[0], 'dated-monthly-2027-03-portrait'], [pageIds[1], 'dated-monthly-2027-04-portrait']])
  // 이 기기 문서도 날짜 ID 로 그린다
  const doc = JSON.parse(values.get(memberKeys('101').doc(diaryId)))
  assert.deepEqual(doc.pages.map(p => p.backgroundAssetId), ['dated-monthly-2027-03-portrait', 'dated-monthly-2027-04-portrait'])
})

test('동작: 편집기 페이지 추가(createServerPage)는 날짜 속지를 만년형 행 + datedTemplate 으로 만든다', async () => {
  const { createServerPage } = await import('../src/collaboration/serverPages.js')
  const diaryId = '11111111-2222-3333-4444-555555555555', pageId = 'aaaaaaaa-bbbb-cccc-dddd-000000000009'
  const values = new Map(), storage = { async getItem(k) { return values.get(k) ?? null }, async setItem(k, v) { values.set(k, v) }, async removeItem(k) { values.delete(k) } }
  let sent = null
  const transport = async ({ method, path, body }) => {
    assert.equal(method, 'POST'); assert.equal(path, `/diaries/${diaryId}/pages`); sent = body
    return { page: { pageId, diaryId, templateId: 7, templateCode: serverTemplateReference(base, '1.0.0', 'portrait').templateCode, templateVersion: '1.0.0',
      templateConfig: body.templateConfig, title: null, canvasWidth: body.canvasWidth, canvasHeight: body.canvasHeight, gridVisible: false, gridColor: null } }
  }
  const page = await createServerPage({ transport, diaryId, backgroundAssetId: id, orientation: 'portrait', storage, key: 'k', createId: () => '33333333-4444-5555-6666-777777777777' })
  assert.equal(sent.templateConfig.datedTemplate, id)
  assert.equal(sent.templateConfig.templateCode, serverTemplateReference(base, '1.0.0', 'portrait').templateCode)
  assert.equal(page.backgroundAssetId, id)
})

test('동작: memberDiaryApi.create 가 서버로 보내는 생성 요청에는 datedTemplate 이 없다', async () => {
  const { createMemberDiaryApi } = await import('../src/diary/services/memberDiaryApi.js')
  const { diaryCreateInput } = await import('../src/diary/services/diaryCreateInput.js')
  const { sectionsTemplateConfig, newSection, newRow } = await import('../src/diary/utils/paperChoice.js')
  const section = { ...newSection(), rows: [newRow('monthly', 1, 'month')], year: 2027, startMonth: 3, months: 2 }
  const input = diaryCreateInput({ title: '날짜', color: '#123456', pageSize: 'portrait', templateConfig: sectionsTemplateConfig([section], 'portrait') })
  let body = null
  const api = createMemberDiaryApi(async request => { body = request.body; throw Object.assign(new Error('stop'), { code: 'STOP' }) })
  await assert.rejects(api.create(input, { requestId: '33333333-4444-5555-6666-777777777777' }), /stop/)
  assert.equal(body.initialPages.length, 2)
  assert.equal(JSON.stringify(body).includes('datedTemplate'), false)
  assert.deepEqual(Object.keys(body.initialPages[0]).sort(), ['templateCode', 'templateConfig', 'templateVersion'])
})
