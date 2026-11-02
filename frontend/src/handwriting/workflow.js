import { validateDraft, jobMatchesModel, SYLLABLE_COUNT, PROMPTS } from './protocol.js'

const copy = value => JSON.parse(JSON.stringify(value))
const waitingEntries = entries => entries.filter(e => e.status === 'queued').sort((a, b) => (a.queueOrder ?? a.createdAt ?? 0) - (b.queueOrder ?? b.createdAt ?? 0))
const labelOf = value => {
  const label = value.trim()
  if (!label || label.length > 30) throw new Error('폰트 이름을 1~30자로 입력해 주세요.')
  return label
}
export function availableName(name, entries) {
  const base = labelOf(name), used = new Set(entries.map(e => e.name))
  if (!used.has(base)) return base
  for (let n = 2; ; n++) {
    const suffix = ` ${n}`, candidate = base.slice(0, 30 - suffix.length).replace(/[\uD800-\uDBFF]$/, '') + suffix
    if (!used.has(candidate)) return candidate
  }
}
export function revisionName(entry, entries) {
  return availableName(entry.baseName || entry.name, entries)
}
export function createFontWorkflow({ repository, engine, uuid, onFontsChanged = async () => {} }) {
  let state = { loaded: false, entries: [], support: { available: false, reason: '실행 환경을 확인하고 있어요.' }, error: '', previewing: false }
  let initialized, serial = Promise.resolve(), previewTask, foreground = true
  const listeners = new Set(), snapshots = new Map()
  const emit = patch => { state = { ...state, ...patch }; listeners.forEach(f => f()) }
  const transact = fn => {
    const task = serial.then(fn)
    serial = task.catch(() => {})
    return task
  }
  const persist = async entries => { await repository.save(entries); emit({ entries, error: '' }) }
  const update = async (id, patch) => {
    const entries = state.entries.map(e => e.id === id ? { ...e, ...patch } : e)
    await persist(entries)
    return entries.find(e => e.id === id)
  }
  const entry = id => {
    const value = state.entries.find(e => e.id === id)
    if (!value) throw new Error('폰트 항목을 찾지 못했어요.')
    return value
  }
  const requireSupport = () => { if (!state.support.available) throw new Error(state.support.reason) }
  const nextQueueOrder = () => Math.max(0, ...state.entries.map(e => e.queueOrder || 0)) + 1
  const prepared = async value => {
    let snapshot = snapshots.get(value.id)
    if (!snapshot || snapshot.draft.updatedAt !== value.draft.updatedAt) {
      snapshot = await engine.snapshot(value.draft)
      snapshots.clear()
      snapshots.set(value.id, snapshot)
    }
    return snapshot
  }
  const finish = async (value, job) => {
    // File registration is idempotent by native job ID, including crash recovery.
    const font = await repository.register(job.fontUri, value.name, job.id)
    await update(value.id, { status: 'ready', job, fontId: font.id, error: null, pauseReason: null })
    snapshots.delete(value.id)
    await onFontsChanged()
  }
  const reconcile = async value => {
    if (!value.jobId) return
    const job = await engine.refresh(value.jobId)
    if (job.state === 'ready') {
      try { await finish(value, job) } catch (error) { await update(value.id, { job, status: 'failed', error: error.message }) }
      return
    }
    if (job.state === 'cancelled') return update(value.id, { job, status: 'cancelled', pauseReason: null })
    if (job.state === 'failed') return update(value.id, { job, status: 'failed', error: job.error || '생성을 마치지 못했어요.' })
    if (!jobMatchesModel(job, state.support.modelVersion)) return update(value.id, { job, status: 'failed', error: '생성기가 변경됐어요. 입력을 수정해 새 작업으로 만들어 주세요.', incompatible: true })
    await update(value.id, { job, status: job.state === 'processing' ? 'processing' : 'paused' })
  }
  const stopAndWait = async (value, reason) => {
    if (!value?.jobId) return
    // Persist user intent before stopping; returning from pauseJob is only an acknowledgement.
    await update(value.id, { pauseReason: reason })
    await engine.control('pause', value.jobId)
    const deadline = Date.now() + 30000
    while (true) {
      await reconcile(entry(value.id))
      if (entry(value.id).status !== 'processing' && !await engine.isBusy?.()) return
      if (Date.now() > deadline) throw new Error('생성을 멈추고 있어요. 잠시 후 다시 시도해 주세요.')
      await engine.wait(80)
    }
  }
  async function pump() {
    if (!state.loaded || !state.support.available) return
    for (const value of state.entries.filter(e => e.jobId && (!['ready', 'cancelled', 'failed'].includes(e.status) || (e.status === 'ready' && !e.fontId)))) {
      await reconcile(value)
    }
    const active = state.entries.find(e => e.status === 'processing')
    if (active && (!foreground || active.pauseReason === 'manual')) await stopAndWait(active, active.pauseReason === 'manual' ? 'manual' : 'background')
    if (!foreground || state.previewing) return
    if (state.entries.some(e => e.status === 'processing')) return
    if (await engine.isBusy?.()) return
    const value = state.entries.find(e => e.status === 'paused' && e.pauseReason !== 'manual')
      || waitingEntries(state.entries)[0]
    if (!value) return
    try {
      let job
      if (value.jobId) {
        job = await engine.refresh(value.jobId)
        if (job.state === 'ready') { await finish(value, job); return }
        job = await engine.control('resume', value.jobId)
      }
      else {
        const snapshot = await prepared(value)
        await update(value.id, { inputHash: snapshot.inputHash })
        job = await engine.start(snapshot)
      }
      await update(value.id, { jobId: job.id, job, status: job.state === 'ready' ? 'registering' : 'processing', pauseReason: null })
      snapshots.delete(value.id)
      if (job.state === 'ready') await finish(entry(value.id), job)
    } catch (error) {
      // A persistence failure leaves a native job discoverable by inputHash on the next tick.
      const latest = await engine.latest().catch(() => null)
      if (latest && latest.inputHash === entry(value.id).inputHash) {
        await update(value.id, { jobId: latest.id, job: latest, status: latest.state === 'ready' ? 'registering' : latest.state })
      } else await update(value.id, { status: 'failed', error: error.message })
    }
  }
  const report = error => { emit({ error: error.message }); throw error }
  return {
    getSnapshot: () => state,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    init() {
      if (!initialized) initialized = transact(async () => {
        const support = await engine.capabilities()
        const entries = await repository.load()
        emit({ entries, support })
        if (support.available) {
          const latest = await engine.latest()
          if (latest && !entries.some(e => e.jobId === latest.id)) {
            const interrupted = entries.find(e => e.inputHash && e.inputHash === latest.inputHash && e.status !== 'ready')
            if (interrupted) await update(interrupted.id, { jobId: latest.id, job: latest, status: latest.state === 'ready' ? 'registering' : latest.state })
            else {
              const draft = await engine.jobDraft(latest.id).catch(() => null)
              const font = await repository.fontForJob(latest.id)
              await persist([...state.entries, { id: uuid(), name: font?.label || '이전 생성 폰트', baseName: font?.label || '이전 생성 폰트', draft, jobId: latest.id, job: latest, status: font ? 'ready' : latest.state === 'ready' ? 'registering' : latest.state, fontId: font?.id, createdAt: Date.now() }])
            }
          }
          // Recover input snapshots only from their own native job, never from the current draft.
          for (const value of state.entries.filter(e => e.jobId && !e.draft)) {
            const draft = await engine.jobDraft(value.jobId).catch(() => null)
            if (draft) await update(value.id, { draft })
          }
        }
        emit({ loaded: true })
        await pump()
      }).catch(error => { initialized = null; return report(error) })
      return initialized
    },
    tick: () => transact(pump).catch(report),
    async create(sourceId) {
      return transact(async () => {
        const source = sourceId ? entry(sourceId) : null
        if (source && !source.draft) throw new Error('이 폰트의 원래 입력이 없어 수정할 수 없어요.')
        const draft = source ? copy(source.draft) : repository.newDraft()
        draft.id = uuid(); draft.updatedAt = new Date().toISOString()
        const value = { id: uuid(), name: source ? revisionName(source, state.entries) : availableName('나의 손글씨', state.entries), baseName: source?.baseName || source?.name || null,
          sourceId: source?.id || null, draft, status: 'draft', createdAt: Date.now() }
        await persist([...state.entries, value]); return value.id
      }).catch(report)
    },
    saveDraft: (id, draft, name) => transact(async () => {
      if (entry(id).status !== 'draft') throw new Error('확정된 입력은 수정할 수 없어요.')
      validateDraft(draft)
      snapshots.delete(id)
      return update(id, { draft: copy(draft), name: labelOf(name), preview: null })
    }).catch(report),
    // 작성 중(아직 생성을 확정하지 않은) 폰트만 지운다. 생성 중 · 완료된 폰트는 생성 취소 · 폰트 관리 쪽에서 다룬다
    removeDraft: id => transact(async () => {
      if (entry(id).status !== 'draft') throw new Error('작성 중인 폰트만 지울 수 있어요.')
      snapshots.delete(id)
      await persist(state.entries.filter(e => e.id !== id))
    }).catch(report),
    rename: (id, name) => transact(async () => {
      const value = entry(id), label = labelOf(name)
      if (state.entries.some(e => e.id !== id && e.name === label)) throw new Error('같은 이름의 폰트가 있어요.')
      if (value.fontId) { await repository.renameFont(value.fontId, label); await onFontsChanged() }
      return update(id, { name: label, ...(!value.sourceId && { baseName: label }) })
    }).catch(report),
    preview(id) {
      if (previewTask) return Promise.reject(new Error('샘플을 만들고 있어요. 잠시 기다려 주세요.'))
      previewTask = transact(async () => {
        requireSupport()
        const value = entry(id)
        if (value.status !== 'draft') throw new Error('작성 중인 입력만 미리볼 수 있어요.')
        validateDraft(value.draft, true)
        emit({ previewing: true })
        try {
          const active = state.entries.find(e => e.status === 'processing')
          if (active) await stopAndWait(active, 'preview')
          if (!foreground) throw new Error('앱으로 돌아온 뒤 샘플을 다시 확인해 주세요.')
          const snapshot = await prepared(entry(id)), preview = await engine.preview(snapshot)
          return await update(id, { preview, previewHash: snapshot.inputHash })
        } finally { emit({ previewing: false }); await pump() }
      }).catch(report).finally(() => { previewTask = null })
      return previewTask
    },
    confirm: id => transact(async () => {
      requireSupport()
      const value = entry(id)
      if (value.status !== 'draft') return id
      validateDraft(value.draft, true)
      const snapshot = await prepared(value)
      if (!value.preview || value.previewHash !== snapshot.inputHash) throw new Error('수정한 입력의 샘플을 먼저 확인해 주세요.')
      await update(id, { status: 'queued', queueOrder: nextQueueOrder(), name: availableName(value.name, state.entries.filter(e => e.id !== id)), baseName: value.baseName || value.name, inputHash: snapshot.inputHash })
      await pump(); return id
    }).catch(report),
    control: (id, action) => transact(async () => {
      const value = entry(id)
      if (action === 'pause') {
        if (value.status === 'processing') await stopAndWait(value, 'manual')
        else if (value.status === 'queued') await update(id, { status: 'paused', pauseReason: 'manual' })
      } else if (action === 'resume') {
        if (value.incompatible) throw new Error(value.error)
        if (!['failed', 'paused'].includes(value.status)) return
        await update(id, { status: 'queued', queueOrder: nextQueueOrder(), pauseReason: null, error: null })
      } else if (action === 'cancel' && !['ready', 'cancelled', 'draft'].includes(value.status)) {
        if (value.status === 'processing') await stopAndWait(value, 'cancel')
        if (entry(id).status === 'ready') return
        if (value.jobId) await engine.control('cancel', value.jobId)
        await update(id, { status: 'cancelled', pauseReason: null })
      }
      await pump()
    }).catch(report),
    setForeground(active) {
      foreground = active
      return transact(async () => {
        if (!active) {
          const value = state.entries.find(e => e.status === 'processing')
          if (value) await stopAndWait(value, 'background')
        } else await pump()
      }).catch(report)
    },
    refresh: () => transact(async () => {
      await persist(await repository.load(state.entries)); await onFontsChanged()
    }).catch(report),
    flush: () => serial,
  }
}

