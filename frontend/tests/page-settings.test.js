import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePageSettings, pageSettingsBody, pageSettingsChanges } from '../src/collaboration/pageSettings.js'
import { decodeServerPage, loadServerPageSnapshot, updateServerPage, loadPageSettings } from '../src/collaboration/serverPages.js'
import { createInitialState, editorReducer } from '../src/editor/state/editorReducer.js'
import { collaborationReducer } from '../src/collaboration/collaborationReducer.js'

const diaryId = '10000000-0000-4000-8000-000000000001', pageId = '20000000-0000-4000-8000-000000000001'
const page = (patch = {}) => ({ pageId, diaryId, title: '원래 이름', canvasWidth: 1188, canvasHeight: 840,
  templateId: null, templateConfig: { blank: true }, gridVisible: false, gridColor: '#DCE5F1', ...patch })

test('속지 스타일만 PATCH하고 재조회한 다이어리 기본값과 페이지 스타일을 각각 적용한다', async () => {
  const appearance = { backgroundColor: '#EDF3EA', layoutColor: '#292929', font: 'gowun-dodum' }
  const defaults = { ...appearance, font: 'poor-story' }
  const row = page({ templateConfig: { blank: true, paperAppearance: appearance } })
  const body = { paperAppearance: appearance, applyPaperAppearanceToAllPages: true }
  const saved = await updateServerPage(async request => {
    assert.deepEqual(request.body, body)
    return { page: row }
  }, diaryId, pageId, body)
  assert.deepEqual(saved.paperAppearance, appearance)
  await assert.rejects(updateServerPage(async () => ({ page: page() }), diaryId, pageId, body),
    { code: 'INVALID_SERVER_PAGES' })
  const snapshot = await loadServerPageSnapshot(async () => ({ items: [row], paperAppearance: defaults }), diaryId, { knownIds: [pageId] })
  const objects = [{ id: 'unsaved-ink' }]
  const initial = createInitialState({ pages: [{ id: pageId, objects }] }, pageId)
  const next = editorReducer(initial, { type: 'reconcileServerPages', ...snapshot })
  assert.deepEqual(next.doc.paperAppearance, defaults)
  assert.deepEqual(next.doc.pages[0].paperAppearance, appearance)
  assert.equal(next.doc.pages[0].objects, initial.doc.pages[0].objects)
})

