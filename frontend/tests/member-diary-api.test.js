import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { serverTemplateReference } from '../src/editor/templates/serverCatalog.js'
import { createHttpTransport } from '../src/diary/services/diaryApi.js'

const id = '11111111-2222-3333-4444-555555555555'
const page = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
const stamp = '2026-10-27T00:00:00.123456Z'
const row = { diaryId: id, diaryTitle: 'member', coverColor: '#123456', coverStyle: 'PLAIN', visibility: 'PRIVATE', createdAt: stamp, updatedAt: stamp, canEdit: true, version: '1', myRole: 'OWNER', myMembership: { isFavorite: false }, permissions: {canEditMetadata:true,canEditCanvas:true,canTrash:true,canRestore:false,canPermanentlyDelete:false} }
const input = { title: 'member', color: '#123456', initialPages: [{ templateId: '2026-cover-landscape',
  ...serverTemplateReference('2026-cover-landscape', '1.0.0', 'landscape'), templateConfig: { width: 1024, height: 768 } }] }

test('검색 기능 503은 상태와 코드를 유지하고 자동 재시도하지 않는다', async () => {
  let calls = 0
  const api = createMemberDiaryApi(createHttpTransport({
    baseUrl: 'http://localhost/api/v1', getAccessToken: async () => 'test-only',
    fetchImpl: async () => {
      calls++
      return new Response(JSON.stringify({ status: 503, code: 'DIARY_LIST_UNAVAILABLE', detail: '잠시 후 다시 확인해 주세요.' }),
        { status: 503, headers: { 'Content-Type': 'application/problem+json' } })
    },
  }))
  await assert.rejects(api.list({ q: 'É' }), { status: 503, code: 'DIARY_LIST_UNAVAILABLE' })
  assert.equal(calls, 1)
})

test('회원 목록은 독립 경로·불투명 커서와 서버 페이지 수·공유 권한을 보존한다', async () => {
  let call;const api=createMemberDiaryApi(async request=>{call=request;return {items:[{diary:row,pageCount:19,shared:true}],nextCursor:'opaque',hasNext:true}})
  const result=await api.list({cursor:'previous',q:'기록',sort:'pages',limit:20,filter:'all',favorite:false})
  assert.equal(call.path,'/member/diaries');assert.deepEqual(call.query,{cursor:'previous',q:'기록',sort:'pages',limit:20,filter:'all',favorite:false})
  assert.equal(result.items[0].pageCount,19);assert.equal(result.items[0].isShared,true);assert.equal(result.nextCursor,'opaque')
  for(const body of [{items:[{diary:row,pageCount:-1,shared:false}],hasNext:false,nextCursor:null},
    {items:[],hasNext:true,nextCursor:null},{items:[{diary:row,pageCount:1,shared:false},{diary:row,pageCount:1,shared:false}],hasNext:false,nextCursor:null}]) {
    await assert.rejects(createMemberDiaryApi(async()=>body).list(),{code:'INVALID_RESPONSE'})
  }
})

test('회원 생성·상세·수정 경로와 코드/버전·미세초 수정 토큰을 보존한다', async () => {
  const calls = []
  const api = createMemberDiaryApi(async call => { calls.push(call); return { diary: row, firstPageId: page, pageIds: [page] } })
  const result = await api.create(input, { requestId: 'member-create-key' })
  assert.equal(result.firstPageId, page)
  assert.equal(calls[0].path, '/member/diaries')
  assert.deepEqual(calls[0].body.initialPages, [{ templateCode: input.initialPages[0].templateCode, templateVersion: '1.0.0', templateConfig: { width: 1024, height: 768 } }])
  assert.equal(calls[0].body.initialPages[0].templateId, undefined)
  await api.get(id)
  await api.update(id, { title: 'rename', expectedVersion: result.version })
  assert.equal(calls[1].path, '/member/diaries/' + id)
  assert.deepEqual(calls[2].body, { expectedVersion: '1', diaryTitle: 'rename' })
})

