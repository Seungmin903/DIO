// Only a fixed-size commit pointer lives in AsyncStorage. Large immutable records
// live in document files (native) or IndexedDB (web), outside its row/DB limits.
export const WORKFLOW_POINTER_KEY = 'dio-handwriting-workflow-v3'
const copy = value => JSON.parse(JSON.stringify(value))
export function createWorkflowPersistence({ storage, blobs, uuid }) {
  let serial = Promise.resolve(), current = null, loaded = false
  const run = task => { const next = serial.then(() => blobs.withLock ? blobs.withLock(task) : task()); serial = next.catch(() => {}); return next }
  const remove = refs => Promise.all([...refs].map(ref => blobs.remove(ref).catch(() => {})))
  const read = async () => {
    const text = await storage.getItem(WORKFLOW_POINTER_KEY)
    if (!text) { loaded = true; current = null; return null }
    const pointer = JSON.parse(text)
    if (pointer.schema !== 3 || typeof pointer.index !== 'string') throw new Error('폰트 작업 목록을 읽을 수 없어요. 기존 데이터는 보존되어 있어요.')
    if (loaded && current?.ref === pointer.index) return copy(current.entries)
    const index = JSON.parse(await blobs.read(pointer.index))
    if (index.schema !== 3 || !Array.isArray(index.records)) throw new Error('폰트 작업 목록이 손상됐어요. 기존 데이터는 보존되어 있어요.')
    const cache = new Map(), entries = []
    for (const record of index.records) {
      if (typeof record.payload !== 'string' || !record.value?.id || cache.has(record.value.id)) throw new Error('폰트 작업 항목을 읽을 수 없어요.')
      const text = await blobs.read(record.payload), data = JSON.parse(text)
      entries.push({ ...record.value, ...data })
      cache.set(record.value.id, { ref: record.payload, text })
    }
    current = { ref: pointer.index, entries, cache }; loaded = true
    await blobs.prune?.(new Set([current.ref, ...[...cache.values()].map(p => p.ref)])).catch(() => {})
    return copy(entries)
  }
  return {
    load: () => run(read),
    save(entries) {
      // Capture before awaiting, even if the caller reuses/mutates its objects.
      const snapshot = copy(entries)
      return run(async () => {
        if (!loaded) await read()
        const previous = current, cache = new Map(), records = [], created = new Set()
        let commitAttempted = false
        try {
          for (const entry of snapshot) {
            if (!entry.id || cache.has(entry.id)) throw new Error('폰트 작업 ID가 올바르지 않아요.')
            const { draft, preview, ...value } = entry
            const text = JSON.stringify({ ...(draft !== undefined && { draft }), ...(preview !== undefined && { preview }) })
            let payload = previous?.cache.get(entry.id)
            if (!payload || payload.text !== text) {
              payload = { ref: uuid(), text }; created.add(payload.ref)
              await blobs.write(payload.ref, text)
            }
            cache.set(entry.id, payload); records.push({ value, payload: payload.ref })
          }
          const ref = uuid(); created.add(ref)
          await blobs.write(ref, JSON.stringify({ schema: 3, records }))
          // Publish only after all referenced data is durable. A failed commit
          // keeps both generations: a platform may have committed before rejecting.
          commitAttempted = true
          await storage.setItem(WORKFLOW_POINTER_KEY, JSON.stringify({ schema: 3, index: ref }))
          current = { ref, entries: snapshot, cache }
          const retained = new Set([...cache.values()].map(p => p.ref))
          const obsolete = new Set(previous ? [previous.ref, ...[...previous.cache.values()].map(p => p.ref).filter(r => !retained.has(r))] : [])
          await remove(obsolete)
          await blobs.prune?.(new Set([ref, ...retained])).catch(() => {})
        } catch (error) {
          if (!commitAttempted) await remove(created)
          // A subsequent attempt must reread the pointer after an uncertain commit.
          loaded = false
          throw error
        }
      })
    },
  }
}