test('누락·잘못된 격자 응답은 폼과 변경 비교에 같은 기본값을 사용한다', async () => {
  for (const fields of [{ gridVisible: undefined, gridColor: undefined }, { gridVisible: null, gridColor: null }, { gridVisible: 'true', gridColor: '#fff' }]) {
    const loaded = await loadPageSettings(async () => ({ page: page(fields) }), diaryId, pageId)
    const normalized = normalizePageSettings(loaded)
    assert.equal(normalized.gridVisible, false); assert.equal(normalized.gridColor, '#DCE5F1')
    const form = { title: normalized.title, width: String(normalized.canvasWidth), height: String(normalized.canvasHeight), grid: normalized.gridVisible, color: normalized.gridColor }
    assert.equal(pageSettingsChanges(loaded, form), null)
    assert.deepEqual(pageSettingsChanges(loaded, { ...form, title: '새 이름' }), { title: '새 이름' })
    assert.deepEqual(pageSettingsChanges(loaded, { ...form, grid: true }), { gridVisible: true })
    assert.deepEqual(pageSettingsChanges(loaded, { ...form, grid: true, color: '#112233' }), { gridVisible: true, gridColor: '#112233' })
  }
  assert.equal(normalizePageSettings(page({ gridVisible: true, gridColor: '#123456' })).gridColor, '#123456')
})
test('설정 PATCH는 변경한 필드만 보내고 false를 보존하며 응답을 변환한다', async () => {
  const calls = []
  const result = await updateServerPage(async request => {
    calls.push(request)
    return { page: page({ title: request.body.title, gridVisible: request.body.gridVisible }) }
  }, diaryId, pageId, { title: '  새 이름  ', gridVisible: false })
  assert.deepEqual(calls, [{ method: 'PATCH', path: `/pages/${pageId}`, body: { title: '새 이름', gridVisible: false } }])
  assert.equal(result.title, '새 이름'); assert.equal(result.gridVisible, false)
  assert.equal('objects' in result, false)
})
for (const body of [{}, { title: null }, { title: '' }, { title: ' ' }, { title: 'x'.repeat(101) }, { indexed: true },
  { canvasWidth: 100 }, { canvasWidth: 0, canvasHeight: 100 }, { canvasWidth: 1.001, canvasHeight: 100 },
  { canvasWidth: Infinity, canvasHeight: 100 }, { canvasWidth: 100000000, canvasHeight: 100 },
  { gridVisible: 'true' }, { gridColor: 'red' }, { templateId: null }, { templateId: -1 }, { templateConfig: [] }]) {
  test(`백엔드가 거절하는 설정은 전송 전에 검증한다: ${JSON.stringify(body)}`, async () => {
    let calls = 0
    await assert.rejects(updateServerPage(async () => { calls++ }, diaryId, pageId, body), { code: 'INVALID_PAGE_SETTINGS' })
    assert.equal(calls, 0)
  })
}
test('크기는 소수 둘째 자리까지 쌍으로 허용하고 템플릿 PK를 추정하지 않는다', () => {
  assert.deepEqual(pageSettingsBody({ canvasWidth: 0.01, canvasHeight: 99999999.99 }), { canvasWidth: 0.01, canvasHeight: 99999999.99 })
  assert.deepEqual(pageSettingsBody({ templateId: 7 }), { templateId: 7 })
})
test('버전 보호 없는 기존 속지 교체는 조회·전송 전에 차단한다', async () => {
  for (const body of [{ templateConfig: { blank: true } }, { templateId: 7 }, { title: '이름', templateConfig: { width: 840 } }]) {
    let calls = 0
    await assert.rejects(updateServerPage(async () => { calls++ }, diaryId, pageId, body), { code: 'UNSUPPORTED_PAGE_TEMPLATE' })
    assert.equal(calls, 0)
  }
})
test('DB 속지를 null로 지우거나 다른 다이어리·페이지의 응답을 반영하지 않는다', async () => {
  let writes = 0
  await assert.rejects(updateServerPage(async r => { if (r.method) writes++; return { page: page({ templateId: 7 }) } }, diaryId, pageId,
    { templateConfig: { blank: true } }), { code: 'UNSUPPORTED_PAGE_TEMPLATE' })
  assert.equal(writes, 0)
  for (const patch of [{ diaryId: pageId }, { pageId: diaryId }]) {
    await assert.rejects(updateServerPage(async () => ({ page: page(patch) }), diaryId, pageId, { title: '새 이름' }), { code: 'INVALID_SERVER_PAGES' })
    await assert.rejects(loadPageSettings(async () => ({ page: page(patch) }), diaryId, pageId), { code: 'INVALID_SERVER_PAGES' })
  }
})
test('서버 오류는 성공으로 취급하지 않고 그대로 전달한다', async () => {
  const error = Object.assign(Error('forbidden'), { status: 403 })
  await assert.rejects(updateServerPage(async () => { throw error }, diaryId, pageId, { title: '이름' }), error)
})
test('기존 페이지 설정을 목록에서 가져오되 필기 상세를 다시 내려받지 않는다', async () => {
  const calls = []
  const snapshot = await loadServerPageSnapshot(async r => { calls.push(r); return { items: [page({ title: '원격 제목', gridVisible: true })] } }, diaryId, { knownIds: [pageId] })
  assert.equal(calls.length, 1); assert.equal(snapshot.pages.length, 0)
  assert.equal(snapshot.settings[0].title, '원격 제목'); assert.equal(snapshot.settings[0].gridVisible, true)
})
test('원격 설정 갱신은 미전송 요소·인덱스·선택과 Undo 이력을 보존한다', () => {
  const local = { ...decodeServerPage({ page: page(), elements: [] }, diaryId), indexed: true, objects: [{ id: 'local-ink', type: 'stroke', points: [] }] }
  let state = createInitialState({ id: diaryId, pages: [local] })
  state = { ...state, past: [state.doc], future: [state.doc], pendingCheckpoint: { doc: state.doc }, collaborationEdits: [{ id: 'pending' }] }
  const settings = { id: pageId, title: '새 제목', canvasWidth: 840, canvasHeight: 1188, gridVisible: true }
  const next = collaborationReducer(editorReducer, state, { type: 'reconcileServerPages', pageIds: [pageId], pages: [], settings: [settings] })
  assert.equal(next.doc.pages[0].title, '새 제목')
  assert.equal(next.doc.pages[0].objects, local.objects); assert.equal(next.doc.pages[0].indexed, true)
  assert.equal(next.pageId, state.pageId); assert.deepEqual(next.collaborationEdits, state.collaborationEdits)
  for (const doc of [next.past[0], next.future[0], next.pendingCheckpoint.doc]) assert.equal(doc.pages[0].title, '새 제목')
  assert.equal(next.past.length, 1)
})
test('설정 폼은 수정 안 한 필드를 생략하고 이름·크기·격자 변경만 저장한다', () => {
  const initial = { title: '제목', canvasWidth: 1188, canvasHeight: 840, gridVisible: false, gridColor: '#DCE5F1' }
  const form = { title: '제목', width: '1188', height: '840', grid: false, color: '#DCE5F1', template: null }
  assert.equal(pageSettingsChanges(initial, form), null)
  assert.deepEqual(pageSettingsChanges(initial, { ...form, title: ' 새 제목 ', grid: true }), { title: '새 제목', gridVisible: true })
  assert.deepEqual(pageSettingsChanges(initial, { ...form, width: '840', height: '1188' }), { canvasWidth: 840, canvasHeight: 1188 })
  assert.throws(() => pageSettingsChanges(initial, { ...form, grid: true, color: '#fff' }), { code: 'INVALID_PAGE_SETTINGS' })
})

