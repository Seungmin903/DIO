import test from 'node:test'
import assert from 'node:assert/strict'
import { createMemberPagePosition } from '../src/sharing/memberPagePosition.js'

const diaryId = '10000000-0000-4000-8000-000000000001'
const pages = [1, 2, 3].map(n => `20000000-0000-4000-8000-00000000000${n}`)
test('membership에 위치만 보내고 같은 페이지는 다시 저장하지 않는다', async () => {
  const calls = []
  const position = createMemberPagePosition({ diaryId, transport: async request => calls.push(request) })
  await position.visit(pages[0]); await position.visit(pages[0])
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(calls[0].path, `/diaries/${diaryId}/membership`)
  assert.deepEqual(calls[0].body, { lastOpenedPageId: pages[0] })
  position.dispose()
})
test('빠른 이동은 순서대로 처리하고 대기 중간 페이지를 합친다', async () => {
  const calls = []; let release
  const position = createMemberPagePosition({ diaryId, transport: async request => {
    calls.push(request.body.lastOpenedPageId)
    if (calls.length === 1) await new Promise(resolve => { release = resolve })
  } })
  const job = position.visit(pages[0])
  position.visit(pages[1]); position.visit(pages[2]); release(); await job
  assert.deepEqual(calls, [pages[0], pages[2]])
  position.dispose()
})
test('실패한 위치는 같은 페이지 재시도에서 다시 저장한다', async () => {
  let count = 0
  const position = createMemberPagePosition({ diaryId, transport: async () => { if (++count === 1) throw Error('offline') } })
  assert.equal(await position.visit(pages[0]), false)
  assert.equal(await position.visit(pages[0]), true)
  assert.equal(count, 2)
  position.dispose()
})
test('계정 변경 뒤 대기 중인 위치를 보내지 않는다', async () => {
  let active = true, release; const calls = []
  const position = createMemberPagePosition({ diaryId, isActive: () => active, transport: async request => {
    calls.push(request); await new Promise(resolve => { release = resolve })
  } })
  const job = position.visit(pages[0]); position.visit(pages[1]); active = false; release(); await job
  await position.visit(pages[2]); assert.equal(calls.length, 1)
  position.dispose()
})
test('잘못된 페이지 ID는 보내지 않고 종료 시 진행 요청을 취소한다', async () => {
  let signal
  const position = createMemberPagePosition({ diaryId, transport: request => {
    signal = request.signal
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted'))))
  } })
  assert.equal(await position.visit('local-page'), false)
  assert.equal(signal, undefined)
  const job = position.visit(pages[0]); position.dispose(); await job
  assert.equal(signal.aborted, true)
  assert.equal(await position.visit(pages[1]), false)
})
