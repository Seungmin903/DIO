import test from 'node:test'
import assert from 'node:assert/strict'
import { createStrokeThumbnailCache } from '../src/editor/utils/strokeThumbnailCache.js'

test('썸네일은 동일 불변 객체·순서·페이지 크기에서만 재사용한다', () => {
  const cache = createStrokeThumbnailCache(), a = { id: 'a' }, b = { id: 'b' }
  const batch = { width: 1188, height: 840, objects: [a, b] }, image = { width: 12, height: 10 }
  const before = JSON.stringify(batch)
  const entry = cache.put(batch, image, 120)
  assert.equal(cache.get([a, b], 0, 1188, 840), entry)
  for (const objects of [[a, { ...b }], [b, a], [a]]) assert.equal(cache.get(objects, 0, 1188, 840), null)
  assert.equal(cache.get([a, b], 0, 840, 1188), null)
  assert.equal(cache.get([{}, a, b], 1, 1188, 840), entry)
  assert.equal(JSON.stringify(batch), before)
})
test('썸네일 캐시는 픽셀/개수 한도를 지키며 현재 사용 중인 이미지를 비우지 않는다', () => {
  const cache = createStrokeThumbnailCache({ maxPixels: 100, maxEntries: 2 })
  const a = {}, b = {}, c = {}, image = { width: 10, height: 4 }
  const batch = object => ({ width: 1188, height: 840, objects: [object] })
  const first = cache.put(batch(a), image, 40)
  cache.put(batch(b), {}, 40); cache.get([a], 0, 1188, 840); cache.put(batch(c), {}, 40)
  assert.equal(cache.get([b], 0, 1188, 840), null)
  assert.equal(cache.stats().pixels, 80)
  cache.clear()
  assert.equal(first.image.width, 10)
  assert.equal(cache.stats().pixels, 0)
  assert.equal(cache.put(batch(a), {}, 101), null)
})
