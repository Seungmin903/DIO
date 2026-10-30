import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkflowPersistence, WORKFLOW_POINTER_KEY } from '../src/handwriting/workflowPersistence.js'

function setup() {
  const kv = new Map(), files = new Map(), writes = [], failure = { value: '' }
  let next = 0
  const storage = {
    getItem: async key => kv.get(key) ?? null,
    async setItem(key, text) {
      assert(Buffer.byteLength(text) < 2048, 'AsyncStorage must hold only a small pointer')
      if (failure.value === 'commit') throw new Error('disk full')
      kv.set(key, text)
      if (failure.value === 'after-commit') throw new Error('interrupted after commit')
    },
  }
  const blobs = {
    async read(id) { if (!files.has(id)) throw new Error('missing file'); return files.get(id) },
    async write(id, text) { if (failure.value === 'file' || (failure.value === 'index' && JSON.parse(text).schema === 3)) throw new Error('disk full'); assert(!files.has(id)); files.set(id, text); writes.push(id) },
    async remove(id) { files.delete(id) },
    async prune(keep) { for (const id of files.keys()) if (!keep.has(id)) files.delete(id) },
  }
  const create = () => createWorkflowPersistence({ storage, blobs, uuid: () => `file-${++next}` })
  return { create, kv, files, writes, failure }
}
const entry = { id: 'a', status: 'processing', draft: { samples: { 값: '한글'.repeat(1200000) } }, preview: { 안: 'data:image/png;base64,' + 'a'.repeat(100000) } }

test('6MB를 넘는 원본도 AsyncStorage에는 작은 포인터만 남기고 재실행 복원한다', async () => {
  const h = setup(), p = h.create(), entries = [entry, { ...entry, id: 'b' }]
  assert(Buffer.byteLength(JSON.stringify(entries)) > 6 * 1024 * 1024)
  await p.save(entries)
  assert(h.kv.get(WORKFLOW_POINTER_KEY).length < 100)
  assert.deepEqual(await h.create().load(), entries)
  const index = JSON.parse(h.files.get(JSON.parse(h.kv.get(WORKFLOW_POINTER_KEY)).index))
  assert(index.records.every(record => !('draft' in record.value) && !('preview' in record.value)))
})

test('진행률 갱신은 원본을 다시 쓰지 않고 수정한 입력은 새 스냅샷으로 교체한다', async () => {
  const h = setup(), p = h.create()
  await p.save([entry]); const firstWrites = h.writes.length
  await p.save([{ ...entry, job: { completed: 10 } }])
  assert.equal(h.writes.length - firstWrites, 1, 'only the metadata index should be rewritten')
  assert.equal(h.files.size, 2)
  await p.save([{ ...entry, draft: { samples: {} } }])
  assert.equal(h.files.size, 2)
  assert.deepEqual(await h.create().load(), [{ ...entry, draft: { samples: {} } }])
})

test('파일·색인·커밋 실패와 재시작은 이전 입력을 보존하고 재시도할 수 있다', async () => {
  for (const stage of ['file', 'index', 'commit']) {
    const h = setup(), p = h.create(); await p.save([entry])
    const before = h.kv.get(WORKFLOW_POINTER_KEY)
    h.failure.value = stage
    await assert.rejects(p.save([{ ...entry, draft: { samples: { 값: 'changed' } } }]), /disk full/)
    assert.equal(h.kv.get(WORKFLOW_POINTER_KEY), before)
    assert.deepEqual(await h.create().load(), [entry])
    assert.equal(h.files.size, 2, 'unpublished records are pruned only after the committed snapshot loads')
    h.failure.value = ''; await p.save([{ ...entry, status: 'paused' }])
    assert.equal((await h.create().load())[0].status, 'paused')
  }
})

test('커밋 후 응답 전에 중단돼도 새 포인터가 참조하는 파일을 지우지 않는다', async () => {
  const h = setup(), p = h.create(); await p.save([entry])
  const next = [{ ...entry, draft: { samples: { 값: 'committed' } } }]
  h.failure.value = 'after-commit'
  await assert.rejects(p.save(next), /interrupted/)
  assert.deepEqual(await h.create().load(), next)
})

test('확정된 원본·중복 ID·누락 파일을 보존하며 요청 당시 스냅샷을 저장한다', async () => {
  const h = setup(), p = h.create(), value = { id: 'a', draft: { samples: { 값: 'original' } } }
  const task = p.save([value]); value.draft.samples.값 = 'mutated'; await task
  assert.equal((await p.load())[0].draft.samples.값, 'original')
  const pointer = h.kv.get(WORKFLOW_POINTER_KEY)
  await assert.rejects(p.save([value, value]), /ID/)
  assert.equal(h.kv.get(WORKFLOW_POINTER_KEY), pointer)
  const indexId = JSON.parse(pointer).index
  const payload = JSON.parse(h.files.get(indexId)).records[0].payload
  h.files.delete(payload)
  await assert.rejects(h.create().load(), /missing/)
  assert.equal(h.kv.get(WORKFLOW_POINTER_KEY), pointer)
})
