import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createCanvasApi } from '../src/collaboration/canvasApi.js'
import { createCanvasMedia } from '../src/collaboration/canvasMedia.js'
import { STORAGE_KEYS } from '../src/editor/utils/storageContract.js'
import {
  planGuestDiary, splitStroke, batchElements, createGuestDiaryImporter, listGuestImportCandidates, declineGuestImport,
  readGuestImportLedger, guestImportJournalKey, skippedSummary, withUploadRetry, ELEMENT_PROPERTIES_LIMIT,
} from '../src/diary/services/guestDiaryImport.js'

const accountId = '7'
const hex = n => n.toString(16).padStart(12, '0')
const ids = () => { let n = 0; return () => `00000000-0000-4000-8000-${hex(++n)}` }
const photoId = 'aaaaaaaa-0000-4000-8000-000000000001', gifId = 'aaaaaaaa-0000-4000-8000-000000000002', goneId = 'aaaaaaaa-0000-4000-8000-000000000003'
const guestDiary = { id: 'diary-1', title: '여행 일기', color: '#F2A7A0', pattern: 'linen', favorite: true, pageSize: 'landscape', createdAt: '2026-05-01T00:00:00.000Z',
  cover: { band: { enabled: true }, title: { text: '여행' } } }
const longStroke = { id: 's1', type: 'stroke', x: 10, y: 10, w: 500, h: 300, baseWidth: 500, baseHeight: 300, rotation: 0, color: '#000000', strokeWidth: 3, penKind: 'ball', renderVersion: 2,
  points: Array.from({ length: 6000 }, (_, i) => ({ x: i % 500 + 0.123456789, y: (i * 7) % 300 + 0.987654321, pressure: 0.512345678 })) }
const guestDoc = () => ({ id: 'diary-1', paperAppearance: { backgroundColor: '#FFF8E7', layoutColor: '#33476B', font: 'nanum-gothic' }, pages: [
  { id: 'p1', backgroundAssetId: '2026-reusable-note-plain-landscape', templateVersion: '1.0.0', canvasWidth: 1024, canvasHeight: 768,
    paperAppearance: { backgroundColor: '#FFF8E7', layoutColor: '#33476B', font: 'nanum-gothic' }, title: '첫날', objects: [
      { id: 'local-text', type: 'text', x: 1, y: 2, w: 100, h: 40, text: '안녕', font: 'personal-11111111-2222-3333-4444-555555555555' },
      { id: 'local-photo', type: 'photo', x: 5, y: 5, w: 80, h: 80, mediaFileId: photoId, src: `media:${photoId}` },
      { id: 'local-gif', type: 'sticker', x: 9, y: 9, w: 50, h: 50, mediaFileId: gifId, src: `media:${gifId}` },
      { id: 'local-gone', type: 'photo', x: 9, y: 9, w: 50, h: 50, mediaFileId: goneId, src: `media:${goneId}` },
      { id: 'local-widget', type: 'dday', x: 0, y: 0, w: 10, h: 10 },
    ] },
  { id: 'p2', backgroundAssetId: 'dated-monthly-2027-03-landscape', templateVersion: '1.0.0', objects: [longStroke] },
  { id: 'p3', canvasWidth: 900, canvasHeight: 700, gridVisible: true, gridColor: '#DCE5F1', objects: [] },
] })

function memoryStorage(initial = {}) {
  const disk = new Map(Object.entries(initial))
  return { disk, getItem: async k => disk.get(k) ?? null, setItem: async (k, v) => { disk.set(k, v) }, removeItem: async k => { disk.delete(k) } }
}

