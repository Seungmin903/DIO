import test from 'node:test'
import assert from 'node:assert/strict'
import { createFontWorkflow, availableName, revisionName, queuePosition } from '../src/handwriting/workflow.js'
import { MODEL_VERSION, PREPROCESS_VERSION, PROMPTS } from '../src/handwriting/protocol.js'

const clone = value => JSON.parse(JSON.stringify(value))
const sample = { coordinateSize: 1024, strokes: [{ width: 9, points: [{ x: 200, y: 200 }, { x: 700, y: 700 }] }] }
const draft = id => ({ schema: 1, id, samples: Object.fromEntries(PROMPTS.map(c => [c, clone(sample)])), updatedAt: '2026-10-30' })
function setup(saved = [], jobs = new Map(), maxGeneratedFonts) {
  let next = 0, active = null, failSave = false, failRegister = false
  const calls = [], fonts = new Map()
  const repository = {
    load: async current => clone(current || saved), save: async entries => { if (failSave) throw new Error('disk full'); saved = clone(entries) },
    newDraft: () => ({ schema: 1, id: `d-${++next}`, samples: {}, updatedAt: 'now' }),
    register: async (uri, name, id) => { if (failRegister) throw new Error('register failed'); if (!fonts.has(id)) { fonts.set(id, { id: `font-${id}`, label: name }); calls.push(`register:${id}`) } return fonts.get(id) },
    renameFont: async (id, name) => { const font = [...fonts.values()].find(f => f.id === id); font.label = name },
    fontForJob: async id => fonts.get(id),
  }
  const engine = {
    capabilities: async () => ({ available: true, modelVersion: MODEL_VERSION }),
    snapshot: async value => ({ draft: clone(value), inputHash: `${value.id}:${value.updatedAt}:${JSON.stringify(value.samples)}` }),
    start: async snapshot => {
      assert.equal(active, null, 'native inference must never overlap')
      const job = { id: `job-${++next}`, state: 'processing', completed: 0, total: 11172, modelVersion: MODEL_VERSION, preprocessVersion: PREPROCESS_VERSION, inputHash: snapshot.inputHash, draft: snapshot.draft }
      active = job.id; jobs.set(job.id, job); calls.push(`start:${job.id}`); return clone(job)
    },
    refresh: async id => clone(jobs.get(id)),
    latest: async () => clone([...jobs.values()].at(-1) || null),
    jobDraft: async id => clone(jobs.get(id)?.draft || null),
    control: async (action, id) => {
      const job = jobs.get(id); calls.push(`${action}:${id}`)
      if (action === 'pause') { active = null; job.state = 'paused' }
      if (action === 'cancel') { active = null; job.state = 'cancelled' }
      if (action === 'resume') { assert.equal(active, null); active = id; job.state = 'processing' }
      return clone(job)
    },
    preview: async () => { assert.equal(active, null); calls.push('preview'); return { 안: 'file://preview.png' } },
    wait: async () => {},
  }
  const flow = createFontWorkflow({ repository, engine, maxGeneratedFonts, uuid: () => `entry-${++next}` })
  const item = id => flow.getSnapshot().entries.find(e => e.id === id)
  const complete = id => { const job = jobs.get(item(id).jobId); Object.assign(job, { state: 'ready', completed: 11172, fontUri: 'file://font.ttf' }); active = null }
  // 작업 상태를 바꾸고 엔진을 비운다(생성 실패 · 생성기 변경처럼 작업이 멈춘 경우)
  const settle = (id, patch) => { Object.assign(jobs.get(item(id).jobId), patch); active = null }
  const prepare = async name => {
    const id = await flow.create(); await flow.saveDraft(id, draft(id), name); await flow.preview(id); return id
  }
  return { flow, calls, jobs, fonts, item, complete, settle, prepare, repository, engine,
    saved: () => clone(saved), failSave: value => { failSave = value }, failRegister: value => { failRegister = value } }
}

