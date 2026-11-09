import test from 'node:test'
import assert from 'node:assert/strict'
import { createPushIssueMemory, pushIssueOf } from '../src/notifications/pushIssue.js'

test('S15P31F106-719: 원래 계정이 필요한 오류는 계정 · 설치 · 원래 계정으로 같은 상태를 가르고, 그 밖의 409 충돌과 문구를 구분한다', () => {
  const original = Object.assign(new Error('PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT'), { installationId: 'inst-1', registrationUser: '7' })
  const issue = pushIssueOf(original, '8')
  assert.equal(issue.kind, 'original-account')
  assert.match(issue.message, /이전 계정/)
  assert.equal(issue.signature, 'original-account:8:inst-1:7')
  assert.notEqual(pushIssueOf(original, '9').signature, issue.signature, '다른 계정이면 다른 상태')
  assert.equal(pushIssueOf(original, '8').signature, issue.signature, '같은 상태는 같은 열쇠')

  const conflict = pushIssueOf(Object.assign(new Error('PUSH_INSTALLATION_CONFLICT'), { status: 409 }), '8')
  assert.equal(conflict.kind, 'conflict')
  assert.doesNotMatch(conflict.message, /이전 계정/, '원래 계정 문구를 쓰지 않는다')
  assert.equal(conflict.signature, 'conflict:8:PUSH_INSTALLATION_CONFLICT')
})

test('조정자가 스스로 복구하는 결합 충돌과 일시적인 오류는 문제로 보이지 않는다', () => {
  assert.equal(pushIssueOf(Object.assign(new Error('PUSH_BINDING_CONFLICT'), { status: 409 }), '8'), null)
  assert.equal(pushIssueOf(Object.assign(new Error('PUSH_INSTALLATION_CONFLICT'), { status: 500 }), '8'), null, '409 가 아니면 충돌이 아니다')
  assert.equal(pushIssueOf(new Error('NETWORK'), '8'), null)
  assert.equal(pushIssueOf(null, '8'), null)
})

test('같은 상태의 팝업은 기기에 기록해 한 번만, 상태가 바뀌면 다시 알린다', async () => {
  let stored = null
  const memory = createPushIssueMemory({ load: async () => stored, save: async value => { stored = value } })
  const issue = pushIssueOf(Object.assign(new Error('PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT'), { installationId: 'inst-1', registrationUser: '7' }), '8')
  assert.equal(await memory.notifyOnce(issue), true)
  assert.equal(stored, issue.signature)
  assert.equal(await memory.notifyOnce(issue), false, '앱을 다시 켜도(같은 기록) 다시 띄우지 않는다')
  const other = pushIssueOf(Object.assign(new Error('PUSH_TOKEN_CONFLICT'), { status: 409 }), '8')
  assert.equal(await memory.notifyOnce(other), true, '다른 상태는 알린다')
  assert.equal(await memory.notifyOnce(issue), true, '이전 상태로 돌아와도 마지막 기록과 다르면 알린다')
})
