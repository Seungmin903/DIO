import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

test('683: 세로 태블릿도 폰처럼 가장 최근 쪽 한 면만 — 걸친 면 · 왼쪽 페이드(637) 없음', () => {
  const shelf = read('../src/diary/components/OpenBookShelf.js')
  assert.doesNotMatch(shelf, /HangFade|hangFade|react-native-svg/)
  assert.match(shelf, /const single = compact \|\| upright;/)
  assert.match(shelf, /compact=\{single\} motion=\{motions\[at\]\} onPress=\{pressBook\}/)
  assert.doesNotMatch(shelf, /peek = null|peek == null/)
  // 높이 맞춤 값은 그대로
  assert.match(shelf, /const SWIPE_CENTER_UP = 79;/)
  assert.match(shelf, /const PHONE_SWIPE_CENTER_UP = 49;/)
})

test('636: 프로필 수정 창의 표지는 보관함 다이어리의 방향 · 표지 설정을 이어 받는다', () => {
  const hub = read('../src/sharing/SharingHub.js')
  assert.match(hub, /cover: diary\.cover \?\? request\.diary\.cover, pageSize: request\.diary\.pageSize, templateConfig: request\.diary\.templateConfig/)
})