test('생성 한도가 1개일 때 동시에 확정해도 하나만 시작하고 재실행 후에도 한도를 지킨다', async () => {
  const h = setup([], new Map(), 1)
  await h.flow.init()
  const first = await h.prepare('첫 폰트')
  const second = await h.prepare('둘째 폰트')
  const [accepted, rejected] = await Promise.allSettled([h.flow.confirm(first), h.flow.confirm(second)])
  assert.equal(accepted.status, 'fulfilled')
  assert.match(rejected.reason.message, /1개까지/)
  assert.equal(h.item(second).status, 'draft')
  h.complete(first)
  await h.flow.tick()

  const restarted = setup(h.saved(), h.jobs, 1)
  await restarted.flow.init()
  await assert.rejects(restarted.flow.create(first), /1개까지/)
  await assert.rejects(restarted.flow.confirm(second), /1개까지/)
})

test('가져온 폰트는 한도를 사용하지 않고 생성 취소 후 다시 만들 수 있다', async () => {
  const h = setup([{ id: 'imported', status: 'ready', fontId: 'imported' }], new Map(), 1)
  await h.flow.init()
  const first = await h.prepare('첫 폰트')
  await h.flow.confirm(first)
  await assert.rejects(h.flow.create(), /1개까지/)
  await h.flow.control(first, 'cancel')
  const second = await h.prepare('둘째 폰트')
  await h.flow.confirm(second)
  assert.equal(h.item(second).status, 'processing')
})

