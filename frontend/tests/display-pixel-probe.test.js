import test from 'node:test'
import assert from 'node:assert/strict'
import { probeDisplayPixels } from '../qa/display-pixel-probe.js'

test('빈 캐시와 읽기 실패를 구분하고 픽셀 데이터는 반환하지 않는다', () => {
  const canvas = data => ({ width: 1, height: 1, getContext: () => ({ getImageData: () => ({ data }) }) })
  const root = { querySelectorAll: selector => selector.startsWith('canvas')
    ? [canvas(new Uint8Array([0, 0, 0, 255])), canvas(new Uint8Array(4)), { width: 0, height: 0, getContext: () => null }]
    : selector.includes('preview') ? [{}] : [{}, {}] }
  const result = probeDisplayPixels(root)
  assert.equal(result.cachedBatches, 3)
  assert.equal(result.emptyCachedBatches, 1)
  assert.equal(result.unreadableCachedBatches, 1)
  assert.equal(result.pendingPreviews, 1)
  assert.equal(result.completedVectorNodes, 2)
  assert.equal('data' in result, false)
})
