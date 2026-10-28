import test from 'node:test'
import assert from 'node:assert/strict'
import { largeDocument, largeDiary, createLargeRunMetrics, replaceLargeQADocument } from '../qa/large-integration.js'
import { indexedDB } from 'fake-indexeddb'
import { largeReference } from '../qa/large-reference-store.js'

test('대용량 문서는 조건별 QA 키·합성 획 수·긴 획 점 수를 유지한다', () => {
  for (const [id, count, points] of [['100', 100, 128], ['300', 300, 128], ['long30', 30, 1000]]) {
    const doc = largeDocument(id), objects = doc.pages[0].objects
    assert.equal(doc.id, largeDiary(id).id)
    assert.equal(objects.length, count)
    assert.equal(objects.filter(o => o.penKind === 'felt').length, count / 2)
    assert.ok(objects.every(o => o.points.length === points && o.renderVersion === 3))
    assert.ok(JSON.stringify(doc).length * 2 < 4 * 1024 * 1024, '합성 문서는 UTF-16 4MiB 예산 안에서 준비한다')
    assert.equal(largeDocument(id).pages[0].objects.length, count)
  }
  assert.throws(() => largeDocument('../bad'))
})

const quotaStorage = () => {
  const values = new Map([['personal', 'keep']])
  let fail = false
  return { values, failNext: () => { fail = true },
    async getItem(key) { return values.get(key) ?? null },
    async removeItem(key) { values.delete(key) },
    async setItem(key, value) {
      const bytes = [...values].filter(([k]) => k !== key).reduce((n, [k, v]) => n + 2 * (k.length + v.length), 0) + 2 * (key.length + value.length)
      if (fail || bytes > 5 * 1024 * 1024) { fail = false; throw Object.assign(Error('quota'), { name: 'QuotaExceededError' }) }
      values.set(key, value)
    },
  }
}
test('5MiB UTF-16 저장 제한에서도 100→300→긴30 전환하고 다른 키는 보존한다', async () => {
  const storage = quotaStorage(), keys = ['100', '300', 'long30']
  for (const id of keys) {
    await replaceLargeQADocument({ storage, keys, targetKey: id, doc: largeDocument(id) })
    assert.equal(JSON.parse(await storage.getItem(id)).pages[0].objects.length, id === 'long30' ? 30 : Number(id))
    assert.equal(storage.values.get('personal'), 'keep')
    assert.equal(keys.filter(key => storage.values.has(key)).length, 1)
  }
})
test('새 조건 저장 실패 시 이전 시험 문서를 복구하고 성공으로 표시하지 않는다', async () => {
  const storage = quotaStorage(), keys = ['100', '300', 'long30']
  await storage.setItem('100', '{"previous":true}')
  storage.failNext()
  await assert.rejects(replaceLargeQADocument({ storage, keys, targetKey: '300', doc: largeDocument('300') }), error => error.storageName === 'QuotaExceededError' && error.rollbackOK)
  assert.equal(await storage.getItem('100'), '{"previous":true}')
  assert.equal(await storage.getItem('300'), null)
  assert.equal(storage.values.get('personal'), 'keep')
})
test('단계별 입력·확정·인계 계측은 중복과 지우개를 제외하고 분리한다', () => {
  const metrics = createLargeRunMetrics()
  for (const type of ['input-accepted', 'input-accepted', 'stroke', 'stroke-handoff']) metrics.record({ qaPhase: 'initial', type, sequence: 1, reason: 'committed' })
  metrics.record({ qaPhase: 'ready', type: 'input-accepted', sequence: 2 })
  metrics.record({ qaPhase: 'initial', type: 'input-accepted', sequence: 3, kind: 'eraser' })
  assert.equal(metrics.snapshot('initial').accepted, 1)
  assert.equal(metrics.snapshot('initial').completed, 1)
  assert.equal(metrics.snapshot('initial').handedOff, 1)
  assert.equal(metrics.snapshot('ready').completed, 0)
})
test('대조 사본은 별도 IndexedDB에 원본 값 그대로 보관하고 조건별로 구분한다', async () => {
  globalThis.indexedDB = indexedDB
  const baseline = { run: 'test', doc: largeDocument('300') }
  await largeReference('write', '300', baseline)
  assert.deepEqual(await largeReference('read', '300'), baseline)
  assert.equal(await largeReference('read', '100'), undefined)
})
