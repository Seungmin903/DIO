import test from 'node:test'
import assert from 'node:assert/strict'
import { createPageImageRenderer } from '../src/editor/utils/pageImageRenderer.js'
import { createExportSnapshot } from '../src/editor/utils/pageExport.js'

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r }); return { promise, resolve } }
const tick = () => new Promise((r) => setImmediate(r))

test('같은 작업기로 PNG와 PDF용 두 페이지를 순차 생성하고 결과는 호출자가 해제한다', async () => {
  let sources = 0, outputs = 0
  const renderer = createPageImageRenderer({
    prepare: async (s) => ({ ...s, dispose: () => sources++ }),
    render: async (s) => ({ width: s.pixelWidth, dispose: () => outputs++ }),
  })
  for (const scale of [1, 2]) {
    const snapshot = createExportSnapshot({ objects: [] }, { scale })
    const before = JSON.stringify(snapshot)
    const result = await renderer.renderPageImage(snapshot)
    assert.equal(result.width, 1188 * scale)
    assert.equal(JSON.stringify(snapshot), before)
    result.dispose(); result.dispose()
  }
  assert.equal(sources, 2); assert.equal(outputs, 2)
})

test('렌더 실패는 원인을 유지하고 자원 해제 후 재시도할 수 있다', async () => {
  let disposed = 0, fail = true
  const error = Object.assign(new Error('load failed'), { code: 'EXPORT_MEDIA_FAILED' })
  const renderer = createPageImageRenderer({
    prepare: async () => ({ dispose: () => disposed++ }),
    render: async () => { if (fail) throw error; return { dispose() {} } },
  })
  await assert.rejects(renderer.renderPageImage({}), (e) => e === error)
  fail = false
  const result = await renderer.renderPageImage({}); result.dispose()
  assert.equal(disposed, 2)
})

test('준비 중 취소 즉시 복귀하고 늦은 자원을 정리하며 동시 실행을 차단한다', async () => {
  const waiting = deferred(), controller = new AbortController()
  let disposed = 0, renders = 0
  const renderer = createPageImageRenderer({ prepare: () => waiting.promise, render: async () => { renders++; return { dispose() {} } } })
  const pending = renderer.renderPageImage({}, { signal: controller.signal })
  const checked = assert.rejects(pending, { code: 'EXPORT_CANCELLED' })
  controller.abort(); await checked
  await assert.rejects(renderer.renderPageImage({}), { code: 'EXPORT_BUSY' })
  waiting.resolve({ dispose: () => disposed++ }); await tick()
  assert.equal(disposed, 1); assert.equal(renders, 0)
})

test('취소 후 늦게 완료된 캡처 결과와 준비 자원을 정리한다', async () => {
  const waiting = deferred(), entered = deferred()
  let sources = 0, outputs = 0
  const renderer = createPageImageRenderer({
    prepare: async () => ({ dispose: () => sources++ }),
    render: () => { entered.resolve(); return waiting.promise },
  })
  const pending = renderer.renderPageImage({}); await entered.promise
  const checked = assert.rejects(pending, { code: 'EXPORT_CANCELLED' })
  renderer.cancel(); await checked
  waiting.resolve({ dispose: () => outputs++ }); await tick()
  assert.equal(sources, 1); assert.equal(outputs, 1)
})

test('시간 초과는 늦은 준비 결과도 정리한다', async () => {
  const waiting = deferred(); let disposed = 0
  const renderer = createPageImageRenderer({ prepare: () => waiting.promise, render: async () => assert.fail('not reached'), timeoutMs: 5 })
  await assert.rejects(renderer.renderPageImage({}), { code: 'EXPORT_TIMEOUT' })
  waiting.resolve({ dispose: () => disposed++ }); await tick()
  assert.equal(disposed, 1)
})

test('이미 취소된 요청은 IO를 시작하지 않으며 준비 실패 후 다시 호출할 수 있다', async () => {
  let reads = 0
  const renderer = createPageImageRenderer({ prepare: async () => { reads++; throw new Error('prepare') }, render: async () => assert.fail('not reached') })
  const controller = new AbortController(); controller.abort()
  await assert.rejects(renderer.renderPageImage({}, { signal: controller.signal }), { code: 'EXPORT_CANCELLED' })
  assert.equal(reads, 0)
  await assert.rejects(renderer.renderPageImage({}), /prepare/)
  await assert.rejects(renderer.renderPageImage({}), /prepare/)
  assert.equal(reads, 2)
})

test('멈춘 캡처는 유예 시간 뒤 작업기를 해제하고, 늦은 결과는 새 작업을 방해하지 않고 정리된다', async () => {
  const hung = deferred(), next = deferred()
  let call = 0, outputs = 0
  const renderer = createPageImageRenderer({
    prepare: async () => ({ dispose() {} }),
    render: () => (++call === 1 ? hung.promise : next.promise),
    timeoutMs: 5, releaseGraceMs: 20,
  })
  await assert.rejects(renderer.renderPageImage({}), { code: 'EXPORT_TIMEOUT' })
  // 유예 시간 안에는 기존처럼 동시 실행을 막는다.
  await assert.rejects(renderer.renderPageImage({}), { code: 'EXPORT_BUSY' })
  await new Promise((r) => setTimeout(r, 40))
  const pending = renderer.renderPageImage({}); await tick()
  // 늦게 끝난 첫 캡처는 정리되고, 진행 중인 두 번째 작업의 점유를 풀지 않는다.
  hung.resolve({ dispose: () => outputs++ }); await tick()
  assert.equal(outputs, 1)
  await assert.rejects(renderer.renderPageImage({}), { code: 'EXPORT_BUSY' })
  next.resolve({ dispose: () => outputs++ })
  const result = await pending; result.dispose()
  assert.equal(outputs, 2)
})