// 실제 백엔드 계약(생성 키 재생 · clientOperationId 재생 · 128KiB 한도 · PATCH 로 templateConfig 교체)을 흉내 낸 서버
function fakeServer({ serverId = ids() } = {}) {
  const diaries = new Map(), pages = new Map(), keys = new Map(), ops = new Map(), media = new Map(), calls = []
  let failOnce = null
  const err = (status, code) => Object.assign(new Error(code), { status, code })
  const transport = async request => {
    calls.push({ method: request.method ?? 'GET', path: request.path })
    if (failOnce?.(request)) { failOnce = null; throw err(0, 'NETWORK_ERROR') }
    const { method = 'GET', path, body } = request
    if (method === 'POST' && path === '/member/diaries') {
      if (keys.has(request.requestId)) return structuredClone(keys.get(request.requestId))
      const diaryId = serverId(), pageIds = body.initialPages.map(() => serverId())
      for (const [i, page] of body.initialPages.entries()) {
        assert.deepEqual(Object.keys(page.templateConfig).filter(k => !['width', 'height', 'paperAppearance', 'blank'].includes(k)), [])
        if (page.templateConfig.paperAppearance) assert.deepEqual(Object.keys(page.templateConfig.paperAppearance).sort(), ['backgroundColor', 'layoutColor'])
        pages.set(pageIds[i], { pageId: pageIds[i], diaryId, templateCode: page.templateCode, templateVersion: page.templateVersion, templateConfig: structuredClone(page.templateConfig), canvasWidth: page.templateConfig.width, canvasHeight: page.templateConfig.height, elements: [] })
      }
      const diary = { diaryId, diaryTitle: body.diaryTitle, coverColor: body.coverColor, coverStyle: body.coverStyle, visibility: 'PRIVATE', createdAt: '2026-11-02T00:00:00Z', updatedAt: '2026-11-02T00:00:00Z',
        canEdit: true, version: '1', myRole: 'OWNER', myMembership: { isFavorite: false }, permissions: { canEditMetadata: true, canEditCanvas: true, canTrash: true, canRestore: true, canPermanentlyDelete: true } }
      diaries.set(diaryId, diary)
      const response = { diary, firstPageId: pageIds[0], pageIds }
      keys.set(request.requestId, response); return structuredClone(response)
    }
    const pageMatch = /^\/pages\/([0-9a-f-]+)(\/canvas-operations)?$/.exec(path)
    if (pageMatch) {
      const page = pages.get(pageMatch[1]); if (!page) throw err(404, 'PAGE_NOT_FOUND')
      if (method === 'GET') return { page: structuredClone({ ...page, elements: undefined }), elements: structuredClone(page.elements) }
      if (method === 'PATCH') {
        for (const key of ['title', 'canvasWidth', 'canvasHeight', 'gridVisible', 'gridColor']) if (key in body) page[key] = body[key]
        if (body.templateConfig) page.templateConfig = structuredClone(body.templateConfig)
        return { page: structuredClone({ ...page, elements: undefined }) }
      }
      if (ops.has(body.clientOperationId)) {
        assert.equal(JSON.stringify(ops.get(body.clientOperationId).body), JSON.stringify(body), '같은 clientOperationId 는 같은 내용이어야 해요')
        return structuredClone(ops.get(body.clientOperationId).response)
      }
      for (const row of body.changes.creates) {
        if (new TextEncoder().encode(JSON.stringify(row.propertiesJson)).length > 128 * 1024) throw err(400, 'INVALID_CANVAS_ELEMENT')
        if (page.elements.some(e => e.elementId === row.elementId)) throw err(400, 'DUPLICATE_ELEMENT')
        for (const id of [row.mediaFileId, row.propertiesJson?.mediaFileId].filter(Boolean)) if (!media.has(id)) throw err(404, 'MEDIA_NOT_FOUND')
      }
      for (const row of body.changes.creates) page.elements.push({ ...structuredClone(row), pageId: page.pageId, version: 1 })
      const response = { operationId: String(ops.size + 1), clientOperationId: body.clientOperationId, revision: ops.size + 1, items: structuredClone(page.elements) }
      ops.set(body.clientOperationId, { body: structuredClone(body), response }); return structuredClone(response)
    }
    const membership = /^\/diaries\/([0-9a-f-]+)\/membership$/.exec(path)
    if (membership && method === 'PATCH') { diaries.get(membership[1]).myMembership.isFavorite = body.favorite; return {} }
    throw err(404, `UNKNOWN ${method} ${path}`)
  }
  const files = { uploads: [], upload: async (id, category) => {
    if (id === gifId) throw Object.assign(new Error('too large'), { status: 413, code: 'MEDIA_FILE_TOO_LARGE' })
    if (id === goneId) throw Object.assign(new Error('missing'), { code: 'MEDIA_NOT_FOUND' })
    files.uploads.push([id, category]); return { id, category }
  }, cached: async () => true, save: async () => {} }
  const mediaRequest = async (path, options) => {
    assert.equal(path, '/media')
    const id = serverId(); media.set(id, options.body); return { mediaFileId: id }
  }
  return { transport, files, mediaRequest, diaries, pages, ops, media, calls, failNext: fn => { failOnce = fn } }
}

