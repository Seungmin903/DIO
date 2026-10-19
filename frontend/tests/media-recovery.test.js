import test from 'node:test'
import assert from 'node:assert/strict'
import { createMediaRegistry } from '../src/editor/utils/mediaReferences.js'
import { validateStoredOriginal, mediaFailureMessage } from '../src/editor/utils/mediaRecovery.js'
import { storageError } from '../src/editor/utils/mediaPolicy.js'
import { verifyDisplay } from '../src/editor/utils/mediaProcessing.web.js'

function fixture() {
  const pending = new Map(), released = []
  let timerId = 0, reads = 0
  const registry = createMediaRegistry({
    load: async () => ({ uri: `blob:${++reads}` }),
    release: (uri) => released.push(uri),
    schedule: (fn) => { pending.set(++timerId, fn); return timerId },
    cancel: (id) => pending.delete(id),
  })
  return { registry, released, flush: () => { const jobs = [...pending.values()]; pending.clear(); jobs.forEach((fn) => fn()) } }
}

test('같은 파일의 마지막 화면 참조가 끝난 뒤만 URL을 해제하고 다음 조회로 복원한다', async () => {
  const { registry, released, flush } = fixture()
  const first = registry.retain('shared'), second = registry.retain('shared')
  await registry.ensure('shared')
  first(); first(); flush()
  assert.deepEqual(released, [])
  assert.equal(registry.get('shared').uri, 'blob:1')
  second(); flush()
  assert.deepEqual(released, ['blob:1'])
  assert.equal(registry.get('shared'), undefined)
  await registry.ensure('shared')
  assert.equal(registry.get('shared').uri, 'blob:2')
  // 저장소 삭제 함수는 레지스트리에 전달하지도 않는다.
})

test('페이지 왕복으로 다시 구독하면 예약된 해제를 취소하고 미사용 사전 조회는 정리한다', async () => {
  const { registry, released, flush } = fixture()
  await registry.ensure('one')
  const end = registry.retain('one')
  flush(); assert.deepEqual(released, [])
  end()
  const again = registry.retain('one')
  flush(); assert.deepEqual(released, [])
  again(); flush(); assert.deepEqual(released, ['blob:1'])
  await registry.ensure('preload'); flush()
  assert.deepEqual(released, ['blob:1', 'blob:2'])
})

test('표시 실패를 기록하고 재조회 성공 시 오류를 지운다', async () => {
  const { registry, released } = fixture()
  registry.retain('bad')
  await registry.ensure('bad')
  registry.fail('bad', { code: 'MEDIA_CORRUPT' })
  assert.equal(registry.failures()[0].id, 'bad')
  await registry.ensure('bad')
  assert.deepEqual(registry.failures(), [])
  assert.deepEqual(released, ['blob:1'])
})

test('원본 시그니처·크기 불일치와 공간 부족·누락 안내를 구분한다', () => {
  const header = new TextEncoder().encode('GIF89a-data')
  validateStoredOriginal(header, header.length, { mimeType: 'image/gif', fileSize: header.length })
  assert.throws(() => validateStoredOriginal(header, 999, { fileSize: 10 }), { code: 'MEDIA_CORRUPT' })
  assert.throws(() => validateStoredOriginal(new Uint8Array([0]), 1, null), { code: 'MEDIA_CORRUPT' })
  const full = storageError(new DOMException('full', 'QuotaExceededError'))
  assert.equal(full.code, 'STORAGE_FULL')
  assert.match(mediaFailureMessage(full), /저장 공간/)
  assert.match(mediaFailureMessage({ code: 'MEDIA_NOT_FOUND' }), /찾을 수 없/)
  assert.match(mediaFailureMessage({ code: 'MEDIA_CORRUPT' }), /손상/)
})

test('표시본 디코딩 실패는 손상 오류이며 임시 검증 URL도 해제한다', async (t) => {
  const previous = globalThis.Image
  globalThis.Image = class { set src(value) { if (value) queueMicrotask(() => this.onerror?.(new Error('decode failed'))) } }
  t.after(() => { globalThis.Image = previous })
  const revoke = URL.revokeObjectURL
  let released = 0
  URL.revokeObjectURL = (uri) => { released++; revoke(uri) }
  t.after(() => { URL.revokeObjectURL = revoke })
  await assert.rejects(verifyDisplay(new Blob(['corrupt'])), { code: 'MEDIA_CORRUPT' })
  assert.equal(released, 1)
})
