import test from 'node:test'
import assert from 'node:assert/strict'
import { sameStoredDocument, storageSummary } from '../qa/storage-snapshot.js'

const doc = () => ({ pages: [{ objects: [{ id: 'a', type: 'stroke', penKind: 'felt', renderVersion: 3, materialSeed: 17,
  points: [{ x: 1, y: 2, force: 0.15, pressure: 0.92 }, { x: 2, y: 3, force: 0.85, pressure: 0.99 }] }] }] })
test('저장 QA는 시각만 제외하고 센서·재질·같은 개수의 지운 결과를 대조한다', () => {
  const a = doc(), b = structuredClone(a)
  b.updatedAt = 'later'
  assert.equal(sameStoredDocument(a, b), true)
  for (const change of [d => d.pages[0].objects[0].points[0].force = 0.3,
    d => d.pages[0].objects[0].materialSeed++, d => d.pages[0].objects[0].renderVersion = 2,
    d => d.pages[0].objects[0].points.pop(), d => d.pages[0].objects[0].points[0].x++]) {
    const altered = structuredClone(a); change(altered)
    assert.equal(sameStoredDocument(a, altered), false)
  }
  assert.equal(sameStoredDocument(a, null), false)
  const summary = storageSummary(a)
  assert.equal(summary.kinds.felt.forceMin, 0.15)
  assert.equal(summary.kinds.felt.forceMax, 0.85)
  assert.equal(summary.kinds.felt.seededStrokes, 1)
  assert.equal(JSON.stringify(summary).includes('"points":['), false)
})