test('격자를 끄면 숨겨진 색 입력을 생략해 이름·크기·끄기를 저장한다', async () => {
  for (const wasOn of [false, true]) {
    const initial = { title: '제목', canvasWidth: 1188, canvasHeight: 840, gridVisible: wasOn, gridColor: '#DCE5F1' }
    for (const color of ['#fff', '', '#112233']) {
      const body = pageSettingsChanges(initial, { title: '새 이름', width: '840', height: '1188', grid: false, color })
      assert.deepEqual(body, { title: '새 이름', canvasWidth: 840, canvasHeight: 1188, ...(wasOn ? { gridVisible: false } : {}) })
      const calls = []
      await updateServerPage(async request => { calls.push(request); return { page: page({ ...initial, ...request.body }) } }, diaryId, pageId, body)
      assert.equal(calls.length, 1)
      assert.equal('gridColor' in calls[0].body, false)
    }
  }
})

test('격자를 켰다가 끄고 색만 달라졌으면 요청하지 않으며 다시 켜면 색을 검증한다', () => {
  const initial = { title: '제목', canvasWidth: 1188, canvasHeight: 840, gridVisible: false, gridColor: '#DCE5F1' }
  const form = { title: '제목', width: '1188', height: '840', grid: false, color: '#fff' }
  assert.equal(pageSettingsChanges(initial, form), null)
  assert.throws(() => pageSettingsChanges(initial, { ...form, grid: true }), { code: 'INVALID_PAGE_SETTINGS' })
  assert.deepEqual(pageSettingsChanges(initial, { ...form, grid: true, color: '#112233' }), { gridVisible: true, gridColor: '#112233' })
})

test('기존 페이지의 알 수 없는 속지가 섞여도 원격 순서·추가·삭제와 기본 설정을 반영한다', async () => {
  const removedId = '20000000-0000-4000-8000-000000000002'
  const retainedId = '20000000-0000-4000-8000-000000000003'
  const addedId = '20000000-0000-4000-8000-000000000004'
  const local = decodeServerPage({ page: page(), elements: [] }, diaryId)
  local.objects = [{ id: 'unsent-ink', type: 'stroke', points: [] }]
  const current = createInitialState({ id: diaryId, pages: [local, { ...local, id: removedId }, { ...local, id: retainedId }] })
  const unknown = page({ templateCode: 'new-server-template', templateVersion: '999', title: '원격 제목', gridVisible: true, gridColor: '#123456' })
  assert.throws(() => decodeServerPage({ page: unknown, elements: [] }, diaryId), { code: 'INVALID_SERVER_PAGES' })
  const calls = []
  const snapshot = await loadServerPageSnapshot(async request => {
    calls.push(request.path)
    return request.path.endsWith('/pages') ? { items: [page({ pageId: retainedId }), unknown, page({ pageId: addedId })] }
      : { page: page({ pageId: addedId }), elements: [] }
  }, diaryId, { knownIds: [pageId, removedId, retainedId] })
  assert.deepEqual(calls, [`/diaries/${diaryId}/pages`, `/pages/${addedId}`])
  const next = collaborationReducer(editorReducer, current, { type: 'reconcileServerPages', ...snapshot })
  assert.deepEqual(next.doc.pages.map(p => p.id), [retainedId, pageId, addedId])
  const changed = next.doc.pages[1]
  assert.equal(changed.objects, local.objects); assert.equal(changed.backgroundAssetId, local.backgroundAssetId)
  assert.deepEqual(changed.serverTemplateConfig, local.serverTemplateConfig)
  assert.equal(changed.title, '원격 제목'); assert.equal(changed.gridVisible, true); assert.equal(changed.gridColor, '#123456')
  assert.ok(next.doc.pageRecovery.some(entry => entry.page.id === removedId))
})

