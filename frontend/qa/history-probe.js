// QA-only: synchronous stage ownership, then wait for an actual editor layout commit.
export function createHistoryProbe({ getController, timeoutMs = 5000 }) {
  let stage = 'waiting', pending = null, executions = 0
  const finish = (error, snapshot) => {
    const request = pending
    if (!request) return
    pending = null; clearTimeout(request.timer)
    if (error) { stage = 'error'; request.reject(error); return }
    const direction = request.phase === 'undo' ? -1 : 1
    const oneStep = snapshot.past === request.before.past + direction && snapshot.future === request.before.future - direction
    stage = oneStep ? (request.phase === 'undo' ? 'undone' : 'erased') : 'error'
    request.resolve({ ...snapshot, requestId: request.id, phase: request.phase, executions, oneStep,
      beforePast: request.before.past, beforeFuture: request.before.future })
  }
  return {
    prime() { if (!pending) stage = 'erased' },
    reset() { if (pending) finish(Error('QA condition changed')); stage = 'waiting' },
    getStage: () => stage,
    getRequestId: () => pending?.id ?? null,
    commit(snapshot) { if (pending && snapshot.doc !== pending.before.doc) finish(null, snapshot) },
    run(phase, id) {
      const before = getController()
      if (pending || !before || (phase === 'undo' ? stage !== 'erased' || !before.past : stage !== 'undone' || !before.future)) return null
      stage = 'busy'
      return new Promise((resolve, reject) => {
        pending = { phase, id, before, resolve, reject, timer: setTimeout(() => finish(Error('Editor commit timeout')), timeoutMs) }
        executions++
        try { before[phase]() } catch (error) { finish(error) }
      })
    },
  }
}