test('회원 생성과 수정의 속지 글꼴을 서버에 보내고 이전 생성 대기 요청 형식을 유지한다', async () => {
  const appearance = { backgroundColor: '#FFFFFF', layoutColor: '#292929', font: 'gowun-dodum' }
  const calls = []
  const api = createMemberDiaryApi(async request => {
    calls.push(request)
    return { diary: { ...row, paperAppearance: appearance }, firstPageId: page, pageIds: [page] }
  })
  const selected = [{ ...input.initialPages[0], templateConfig: { ...input.initialPages[0].templateConfig, paperAppearance: appearance } }]
  const created = await api.create({ ...input, initialPages: selected, defaultPaperAppearance: appearance }, { requestId: 'member-paper-key' })
  assert.deepEqual(calls[0].body.paperAppearance, appearance)
  assert.deepEqual(calls[0].body.initialPages[0].templateConfig.paperAppearance, appearance)
  assert.deepEqual(created.paperAppearance, appearance)
  await api.create({ ...input, paperAppearance: { backgroundColor: '#FFFFFF' } }, { requestId: 'legacy-paper-key' })
  assert.equal(Object.hasOwn(calls[1].body, 'paperAppearance'), false)
  await api.update(id, { expectedVersion: '1', paperAppearance: appearance, paperAppearanceScope: 'new' })
  assert.deepEqual(calls[2].body, { expectedVersion: '1', paperAppearance: appearance, paperAppearanceScope: 'new' })
})

test('키·수정 기준 누락·다른 ID·잘못된 페이지 응답을 거부한다', async () => {
  let calls = 0
  const api = createMemberDiaryApi(async () => { calls++; return { diary: row, firstPageId: page, pageIds: [page] } })
  await assert.rejects(api.create(input), { code: 'INVALID_IDEMPOTENCY_KEY' })
  await assert.rejects(api.update(id, { title: 'rename' }), { code: 'INVALID_REQUEST' })
  assert.equal(calls, 0)
  await assert.rejects(api.get('another'), { code: 'INVALID_RESPONSE' })
  for (const response of [{ diary: row, firstPageId: 'wrong', pageIds: [page] }, { diary: row, firstPageId: page, pageIds: [page, page] },
    { diary: { ...row, canEdit: undefined }, firstPageId: page, pageIds: [page] }]) {
    await assert.rejects(createMemberDiaryApi(async () => response).create(input, { requestId: 'member-create-key' }), { code: 'INVALID_RESPONSE' })
  }
})

test('응답 유실 후 재시도도 같은 헤더·본문을 보내고 키 충돌을 새 키로 자동 전환하지 않는다', async () => {
  const calls = []
  const transport = createHttpTransport({ baseUrl: 'http://localhost/api/v1', getAccessToken: async () => 'test-only',
    fetchImpl: async (url, options) => {
      calls.push(options)
      if (calls.length === 1) throw new Error('response lost')
      return new Response(JSON.stringify({ diary: row, firstPageId: page, pageIds: [page] }), { status: 201 })
    } })
  const api = createMemberDiaryApi(transport), options = { requestId: 'network-retry-key' }
  await assert.rejects(api.create(input, options), { code: 'NETWORK_ERROR' })
  assert.equal((await api.create(input, options)).id, id)
  assert.equal(calls[0].headers['Idempotency-Key'], 'network-retry-key')
  assert.equal(calls[1].headers['Idempotency-Key'], calls[0].headers['Idempotency-Key'])
  assert.equal(calls[1].body, calls[0].body)
  const conflict = createMemberDiaryApi(async () => { throw Object.assign(new Error('conflict'), { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 }) })
  await assert.rejects(conflict.create(input, options), { code: 'IDEMPOTENCY_KEY_REUSED', status: 409 })
})


test('문자열 BIGINT·역할·권한 누락과 공백 제목은 fail closed이며 오버플로 버전은 전송하지 않는다', async () => {
  for(const bad of [{...row,version:1},{...row,version:'9223372036854775808'},{...row,myRole:'VIEWER'},{...row,permissions:null},{...row,diaryTitle:'\u00a0\ufeff'}])
    await assert.rejects(createMemberDiaryApi(async()=>({diary:bad})).get(id),{code:'INVALID_RESPONSE'})
  let sent=0;const api=createMemberDiaryApi(async()=>{sent++;return {diary:row}})
  for(const expectedVersion of [1,'0','01','9223372036854775808']) await assert.rejects(api.update(id,{title:'x',expectedVersion}),{code:'INVALID_REQUEST'})
  assert.equal(sent,0)
})
