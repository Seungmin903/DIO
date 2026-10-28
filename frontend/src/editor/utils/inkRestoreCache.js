// Exact geometry reuse for immutable completed stroke objects, bounded by characters/count.
export function createInkRestoreCache({ maxChars = 2_000_000, maxEntries = 32 } = {}) {
  const entries = new Map(), seen = new WeakSet()
  let chars = 0
  return {
    get(object, build, priority = 0) {
      const previous = entries.get(object)
      if (previous) { entries.delete(object); entries.set(object, previous); return { paths: previous.paths, hit: true, reason: 'hit' } }
      const repeated = seen.has(object)
      const paths = build(), size = paths.reduce((n, p) => n + p.length, 0)
      seen.add(object)
      if (size > maxChars || maxEntries <= 0) return { paths, hit: false, reason: 'oversize-or-disabled' }
      // Do not let a repeated sequential miss evict the survivors of the last scan.
      if (repeated) return { paths, hit: false, reason: 'repeat-miss-bypass' }
      if (size <= maxChars && maxEntries > 0) {
        while (entries.size && (chars + size > maxChars || entries.size >= maxEntries)) {
          const candidate = [...entries].find(([, entry]) => entry.priority <= priority)
          if (!candidate) return { paths, hit: false, reason: 'protected-budget' }
          const [key, value] = candidate
          chars -= value.size; entries.delete(key)
        }
        entries.set(object, { paths, size, priority }); chars += size
      }
      return { paths, hit: false, reason: 'built-and-stored' }
    },
    stats: () => ({ entries: entries.size, chars }),
  }
}