function importer(server, storage, { createId = ids(), isActive = () => true } = {}) {
  const api = createMemberDiaryApi(server.transport)
  const canvas = createCanvasApi(server.transport)
  const mediaFor = diaryId => createCanvasMedia({ request: server.mediaRequest, files: server.files, storage, key: `dio:member:v1:${accountId}:doc:${diaryId}:media-uploads:v1:test` })
  return createGuestDiaryImporter({ accountId, storage, api, transport: server.transport, canvas, mediaFor, createId, isActive,
    loadGuestDoc: async diary => JSON.parse(await storage.getItem(`${STORAGE_KEYS.doc}:${diary.id}`) ?? 'null'), now: () => '2026-11-02T01:00:00.000Z' })
}
const guestStorage = () => memoryStorage({ [STORAGE_KEYS.diaries]: JSON.stringify([guestDiary, { id: 'diary-2', title: '버린 것', trashedAt: '2026-10-01T00:00:00Z' }]), [`${STORAGE_KEYS.doc}:diary-1`]: JSON.stringify(guestDoc()) })

test('계획: 속지는 서버 카탈로그로, 날짜 속지는 만년형으로, 글꼴 · 크기 · 이름 · 격자는 만든 뒤 PATCH 로 보낸다', () => {
  const plan = planGuestDiary(guestDiary, guestDoc(), { createId: ids() })
  assert.deepEqual(plan.create.initialPages.map(p => p.templateCode), ['2026-reusable-note-plain-landscape', 'undated-monthly-landscape', 'dio-blank-landscape'])
  assert.deepEqual(plan.create.initialPages[0].templateConfig.paperAppearance, { backgroundColor: '#FFF8E7', layoutColor: '#33476B' })
  assert.equal(plan.pages[0].font, 'nanum-gothic')
  assert.deepEqual(plan.pages[0].settings, { title: '첫날' })
  assert.deepEqual(plan.pages[2].settings, { canvasWidth: 900, canvasHeight: 700, gridVisible: true, gridColor: '#DCE5F1' })
  assert.equal(plan.create.initialPages[2].templateConfig.blank, true)
  const kinds = skippedSummary(plan.skipped).map(row => row.kind)
  for (const kind of ['createdAt', 'cover', 'datedText', 'element', 'personalFont']) assert.ok(kinds.includes(kind), kind)
  // 요소 id 는 모두 새 UUID
  const elements = plan.pages.flatMap(p => p.batches.flatMap(b => b.creates))
  assert.ok(elements.every(e => /^00000000-/.test(e.elementId)))
  assert.equal(new Set(elements.map(e => e.elementId)).size, elements.length)
})

test('긴 펜 획은 같은 좌표계를 둔 채 한도 아래로 나뉘고 이음매 점이 겹친다', () => {
  const parts = splitStroke({ ...longStroke, id: 'x' }, ids())
  assert.ok(parts.length > 1)
  for (const part of parts) {
    const { points, id, ...rest } = part
    const { points: _, id: __, ...original } = longStroke
    assert.deepEqual(rest, original)
    assert.ok(new TextEncoder().encode(JSON.stringify(part)).length <= ELEMENT_PROPERTIES_LIMIT + 1024)
  }
  assert.deepEqual(parts.at(-1).points.at(-1), longStroke.points.at(-1))
  for (let i = 1; i < parts.length; i++) assert.deepEqual(parts[i].points[0], parts[i - 1].points.at(-1))
})

test('묶음은 100개 · 크기 한도를 넘지 않게 나뉜다', () => {
  const elements = Array.from({ length: 250 }, (_, i) => ({ elementId: String(i), propertiesJson: {} }))
  assert.deepEqual(batchElements(elements).map(b => b.length), [100, 100, 50])
})

