import test from 'node:test'
import assert from 'node:assert/strict'
import { createServerNotificationApi } from '../src/notifications/serverNotificationApi.js'
import { notificationCountLabel } from '../src/notifications/notificationCount.js'

test('이메일 초대는 유효한 미읽음일 때 빨간 점을 켜고 취소·수락 뒤 끈다', async () => {
 let response = { unreadCount: 1, actionableUnreadCount: 1 }
 const api = createServerNotificationApi(async () => response)
 assert.deepEqual(notificationCountLabel(await api.count()), { value: 1, label: '새 초대', showDot: true })
 response = { unreadCount: 1, actionableUnreadCount: 0 }
 assert.equal(notificationCountLabel(await api.count()).showDot, false)
 response = { unreadCount: 1 }
 assert.equal(notificationCountLabel(await api.count()).showDot, false)
 response = { unreadCount: 1, actionableUnreadCount: -1 }
 await assert.rejects(api.count())
})
