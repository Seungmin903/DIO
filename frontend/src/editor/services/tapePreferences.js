// 저장 순서를 보장하고 패널 재마운트 사이에도 마지막 도구 설정을 유지한다.
export function createTapePreferences({ load, save, sizes, palettes, patterns, defaultSize }) {
  const normalize = (value = {}) => ({
    size: sizes.includes(value?.size) ? value.size : defaultSize,
    palette: palettes.includes(value?.palette) || /^custom:#[0-9a-f]{6}:#[0-9a-f]{6}$/i.test(value?.palette ?? '') ? value.palette : null,
    pattern: patterns.includes(value?.pattern) ? value.pattern : null,
  })
  let snapshot = normalize(), loading, loaded = false, queue = Promise.resolve()
  const dirty = new Set(), listeners = new Set()
  const publish = next => { snapshot = Object.freeze(next); listeners.forEach(listener => listener()) }
  const persist = () => {
    const value = snapshot
    queue = queue.then(() => save(value)).then(result => result !== false, () => false)
    return queue
  }
  const ensureLoaded = () => {
    if (!loading) loading = Promise.resolve().then(load).catch(() => null).then(saved => {
      const next = normalize(saved)
      for (const key of dirty) next[key] = snapshot[key]
      publish(next)
      loaded = true
    })
    return loading
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    ensureLoaded,
    update(patch) {
      for (const key of ['size', 'palette', 'pattern']) if (Object.hasOwn(patch, key)) dirty.add(key)
      publish(normalize({ ...snapshot, ...patch }))
      // 첫 조회보다 앞선 입력을 항목별로 우선하고 복원 전 기본값을 저장하지 않는다.
      return loaded ? persist() : ensureLoaded().then(persist)
    },
  }
}