test('가져오기: 생성 → 페이지 설정 → 업로드 후 id 교체 → 요소 전송 → 즐겨찾기, 원본은 남기고 가져옴만 기록한다', async () => {
  const server = fakeServer(), storage = guestStorage()
  const before = await listGuestImportCandidates(storage, accountId)
  assert.deepEqual(before.diaries.map(d => d.id), ['diary-1'])
  const progress = []
  const result = await importer(server, storage).run(before.diaries, { onProgress: p => progress.push(p) })
  assert.equal(result.failed.length, 0)
  const [{ diaryId, skipped }] = result.imported
  const diary = server.diaries.get(diaryId)
  assert.equal(diary.coverStyle, 'LINEN'); assert.equal(diary.myMembership.isFavorite, true)
  const [first, second, third] = [...server.pages.values()]
  assert.equal(first.templateConfig.paperAppearance.font, 'nanum-gothic')
  assert.equal(first.title, '첫날')
  assert.deepEqual([third.canvasWidth, third.canvasHeight, third.gridVisible], [900, 700, true])
  // 사진은 서버 id 로 바뀌고 큰 GIF · 지운 사진 · 위젯은 빠진다
  assert.deepEqual(first.elements.map(e => e.elementType), ['TEXT', 'PHOTO'])
  assert.ok(server.media.has(first.elements[1].mediaFileId))
  assert.ok(second.elements.length > 1 && second.elements.every(e => e.elementType === 'STROKE'))
  const kinds = skipped.map(s => s.kind)
  for (const kind of ['media', 'element', 'cover', 'datedText', 'personalFont']) assert.ok(kinds.includes(kind), kind)
  assert.equal(skipped.find(s => s.kind === 'media').count, 2)
  assert.equal(progress.at(-1).done, progress.at(-1).total)
  // 이 기기에서 바로 열 수 있게 회원 문서를 서버 페이지로 채워 둔다
  const cached = JSON.parse(storage.disk.get(`dio:member:v1:${accountId}:doc:${diaryId}`))
  assert.equal(cached.memberAccountId, accountId); assert.equal(cached.id, diaryId)
  assert.deepEqual(cached.pages.map(p => p.id), [first.pageId, second.pageId, third.pageId])
  assert.deepEqual(cached.pages[0].objects.map(o => o.id), first.elements.map(e => e.elementId))
  assert.equal(cached.pages[0].paperAppearance.font, 'nanum-gothic')
  // 게스트 원본은 그대로, 가져옴 기록만 생긴다
  assert.ok(storage.disk.get(`${STORAGE_KEYS.doc}:diary-1`))
  assert.equal((await readGuestImportLedger(storage)).imports['diary-1'][accountId].diaryId, diaryId)
  assert.deepEqual((await listGuestImportCandidates(storage, accountId)).diaries, [])
  assert.deepEqual((await listGuestImportCandidates(storage, '8')).diaries.map(d => d.id), ['diary-1'])
  assert.equal(JSON.parse(storage.disk.get(guestImportJournalKey(accountId))).diaries['diary-1'], undefined)
})

test('중간에 끊겨도 다시 보내면 같은 생성 키 · 같은 요청으로 이어서 보내 서버에 두 번 생기지 않는다', async () => {
  const server = fakeServer(), storage = guestStorage()
  const { diaries } = await listGuestImportCandidates(storage, accountId)
  // 요소 전송 응답이 사라진 상황(서버에는 반영됨)
  let lost = false
  const realTransport = server.transport
  server.transport = async request => {
    const response = await realTransport(request)
    if (!lost && request.path.endsWith('/canvas-operations')) { lost = true; throw Object.assign(new Error('lost'), { status: 0, code: 'NETWORK_ERROR' }) }
    return response
  }
  const first = await importer(server, storage).run(diaries)
  assert.equal(first.failed.length, 1)
  assert.equal((await readGuestImportLedger(storage)).imports['diary-1'], undefined)
  // 앱을 다시 켠 것처럼 새 실행기로 이어서 보낸다
  const again = importer(server, storage, { createId: () => { throw new Error('계획은 다시 만들지 않아요') } })
  assert.deepEqual(await again.pendingIds(), ['diary-1'])
  const second = await again.run(diaries)
  assert.equal(second.failed.length, 0)
  assert.equal(server.diaries.size, 1)
  const ids = [...server.pages.values()].flatMap(p => p.elements.map(e => e.elementId))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(server.files.uploads.length, 1, '이미 올린 사진은 다시 올리지 않아요')
})