// 폰트 항목 상태 이름(제작 화면 목록 · 공방 폰트 목록 공용)
export const statusText = { draft: '작성 중', queued: '생성 대기', processing: '생성 중', paused: '일시 정지', registering: '폰트 저장 중', ready: '생성 완료', failed: '생성 실패', cancelled: '생성 취소' }
export function queuePosition(entries, id) {
  const waiting = waitingEntries(entries)
  const index = waiting.findIndex(e => e.id === id)
  return index < 0 ? null : index + 1
}
export const completedCount = entry => Math.max(0, Math.min(SYLLABLE_COUNT, entry.job?.completed || 0))
// 쓴 손글씨 글자 수(36자 중)
export const draftCount = entry => PROMPTS.filter(c => entry.draft?.samples?.[c]?.strokes?.length).length
// 아무것도 쓰지 않은 새 폰트(고쳐 쓰는 폰트가 아닌 작성 중 항목). 이런 항목은 나갈 때 저장하지 않고 지운다
export const isEmptyDraft = entry => entry.status === 'draft' && !entry.sourceId && draftCount(entry) === 0
// 목록 한 줄의 상태 문구: 작성 중은 '12 / 36 작성 중', 생성 중은 '생성 중 · 1,200 / 11,172', 대기는 순번
export function listStatus(entries, entry) {
  if (entry.status === 'queued') return `대기 ${queuePosition(entries, entry.id)}번째`
  if (entry.status === 'draft') return `${draftCount(entry)} / ${PROMPTS.length} ${statusText.draft}`
  if (entry.status === 'processing') return `${statusText.processing} · ${completedCount(entry).toLocaleString()} / ${SYLLABLE_COUNT.toLocaleString()}`
  return statusText[entry.status] || '상태 확인 중'
}
