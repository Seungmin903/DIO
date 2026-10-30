import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createMemberDiaryApi } from '../src/diary/services/memberDiaryApi.js'
import { createHttpTransport } from '../src/diary/services/diaryApi.js'

// backend의 MemberDiaryHttpTests를 먼저 실행한다. 수기 고정 응답으로 대체하지 않는다.
const receipt = JSON.parse(await readFile(new URL('../../backend/build/contracts/member-diary-http.json', import.meta.url), 'utf8'))
test('실제 Spring 생성·조회·수정 응답을 회원 프런트 어댑터가 읽고 요청 계약을 유지한다', async () => {
  const calls = [], responses = [receipt.created, receipt.detail, receipt.updated]
  const api = createMemberDiaryApi(async request => { calls.push(request); return responses.shift() })
  const source = receipt.createRequest
  const created = await api.create({ title: source.diaryTitle, color: source.coverColor, coverStyle: source.coverStyle,
    initialPages: source.initialPages.map(p => ({ ...p, templateId: p.templateCode })) }, { requestId: receipt.idempotencyKey })
  assert.deepEqual(calls[0].body, source)
  assert.deepEqual(created.pageIds, receipt.created.pageIds)
  assert.equal(created.canEdit, true)
  await api.get(created.id)
  const updated = await api.update(created.id, { title: receipt.updateRequest.diaryTitle, expectedVersion: created.version })
  assert.deepEqual(calls[2].body, receipt.updateRequest)
  assert.equal(updated.updatedAt, receipt.updated.diary.updatedAt)
  assert.equal(updated.title, 'renamed')
  const paths = receipt.openapi.paths
  assert.ok(paths['/api/v1' + calls[0].path].post)
  assert.ok(paths['/api/v1/member/diaries/{diaryId}'].get)
  assert.ok(paths['/api/v1/member/diaries/{diaryId}'].patch)
})

test('실제 Spring 400·401·403·404·409 응답의 상태와 오류 코드를 HTTP 경계에서 보존한다', async () => {
  for (const name of ['invalid', 'unauthorized', 'forbidden', 'missing', 'conflict', 'idempotencyConflict']) {
    const error = receipt[name]
    const transport = createHttpTransport({ baseUrl: 'http://localhost/api/v1', getAccessToken: async () => 'test-only',
      fetchImpl: async () => new Response(JSON.stringify(error), { status: error.status, headers: { 'Content-Type': 'application/problem+json' } }) })
    await assert.rejects(transport({ path: '/member/diaries/example' }), { code: error.code, status: error.status })
    for (const field of receipt.openapi.components.schemas.MemberDiaryProblem.required) assert.ok(field in error)
  }
})

test('실제 Spring의 같은 키 재응답도 최초 페이지 ID·응답을 그대로 유지한다', async () => {
  const calls = [], responses = [receipt.created, receipt.replayed]
  const api = createMemberDiaryApi(async request => { calls.push(request); return responses.shift() })
  const source = receipt.createRequest
  const input = { title: source.diaryTitle, color: source.coverColor, coverStyle: source.coverStyle,
    initialPages: source.initialPages.map(p => ({ ...p, templateId: p.templateCode })) }
  const options = { requestId: receipt.idempotencyKey }
  const first = await api.create(input, options), replay = await api.create(input, options)
  assert.deepEqual(replay, first)
  assert.equal(calls[0].requestId, calls[1].requestId)
  assert.deepEqual(calls[0].body, calls[1].body)
})