test('묶음이 거절되면 요소 하나씩 다시 보내 거절된 요소만 빠진다', async () => {
  const server = fakeServer(), storage = guestStorage()
  const real = server.transport
  server.transport = async request => {
    if (request.path.endsWith('/canvas-operations') && request.body.changes.creates.some(c => c.elementType === 'TEXT'))
      throw Object.assign(new Error('bad'), { status: 422, code: 'INVALID_CANVAS_ELEMENT' })
    return real(request)
  }
  const result = await importer(server, storage).run((await listGuestImportCandidates(storage, accountId)).diaries)
  assert.equal(result.failed.length, 0)
  const first = [...server.pages.values()][0]
  assert.deepEqual(first.elements.map(e => e.elementType), ['PHOTO'])
  assert.ok(result.imported[0].skipped.some(s => s.kind === 'element'))
})

test('로그인이 끝나면 나머지 다이어리도 보내지 않고 실패로 남긴다', async () => {
  const server = fakeServer(), storage = guestStorage()
  server.transport = async () => { throw Object.assign(new Error('auth'), { status: 401, code: 'UNAUTHENTICATED' }) }
  const result = await importer(server, storage).run([guestDiary, { ...guestDiary, id: 'diary-3' }])
  assert.deepEqual(result.failed.map(f => f.guestDiaryId), ['diary-1', 'diary-3'])
})

test('가져오지 않기를 고른 계정은 기록된다', async () => {
  const storage = guestStorage()
  await declineGuestImport(storage, accountId)
  assert.equal((await listGuestImportCandidates(storage, accountId)).declined, true)
  assert.equal((await listGuestImportCandidates(storage, '8')).declined, false)
})

test('업로드가 몰려 503 이면 기다렸다 다시 보낸다', async () => {
  let calls = 0
  const request = withUploadRetry(async () => { if (++calls < 3) throw Object.assign(new Error('busy'), { status: 503, code: 'MEDIA_UPLOAD_BUSY' }); return { ok: true } }, { wait: async () => {} })
  assert.deepEqual(await request('/media', {}), { ok: true })
  assert.equal(calls, 3)
})


test('펜 획을 나눌 때 마지막 점 하나가 남는 길이도 끝점까지 보존한다', () => {
 for(let length=4;length<=40;length++){
  const stroke={...longStroke,points:longStroke.points.slice(0,length)};
  const limit=Math.ceil(new TextEncoder().encode(JSON.stringify(stroke)).length/3);
  const parts=splitStroke(stroke,ids(),limit);
  assert.deepEqual(parts.at(-1).points.at(-1),stroke.points.at(-1),`length=${length}`);
  for(let i=1;i<parts.length;i++)assert.deepEqual(parts[i].points[0],parts[i-1].points.at(-1));
 }
});
test('동일 실행기의 가져오기를 연속 눌러도 다이어리를 한 번만 만든다', async () => {
 const server=fakeServer(),storage=guestStorage(),runner=importer(server,storage);
 const [a,b]=await Promise.all([runner.run([guestDiary]),runner.run([guestDiary])]);
 assert.equal(a.failed.length,0);assert.equal(b.failed.length,0);assert.equal(server.diaries.size,1);
});
test('완료 기록 뒤 진행 기록 저장이 실패해도 재시도 시 복제하지 않는다',async()=>{
 const server=fakeServer(),storage=guestStorage();const save=storage.setItem;let failed=false;
 storage.setItem=async(key,value)=>{
  if(!failed&&key===guestImportJournalKey(accountId)&&storage.disk.has('dio:diary:guest-imports:v1')&&Object.keys(JSON.parse(value).diaries).length===0){failed=true;throw Error('disk full');}
  return save(key,value);
 };
 const first=await importer(server,storage).run([guestDiary]);assert.equal(first.failed.length,1);
 const retry=await importer(server,storage).run([guestDiary]);assert.equal(retry.failed.length,0);assert.equal(server.diaries.size,1);
});
test('손상된 게스트 문서를 빈 문서로 대체해 서버에 올리지 않는다',async()=>{
 assert.throws(()=>planGuestDiary(guestDiary,{pages:[]},{createId:ids()}),/문서를 확인/);
 const server=fakeServer(),storage=guestStorage();await storage.setItem(`${STORAGE_KEYS.doc}:diary-1`,'{broken');
 const result=await importer(server,storage).run([guestDiary]);assert.equal(result.failed.length,1);assert.equal(server.diaries.size,0);
 assert.equal(await storage.getItem(`${STORAGE_KEYS.doc}:diary-1`),'{broken');
});
test('즐겨찾기에서 401을 받으면 완료 처리하거나 다음 다이어리를 보내지 않는다',async()=>{
 const server=fakeServer(),storage=guestStorage(),request=server.transport;
 server.transport=async r=>{if(r.path.endsWith('/membership'))throw Object.assign(Error('expired'),{status:401});return request(r);};
 const result=await importer(server,storage).run([guestDiary,{...guestDiary,id:'other'}]);assert.equal(result.imported.length,0);assert.equal(result.failed.length,2);assert.equal(server.diaries.size,1);
 assert.equal((await readGuestImportLedger(storage)).imports['diary-1'],undefined);
});
test('계정이 바뀌면 생성 결과는 진행 기록에 남기고 추가 전송을 중단한다',async()=>{
 const server=fakeServer(),storage=guestStorage(),request=server.transport;let active=true;
 server.transport=async r=>{const response=await request(r);if(r.path==='/member/diaries')active=false;return response;};
 const result=await importer(server,storage,{isActive:()=>active}).run([guestDiary]);assert.equal(result.failed[0].error.code,'STALE_ACCOUNT');
 assert.equal(server.calls.length,1);assert.equal((await readGuestImportLedger(storage)).imports['diary-1'],undefined);
 server.transport=request;const retry=await importer(server,storage).run([guestDiary]);assert.equal(retry.failed.length,0);assert.equal(server.diaries.size,1);
});


