import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { expo } = JSON.parse(readFileSync(new URL('../app.json', import.meta.url), 'utf8'))
const blocked = expo.android.blockedPermissions

test('사진 읽기 권한은 앱에 넣지 않는다', () => {
  assert.ok(blocked.includes('android.permission.READ_EXTERNAL_STORAGE'))
  assert.ok(blocked.includes('android.permission.READ_MEDIA_VISUAL_USER_SELECTED'))
  const plugin = expo.plugins.find((item) => Array.isArray(item) && item[0] === 'expo-media-library')
  assert.deepEqual(plugin[1].granularPermissions, [])
})

test('쓰지 않는 카메라 · 마이크 권한은 앱에 넣지 않는다', () => {
  assert.ok(blocked.includes('android.permission.CAMERA'))
  assert.ok(blocked.includes('android.permission.RECORD_AUDIO'))
  const plugin = expo.plugins.find((item) => Array.isArray(item) && item[0] === 'expo-image-picker')
  assert.equal(plugin[1].cameraPermission, false)
  assert.equal(plugin[1].microphonePermission, false)
})

test('Android 12 이하의 사진 저장에 필요한 쓰기 권한은 막지 않는다', () => {
  // expo-media-library 는 Android 12 이하에서 이 권한이 없으면 사진첩 저장을 거부한다.
  assert.equal(blocked.includes('android.permission.WRITE_EXTERNAL_STORAGE'), false)
})
