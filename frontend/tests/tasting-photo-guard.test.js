import test from 'node:test'
import assert from 'node:assert/strict'
import { tastingPhotoInterruption } from '../src/editor/templates/tastingPhotoGuard.js'

const page = { id: 'page-1', backgroundAssetId: 'remote-tasting-note-v2-portrait', objects: [] }
const check = (crop, current = page) => tastingPhotoInterruption(crop, current, page.id, page.backgroundAssetId)

test('사진 자르기 취소는 조용히 중단하고 정상 선택은 계속한다', () => {
  assert.deepEqual(check(null), { reason: 'cancelled', message: null })
  assert.equal(check({ crop: {} }), null)
})

test('자르기 중 페이지나 속지가 바뀌면 각각 다시 선택하도록 안내한다', () => {
  const crop = { crop: {} }
  assert.match(check(crop, { ...page, id: 'page-2' }).message, /페이지가 바뀌어/)
  assert.match(check(crop, { ...page, backgroundAssetId: 'remote-tasting-note-v2-landscape' }).message, /속지가 바뀌어/)
})

test('자르기 중 다른 사진이 들어오면 선점을 안내하고 일반 캔버스 요소는 허용한다', () => {
  const crop = { crop: {} }
  assert.match(check(crop, { ...page, objects: [{ type: 'photo', tastingPhoto: true }] }).message, /사진 칸에 다른 사진이 먼저/)
  assert.equal(check(crop, { ...page, objects: [{ type: 'photo' }, { type: 'text' }] }), null)
})

test('페이지 이동과 사진 선점이 동시에 일어나도 현재 페이지 기준으로 안내한다', () => {
  const interrupted = check({}, { ...page, id: 'page-2', objects: [{ tastingPhoto: true }] })
  assert.equal(interrupted.reason, 'page-changed')
  assert.equal(check(null, { ...page, id: 'page-2' }).reason, 'cancelled')
})