test('이미지 네트워크 실패에도 글씨와 다음 페이지 펜을 저장하고 재시도는 같은 다이어리를 완성한다', async () => {
  const storage = guestStorage(), server = fakeServer()
  const original = await storage.getItem(`${STORAGE_KEYS.doc}:diary-1`)
  const sendMedia = server.mediaRequest
  server.mediaRequest = async () => { throw Object.assign(Error('network'), { status: 0, code: 'NETWORK_ERROR' }) }
  const first = await importer(server, storage).run([guestDiary])
  assert.equal(first.failed.length, 1)
  assert.equal(first.imported.length, 0)
  assert.equal(server.diaries.size, 1)
  const saved = [...server.pages.values()].flatMap(page => page.elements)
  assert.ok(saved.some(row => row.elementType === 'TEXT'))
  assert.ok(saved.some(row => row.elementType === 'STROKE'))
  assert.ok(!(await readGuestImportLedger(storage)).imports?.[guestDiary.id]?.[accountId])
  assert.equal(await storage.getItem(`${STORAGE_KEYS.doc}:diary-1`), original)
  server.mediaRequest = sendMedia
  const second = await importer(server, storage, { createId: (() => { let n = 10000; return () => `00000000-0000-4000-8000-${hex(++n)}` })() }).run([guestDiary])
  assert.equal(second.failed.length, 0)
  assert.equal(second.imported.length, 1)
  assert.equal(server.diaries.size, 1)
  const complete = [...server.pages.values()].flatMap(page => page.elements)
  assert.equal(complete.filter(row => row.elementType === 'TEXT').length, 1)
  assert.equal(complete.filter(row => row.elementType === 'STROKE').length, saved.filter(row => row.elementType === 'STROKE').length)
  assert.ok(complete.some(row => row.elementType === 'PHOTO'))
})


test('빈 제목은 서버 전송용 기본 제목으로 대체하고 게스트 원본 제목은 유지한다', () => {
  for (const title of ['', '   ', null, undefined]) {
    const diary = { ...guestDiary, title }
    assert.equal(planGuestDiary(diary, guestDoc(), { createId: ids() }).create.title, '제목 없음')
    assert.equal(diary.title, title)
  }
})