test('대기열은 화면 구독 없이도 FIFO로 생성하고 완료를 한 번만 등록한다', async () => {
  const h = setup(); await h.flow.init()
  const a = await h.prepare('첫 폰트'); await h.flow.confirm(a)
  const b = await h.prepare('둘째 폰트'); await h.flow.confirm(b)
  const c = await h.prepare('셋째 폰트'); await h.flow.confirm(c)
  assert.equal(h.item(a).status, 'processing'); assert.equal(h.item(b).status, 'queued')
  assert.equal(queuePosition(h.flow.getSnapshot().entries, b), 1)
  assert.equal(queuePosition(h.flow.getSnapshot().entries, c), 2)
  await h.flow.confirm(a)
  h.complete(a); await h.flow.tick(); await h.flow.tick()
  assert.equal(h.item(a).status, 'ready'); assert.equal(h.item(b).status, 'processing')
  assert.equal(h.calls.filter(v => v === `register:${h.item(a).jobId}`).length, 1)
  h.complete(b); await h.flow.tick(); assert.equal(h.item(c).status, 'processing')
})
test('작성 시작 순서가 달라도 생성 확정 순서대로 처리한다', async () => {
  const h = setup(); await h.flow.init()
  const a = await h.prepare('먼저 쓴 초안'), b = await h.prepare('먼저 확정'), c = await h.prepare('다음 확정')
  await h.flow.confirm(b); await h.flow.confirm(c); await h.flow.confirm(a)
  assert.equal(queuePosition(h.flow.getSnapshot().entries, c), 1)
  assert.equal(queuePosition(h.flow.getSnapshot().entries, a), 2)
  h.complete(b); await h.flow.tick(); assert.equal(h.item(c).status, 'processing'); assert.equal(h.item(a).status, 'queued')
})
test('샘플을 요청하면 실제 정지 완료를 기다리고 원래 작업을 재개한다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('원본'); await h.flow.confirm(a)
  let polls = 0
  let busyChecks = 0
  h.engine.isBusy = async () => ++busyChecks < 2
  const refresh = h.engine.refresh
  h.engine.control = async action => { assert.equal(action, 'pause'); h.calls.push('pause-ack'); return { state: 'processing' } }
  h.engine.refresh = async id => {
    if (++polls < 3) return { ...await refresh(id), state: 'processing' }
    return { ...await refresh(id), state: 'paused' }
  }
  // Fake the eventual native pause and resume independently of its immediate acknowledgement.
  const control = h.engine.control
  h.engine.control = async (action, id) => {
    if (action === 'resume') { h.calls.push(`resume:${id}`); h.jobs.get(id).state = 'processing'; return clone(h.jobs.get(id)) }
    return control(action, id)
  }
  h.engine.preview = async () => { assert.ok(polls >= 3); assert.ok(busyChecks >= 2); h.calls.push('preview-after-stop'); return { 안: 'real-preview' } }
  const b = await h.prepare('추가'); assert.ok(b)
  assert.ok(h.calls.indexOf('pause-ack') < h.calls.indexOf('preview-after-stop'))
  assert.equal(h.calls.at(-1), `resume:${h.item(a).jobId}`)
})
test('백그라운드에서는 중단하고 복귀·재실행 시 자동 복원하되 수동 정지는 유지한다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('A'); await h.flow.confirm(a)
  await h.flow.setForeground(false); assert.equal(h.item(a).pauseReason, 'background')
  await h.flow.tick(); assert.equal(h.item(a).status, 'paused')
  await h.flow.setForeground(true); assert.equal(h.item(a).status, 'processing')
  await h.flow.control(a, 'pause'); assert.equal(h.item(a).pauseReason, 'manual')
  await h.flow.setForeground(false); await h.flow.setForeground(true); assert.equal(h.item(a).status, 'paused')
  const restored = setup(h.saved(), h.jobs); await restored.flow.init(); assert.equal(restored.item(a).status, 'paused')
  await restored.flow.control(a, 'resume'); assert.equal(restored.item(a).status, 'processing')
})
test('실패·취소는 다음 작업을 막지 않고 등록 실패도 파일 재생성 없이 재시도한다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('A'); await h.flow.confirm(a)
  const b = await h.prepare('B'); await h.flow.confirm(b)
  h.complete(a); h.failRegister(true); await h.flow.tick()
  assert.equal(h.item(a).status, 'failed'); assert.equal(h.item(b).status, 'processing')
  await h.flow.control(b, 'cancel'); assert.equal(h.item(b).status, 'cancelled')
  h.failRegister(false); await h.flow.control(a, 'resume'); assert.equal(h.item(a).status, 'ready')
  assert.equal(h.calls.filter(v => v.startsWith('start:')).length, 2)
})
test('입력 수정은 독립된 사본이며 이름 변경은 기존 폰트 참조를 유지한다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('신승민 폰트'); await h.flow.confirm(a); h.complete(a); await h.flow.tick()
  const fontId = h.item(a).fontId, original = clone(h.item(a).draft)
  const b = await h.flow.create(a); assert.equal(h.item(b).name, '신승민 폰트 2')
  const c = await h.flow.create(a); assert.equal(h.item(c).name, '신승민 폰트 3')
  const revised = clone(h.item(b).draft); revised.samples[PROMPTS[0]].strokes[0].points[0].x = 300
  await h.flow.saveDraft(b, revised, h.item(b).name)
  assert.deepEqual(h.item(a).draft, original)
  await h.flow.rename(a, '바뀐 이름'); assert.equal(h.item(a).fontId, fontId)
  await assert.rejects(h.flow.saveDraft(a, original, '덮어쓰기'), /수정할 수 없/)
})
test('다른 폰트와 같은 이름으로 바꾸면 거절하고 이름을 그대로 둔다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('첫 폰트'), b = await h.prepare('둘째 폰트')
  await assert.rejects(h.flow.rename(b, '첫 폰트'), /같은 이름의 폰트가 있어요/)
  assert.equal(h.item(b).name, '둘째 폰트'); assert.equal(h.item(a).name, '첫 폰트')
})
test('수정된 입력은 재미리보기 없이 확정할 수 없고 중복 확정은 단일 작업이다', async () => {
  const h = setup(); await h.flow.init(); const a = await h.prepare('A')
  const changed = draft(a); changed.updatedAt = 'changed'; await h.flow.saveDraft(a, changed, 'A')
  await assert.rejects(h.flow.confirm(a), /샘플을 먼저/)
  await h.flow.preview(a); await Promise.all([h.flow.confirm(a), h.flow.confirm(a)])
  assert.equal(h.calls.filter(v => v.startsWith('start:')).length, 1)
})
test('저장 실패는 마지막 저장 데이터를 덮지 않으며 입력을 재시도할 수 있다', async () => {
  const h = setup(); await h.flow.init(); const id = await h.flow.create(), saved = h.saved()
  h.failSave(true); await assert.rejects(h.flow.saveDraft(id, draft(id), 'A'), /disk full/)
  assert.deepEqual(h.saved(), saved)
  h.failSave(false); await h.flow.saveDraft(id, draft(id), 'A'); assert.equal(Object.keys(h.item(id).draft.samples).length, 36)
})
test('이름 번호는 길이 제한과 기존 번호 충돌을 지킨다', () => {
  assert.equal(availableName('A', [{ name: 'A' }, { name: 'A 2' }]), 'A 3')
  assert.equal(availableName('가'.repeat(30), [{ name: '가'.repeat(30) }]).length, 30)
  assert.equal(revisionName({ name: 'A 2', baseName: 'A' }, [{ name: 'A' }, { name: 'A 2' }]), 'A 3')
})
test('플랫폼 미지원 시 가짜 생성 결과나 작업을 만들지 않는다', async () => {
  const h = setup(); h.engine.capabilities = async () => ({ available: false, reason: 'Android 개발 빌드 필요' }); await h.flow.init()
  const id = await h.flow.create(); await h.flow.saveDraft(id, draft(id), 'A')
  await assert.rejects(h.flow.preview(id), /개발 빌드/); await assert.rejects(h.flow.confirm(id), /개발 빌드/)
  assert.equal(h.item(id).status, 'draft'); assert.deepEqual(h.calls, [])
})
test('생성 직후 앱 종료를 inputHash로 복구하고 이전 폰트에 현재 초안을 잘못 연결하지 않는다', async () => {
  const h = setup(); await h.flow.init(); const id = await h.prepare('A'); await h.flow.confirm(id)
  const saved = h.saved(); delete saved[0].jobId; delete saved[0].job; saved[0].status = 'queued'
  const restarted = setup(saved, h.jobs); await restarted.flow.init()
  assert.equal(restarted.flow.getSnapshot().entries.length, 1)
  assert.equal(restarted.item(id).jobId, h.item(id).jobId)
  const legacy = setup([{ id: 'old', name: '이전 폰트', fontId: 'f-old', status: 'ready', draft: null }]); await legacy.flow.init()
  await assert.rejects(legacy.flow.create('old'), /원래 입력/)
})

