import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync(new URL('../App.js', import.meta.url), 'utf8')

test('회원 다이어리는 편집기에서 보관함으로 돌아올 때 서버 목록(카드 페이지 수)을 다시 받는다', () => {
  assert.match(app, /previousPage\.current === 'editor' && page === 'library'/)
  assert.match(app, /if \(left && member\) Promise\.resolve\(\)\.then\(\(\) => diaryState\.store\.reload\(\)\)/)
})

test('게스트 보관함 요약은 보관함으로 돌아올 때마다 저장 문서에서 다시 읽는다', () => {
  const hook = readFileSync(new URL('../src/diary/hooks/useLibraryMetadata.js', import.meta.url), 'utf8')
  assert.match(hook, /\[diaries, page, server\]/)
  assert.match(hook, /if \(page !== 'library'\) return undefined/)
})
