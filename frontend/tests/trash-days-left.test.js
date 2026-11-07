import test from 'node:test'
import assert from 'node:assert/strict'
import { trashDaysLeft, trashStatus, TRASH_RETENTION_MS } from '../src/diary/utils/trashRetention.js'

const DAY = 24 * 60 * 60 * 1000

test('막 휴지통에 넣은 다이어리는 기기 시계가 서버보다 조금 늦어도 31일이 아니라 30일로 보인다', () => {
  const deletedAt = Date.parse('2026-11-07T10:00:00Z')
  const deadline = deletedAt + TRASH_RETENTION_MS
  assert.equal(trashDaysLeft(deadline, deletedAt - 1500), 30)
  assert.equal(trashDaysLeft(deadline, deletedAt), 30)
  assert.equal(trashDaysLeft(deadline, deletedAt + DAY + 1), 29)
  assert.equal(trashDaysLeft(deadline, deadline - 1), 1)
  assert.equal(trashDaysLeft(deadline, deadline + DAY), 0)
  assert.equal(trashStatus({ trashedAt: new Date(deletedAt).toISOString() }, deletedAt - 1500), '30일 후 영구 삭제')
})