test('완료 직후 종료된 작업은 모든 복원 경로에서 실제 등록하고 재실행에도 중복되지 않는다', async () => {
  for (const scenario of ['hash', 'unknown', 'legacy-ready', 'registering']) {
    const job = { id: 'done', state: 'ready', completed: 11172, fontUri: 'file://font.ttf', inputHash: 'hash', draft: draft('original') }
    const saved = scenario === 'hash' ? [{ id: 'entry', name: '원본', status: 'queued', inputHash: 'hash' }]
      : scenario === 'unknown' ? [] : [{ id: 'entry', name: '원본', status: scenario === 'legacy-ready' ? 'ready' : 'registering', jobId: 'done' }]
    const h = setup(saved, new Map([['done', job]])); await h.flow.init(); await h.flow.tick()
    const item = h.flow.getSnapshot().entries[0]
    assert.equal(item.status, 'ready', scenario); assert.equal(item.fontId, 'font-done', scenario)
    assert.deepEqual(item.draft, job.draft)
    assert.equal(h.calls.filter(c => c === 'register:done').length, 1)
    const restarted = setup(h.saved(), h.jobs)
    for (const [id, font] of h.fonts) restarted.fonts.set(id, font)
    await restarted.flow.init(); await restarted.flow.tick()
    assert.equal(restarted.flow.getSnapshot().entries[0].fontId, 'font-done')
    assert.equal(restarted.calls.filter(c => c === 'register:done').length, 0)
    assert.equal(restarted.calls.filter(c => c.startsWith('start:')).length, 0)
  }
})

