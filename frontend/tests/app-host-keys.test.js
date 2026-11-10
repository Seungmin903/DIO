import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8')

test('App 의 형제 호스트(스티커 보관함 동기화 · 게스트 다이어리 옮기기)는 key 가 서로 다르다 — 같은 key 경고(4:4:1) 방지', () => {
  const keys = [...app.matchAll(/<(StickerLibrarySyncHost|GuestImportHost) key=\{`([^`]+)`\}/g)].map(match => [match[1], match[2]])
  assert.equal(keys.length, 2)
  assert.notEqual(keys[0][1], keys[1][1])
  assert.deepEqual(Object.fromEntries(keys), {
    StickerLibrarySyncHost: 'sticker-sync:${previewUser.userId}:${authService.getSessionKey()}',
    GuestImportHost: 'guest-import:${previewUser.userId}:${authService.getSessionKey()}',
  })
})
