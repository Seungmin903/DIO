// QA-only deterministic hold: zero or a limited number of completed batches.
export function createCachePreparationGate(limit = 0) {
  let completed = 0, released = false
  const listeners = new Set()
  return {
    canStart: () => released || completed < limit,
    complete() { completed++ },
    release() { released = true; for (const listener of listeners) listener() },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    snapshot: () => ({ limit, completed, released }),
  }
}
