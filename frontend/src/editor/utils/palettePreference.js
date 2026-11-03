// Fixed-slot palette storage. Old custom-color collections are deliberately not read.
export function createPalettePreference(storage, key, defaults, normalize) {
  let snapshot = { colors: defaults, loaded: false, edited: false }, loading, writes = Promise.resolve()
  const clean = value => typeof value === 'string' ? normalize(value) : null
  const listeners = new Set()
  const publish = (colors, loaded = true) => {
    snapshot = { colors, loaded, edited: JSON.stringify(colors) !== JSON.stringify(defaults) }
    listeners.forEach(fn => fn())
  }
  const load = () => loading ??= Promise.resolve().then(() => storage.getItem(key)).then(raw => {
    let parsed
    try { parsed = raw ? JSON.parse(raw) : null } catch { parsed = null }
    // Restore the original number of slots; legacy shortened lists keep their prefix.
    const list = defaults.map((value, i) => clean(parsed?.[i]) ?? value)
    publish(list)
  }).catch(error => { loading = undefined; throw error })
  const enqueue = work => { const next = writes.catch(() => {}).then(work); writes = next; return next }
  return {
    getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, load,
    replace(index, value) {
      return enqueue(async () => {
        await load()
        const color = clean(value)
        if (!Number.isInteger(index) || index < 0 || index >= defaults.length || !color) throw Error('팔레트 색을 확인해 주세요.')
        const next = snapshot.colors.map((old, i) => i === index ? color : old)
        await storage.setItem(key, JSON.stringify(next))
        publish(next)
      })
    },
    reset() { return enqueue(async () => { await load(); await storage.removeItem(key); publish(defaults) }) },
  }
}