test('기존 행의 잘못된 크기·색은 덮어쓰지 않고 다른 행과 순서를 유지한다', async () => {
  const otherId = '20000000-0000-4000-8000-000000000002'
  const snapshot = await loadServerPageSnapshot(async () => ({ items: [page({ pageId: otherId }), page({ canvasWidth: -1, gridColor: 'red', title: '유효한 제목' })] }), diaryId, { knownIds: [pageId, otherId] })
  assert.deepEqual(snapshot.pageIds, [otherId, pageId])
  const metadata = snapshot.settings.find(p => p.id === pageId)
  assert.equal(metadata.title, '유효한 제목')
  for (const field of ['canvasWidth', 'canvasHeight', 'gridColor', 'backgroundAssetId']) assert.equal(field in metadata, false)
})

test('새 페이지 상세의 알 수 없는 속지나 잘못된 목록 식별자는 계속 거절한다', async () => {
  const unknown = page({ templateCode: 'unknown', templateVersion: '999' })
  await assert.rejects(loadServerPageSnapshot(async request => request.path.endsWith('/pages') ? { items: [unknown] } : { page: unknown, elements: [] }, diaryId), { code: 'INVALID_SERVER_PAGES' })
  for (const items of [[page(), page()], [page({ diaryId: pageId })], [page({ pageId: 'invalid' })]]) {
    await assert.rejects(loadServerPageSnapshot(async () => ({ items }), diaryId, { knownIds: [pageId] }), { code: 'INVALID_SERVER_PAGES' })
  }
})

test('알 수 없는 속지의 설정 조회·저장은 성공하고 로컬 속지와 필기는 유지한다', async () => {
  const local = decodeServerPage({ page: page(), elements: [] }, diaryId)
  local.objects = [{ id: 'unsent', type: 'stroke', points: [] }]
  let state = createInitialState({ id: diaryId, pages: [local] })
  let server = page({ templateId: 77, templateCode: 'new-template', templateVersion: '999', templateConfig: { custom: 'server' } })
  const calls = []
  const transport = async request => {
    calls.push(request)
    if (request.method === 'PATCH') server = { ...server, ...request.body }
    return { page: server, elements: [{ ignored: true }] }
  }
  const loaded = await loadPageSettings(transport, diaryId, pageId)
  assert.equal(loaded.title, server.title); assert.equal(loaded.canvasWidth, server.canvasWidth)
  const body = pageSettingsChanges(loaded, { title: '저장 성공', width: '840', height: '1188', grid: true, color: '#112233' })
  const saved = await updateServerPage(transport, diaryId, pageId, body)
  assert.equal(calls.length, 2); assert.equal(calls[1].method, 'PATCH')
  state = collaborationReducer(editorReducer, state, { type: 'applyServerPageSettings', settings: [saved] })
  const result = state.doc.pages[0]
  assert.equal(result.title, '저장 성공'); assert.equal(result.gridVisible, true); assert.equal(result.gridColor, '#112233')
  assert.equal(result.canvasWidth, 840); assert.equal(result.canvasHeight, 1188)
  assert.equal(result.objects, local.objects); assert.equal(result.backgroundAssetId, local.backgroundAssetId)
  assert.deepEqual(result.serverTemplateConfig, local.serverTemplateConfig)
  for (const value of [loaded, saved]) {
    for (const field of ['objects', 'backgroundAssetId', 'serverTemplateConfig', 'paperAppearance']) assert.equal(field in value, false)
  }
})

test('단건 설정 응답의 잘못된 ID·다이어리·크기는 여전히 거절한다', async () => {
  for (const patch of [{ pageId: diaryId }, { diaryId: pageId }, { canvasWidth: 0 }, { canvasHeight: null }, { canvasWidth: '840' }]) {
    const transport = async () => ({ page: page({ templateCode: 'unknown', templateVersion: '999', ...patch }) })
    await assert.rejects(loadPageSettings(transport, diaryId, pageId), { code: 'INVALID_SERVER_PAGES' })
    await assert.rejects(updateServerPage(transport, diaryId, pageId, { title: '제목' }), { code: 'INVALID_SERVER_PAGES' })
  }
})
