import test from 'node:test'
import assert from 'node:assert/strict'
import { rememberStrokeThumbnail, strokeThumbnails } from '../src/editor/utils/strokeThumbnailRaster.web.js'

test('완성 픽셀을 별도 축소 버퍼에 복사하고 원본 버퍼와 문서는 수정하지 않는다', () => {
  const before = globalThis.document, calls = []
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...args) => calls.push(args) }) }) }
  try {
    const object = { id: 'a' }, batch = { width: 1188, height: 840, left: 1, top: 2, w: 100, h: 20, objects: [object] }, source = { width: 70, height: 14 }
    const original = JSON.stringify({ batch, source })
    const entry = rememberStrokeThumbnail(batch, source)
    assert.ok(entry)
    assert.notEqual(entry.image, source)
    assert.equal(entry.image.width, 22)
    assert.equal(entry.image.height, 5)
    assert.equal(calls[0][0], source)
    assert.equal(JSON.stringify({ batch, source }), original)
    assert.equal(strokeThumbnails.get([object], 0, 1188, 840), entry)
  } finally { globalThis.document = before; strokeThumbnails.clear() }
})
test('축소 캔버스 생성 실패는 편집기 완성 캐시를 실패시키지 않는다', () => {
  const before = globalThis.document
  globalThis.document = { createElement: () => { throw Error('GPU unavailable') } }
  try { assert.equal(rememberStrokeThumbnail({ width: 1188, w: 20, h: 20, objects: [{}] }, { width: 20, height: 20 }), null) }
  finally { globalThis.document = before }
})