test('복구된 완료 작업의 등록 실패는 재시도 가능하며 기존 등록은 재사용한다', async () => {
  const job = { id: 'done', state: 'ready', inputHash: 'hash', fontUri: 'file://font.ttf', draft: draft('original') }
  const h = setup([], new Map([['done', job]])); h.failRegister(true); await h.flow.init()
  const id = h.flow.getSnapshot().entries[0].id
  assert.equal(h.item(id).status, 'failed')
  h.failRegister(false); await h.flow.control(id, 'resume')
  assert.equal(h.item(id).status, 'ready'); assert.equal(h.item(id).fontId, 'font-done')
  const existing = setup([], new Map([['done', job]])); existing.fonts.set('done', {id:'already-registered',label:'원본'})
  await existing.flow.init()
  assert.equal(existing.flow.getSnapshot().entries[0].fontId, 'already-registered')
  assert.deepEqual(existing.calls, [])
})
test('작성 중인 폰트만 지우고 저장소에서도 사라지며, 생성을 확정한 폰트는 지우지 않는다', async () => {
  const h = setup(); await h.flow.init()
  const kept = await h.prepare('확정 폰트'); await h.flow.confirm(kept)
  const id = await h.flow.create()
  await h.flow.removeDraft(id)
  assert.equal(h.item(id), undefined); assert.equal(h.saved().some(e => e.id === id), false)
  await assert.rejects(h.flow.removeDraft(kept), /작성 중인 폰트만/)
  assert.ok(h.item(kept))
})

test('한도 1개: 생성 실패 폰트 다시 시도는 다른 폰트가 한도를 쓰는 동안 거절되고, 비면 허용된다', async () => {
  const h = setup([], new Map(), 1)
  await h.flow.init()
  const a = await h.prepare('A'); await h.flow.confirm(a)
  h.settle(a, { state: 'failed', error: 'boom' }); await h.flow.tick()
  assert.equal(h.item(a).status, 'failed')
  // 생성 자체가 실패한 폰트는 한도를 쓰지 않으니 다른 폰트를 만들 수 있다
  const b = await h.prepare('B'); await h.flow.confirm(b)
  assert.equal(h.item(b).status, 'processing')
  await assert.rejects(h.flow.control(a, 'resume'), /1개까지/)
  assert.equal(h.item(a).status, 'failed')
  await h.flow.control(b, 'cancel')
  // 한도가 비면 다시 시도를 거절하지 않는다(재개 뒤 작업 상태는 엔진이 정한다)
  await assert.doesNotReject(h.flow.control(a, 'resume'))
})

test('한도 1개: 등록 단계에서 실패한 폰트는 한도를 계속 쓰고, 자기 자신은 다시 시도할 수 있다', async () => {
  const h = setup([], new Map(), 1)
  await h.flow.init()
  const a = await h.prepare('A'); await h.flow.confirm(a)
  h.complete(a); h.failRegister(true); await h.flow.tick()
  assert.equal(h.item(a).status, 'failed')
  await assert.rejects(h.flow.create(), /1개까지/)
  h.failRegister(false); await h.flow.control(a, 'resume')
  assert.equal(h.item(a).status, 'ready')
  assert.equal(h.calls.filter(v => v.startsWith('start:')).length, 1)
})

test('한도 1개: 입력 수정 버튼이 보이는 폰트(취소 · 생성기 변경)는 한도를 쓰지 않아 원본에서 수정본을 만들고 확정할 수 있다', async () => {
  for (const make of ['cancelled', 'incompatible']) {
    const h = setup([], new Map(), 1)
    await h.flow.init()
    const a = await h.prepare('A'); await h.flow.confirm(a)
    if (make === 'cancelled') await h.flow.control(a, 'cancel')
    else { h.settle(a, { state: 'paused', modelVersion: 'old-model' }); await h.flow.tick() }
    assert.equal(h.item(a).status, make === 'cancelled' ? 'cancelled' : 'failed', make)
    if (make === 'incompatible') assert.equal(h.item(a).incompatible, true)
    const revision = await h.flow.create(a)
    assert.equal(h.item(revision).sourceId, a, make)
    await h.flow.preview(revision); await h.flow.confirm(revision)
    assert.notEqual(h.item(revision).status, 'draft', make)
  }
})