test('영구 오류 사진 뒤 네트워크 오류가 반복돼도 누락 사진은 완료 시 한 번만 집계한다', async () => {
  const storage = guestStorage(), server = fakeServer(), doc = guestDoc()
  const objects = doc.pages[0].objects
  doc.pages[0].objects = [objects[2], objects[1], objects[3], objects[0]]
  await storage.setItem(`${STORAGE_KEYS.doc}:diary-1`, JSON.stringify(doc))
  const upload = server.mediaRequest
  let failures = 2
  server.mediaRequest = async (...args) => {
    if (failures-- > 0) throw Object.assign(Error('network'), { status: 0, code: 'NETWORK_ERROR' })
    return upload(...args)
  }
  const engine = importer(server, storage)
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await engine.run([guestDiary])).failed.length, 1)
    const entry = JSON.parse(await storage.getItem(guestImportJournalKey(accountId))).diaries[guestDiary.id]
    assert.equal(entry.skipped.filter(row => row.kind === 'media').length, 0)
  }
  const result = await importer(server, storage).run([guestDiary])
  assert.equal(result.failed.length, 0)
  assert.equal(result.imported[0].skipped.find(row => row.kind === 'media').count, 2)
  assert.equal(server.diaries.size, 1)
})

for (const status of [400, 413, 415, 422]) {
  test(`생성 입력 ${status} 거절은 진행 기록을 정리하고 다음 수동 시도에서 새 계획을 만든다`, async () => {
    const storage = guestStorage(), server = fakeServer(), send = server.transport, keys = []
    const original = await storage.getItem(`${STORAGE_KEYS.doc}:diary-1`)
    let rejected = true
    server.transport = async request => {
      if (request.path === '/member/diaries') {
        keys.push(request.requestId)
        if (rejected) throw Object.assign(Error('invalid'), { status, code: 'INVALID_DIARY_CREATION' })
      }
      return send(request)
    }
    const engine = importer(server, storage)
    assert.equal((await engine.run([guestDiary])).failed[0].error.status, status)
    assert.deepEqual(await engine.pendingIds(), [])
    assert.deepEqual(await importer(server, storage).pendingIds(), [])
    assert.equal(server.diaries.size, 0)
    await declineGuestImport(storage, accountId)
    assert.equal((await listGuestImportCandidates(storage, accountId)).declined, true)
    rejected = false
    assert.equal((await engine.run([guestDiary])).imported.length, 1)
    assert.notEqual(keys[0], keys[1])
    assert.equal(await storage.getItem(`${STORAGE_KEYS.doc}:diary-1`), original)
  })
}

for (const [status, code] of [[0, 'NETWORK_ERROR'], [401, 'INVALID_TOKEN'], [403, 'FORBIDDEN'], [404, 'NOT_FOUND'], [408, 'TIMEOUT'], [409, 'IDEMPOTENCY_KEY_EXPIRED'], [429, 'RATE_LIMITED'], [500, 'SERVER_ERROR'], [503, 'UNAVAILABLE'], [400, 'INVALID_IDEMPOTENCY_KEY']]) {
  test(`생성 ${status}/${code}는 기존 계획과 요청 키를 유지한다`, async () => {
    const storage = guestStorage(), server = fakeServer()
    server.transport = async () => { throw Object.assign(Error(code), { status, code }) }
    const engine = importer(server, storage)
    await engine.run([guestDiary])
    const first = JSON.parse(await storage.getItem(guestImportJournalKey(accountId))).diaries[guestDiary.id]
    await engine.run([guestDiary])
    const second = JSON.parse(await storage.getItem(guestImportJournalKey(accountId))).diaries[guestDiary.id]
    assert.deepEqual(second, first)
    assert.deepEqual(await engine.pendingIds(), [guestDiary.id])
  })
}

test('서버 생성 성공 후 응답이 유실돼도 같은 생성 키로 기존 다이어리를 이어받는다', async () => {
  const storage = guestStorage(), server = fakeServer(), send = server.transport, keys = []
  let lost = true
  server.transport = async request => {
    const result = await send(request)
    if (request.path === '/member/diaries') {
      keys.push(request.requestId)
      if (lost) { lost = false; throw Object.assign(Error('response lost'), { status: 0, code: 'NETWORK_ERROR' }) }
    }
    return result
  }
  assert.equal((await importer(server, storage).run([guestDiary])).failed.length, 1)
  assert.equal(server.diaries.size, 1)
  assert.equal((await importer(server, storage).run([guestDiary])).imported.length, 1)
  assert.equal(keys[0], keys[1])
  assert.equal(server.diaries.size, 1)
})
