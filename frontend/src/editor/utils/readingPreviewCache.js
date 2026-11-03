export const READING_PREVIEW_LIMIT = 3
export const READING_PREVIEW_PIXELS = 4 * 1024 * 1024

export function readingPreviewEligible(page, isAnimated = () => false) {
  const animated = object => isAnimated(object) || object.poster || /^data:image\/gif|\.gif(?:[?#]|$)/i.test(object.src ?? '') || object.cells?.some(cell => cell && animated(cell))
  return Boolean(page && !page.planner && page.objects.filter(object => object.type === 'stroke' && !object.hidden).length >= 32
    && !page.objects.some(object => !object.hidden && (object.widget || animated(object))))
}

// No downsampling past display density. Larger zooms retain vector rendering.
export function readingPreviewSpec(page, zoom, pixelRatio = 1) {
  const width = page.canvasWidth ?? 1188, height = page.canvasHeight ?? 840
  const pixelWidth = Math.ceil(width * zoom * pixelRatio), pixelHeight = Math.ceil(height * zoom * pixelRatio)
  if (![pixelWidth, pixelHeight].every(n => Number.isFinite(n) && n > 0 && n <= 4096) || pixelWidth * pixelHeight > READING_PREVIEW_PIXELS) return null
  return { page, width, height, pixelWidth, pixelHeight, key: `${pixelWidth}x${pixelHeight}` }
}
const same = (a, b) => Boolean(a && b && a.page === b.page && a.key === b.key)

// Bounded, sequential, disposable display cache. It never modifies the document.
export function createReadingPreviewCache({ render, warm = async () => {}, onChange = () => {}, delayMs = 150 }) {
  const records = new Map(), failures = new Map()
  let wanted = [], paused = false, active = null, timer = null, closed = false
  const notify = () => onChange()
  const release = record => { try { record?.result.dispose() } catch {} }
  const schedule = () => {
    if (closed || paused || active || timer != null) return
    timer = setTimeout(pump, delayMs)
  }
  const pump = async () => {
    timer = null
    if (closed || paused || active) return
    const spec = wanted.find(spec => !same(records.get(spec.page.id)?.spec, spec) && !same(failures.get(spec.page.id), spec))
    if (!spec) return
    const work = { spec, controller: new AbortController() }; active = work
    let result
    try {
      result = await render(spec, { signal: work.controller.signal })
      let warmTimer, abortWarm
      try {
        await Promise.race([warm(result.uri), new Promise((_, reject) => {
          warmTimer = setTimeout(() => reject(Error('Preview image timeout')), 1500)
          abortWarm = () => reject(Error('Preview cancelled'))
          work.controller.signal.addEventListener('abort', abortWarm, { once: true })
          if (work.controller.signal.aborted) abortWarm()
        })])
      } finally { clearTimeout(warmTimer); work.controller.signal.removeEventListener('abort', abortWarm) }
      if (closed || work.controller.signal.aborted || !wanted.some(next => same(next, spec))) { release({ result }); return }
      release(records.get(spec.page.id))
      records.set(spec.page.id, { spec, result }); result = null; notify()
    } catch (error) {
      if (!work.controller.signal.aborted && !closed && error?.code !== 'EXPORT_BUSY') failures.set(spec.page.id, spec)
      if (result) release({ result })
    } finally { if (active === work) active = null; schedule() }
  }
  return {
    update(specs, suspend = false) {
      if (closed) return
      wanted = specs.filter((spec, i, list) => spec && list.findIndex(item => item?.page.id === spec.page.id) === i).slice(0, READING_PREVIEW_LIMIT)
      paused = suspend
      if (timer != null) { clearTimeout(timer); timer = null }
      let changed = false
      for (const [id, record] of records) if (!wanted.some(spec => same(spec, record.spec))) { records.delete(id); release(record); changed = true }
      for (const [id, spec] of failures) if (!wanted.some(next => same(next, spec))) failures.delete(id)
      if (active && (paused || !wanted.some(spec => same(spec, active.spec)))) active.controller.abort()
      if (changed) notify()
      schedule()
    },
    get(spec) { const record = spec && records.get(spec.page.id); return same(record?.spec, spec) ? record.result : null },
    stats: () => ({ pages: records.size, pixels: [...records.values()].reduce((total, item) => total + item.spec.pixelWidth * item.spec.pixelHeight, 0), active: active?.spec.page.id ?? null }),
    clear() {
      wanted = []; failures.clear(); active?.controller.abort()
      if (timer != null) { clearTimeout(timer); timer = null }
      for (const record of records.values()) release(record)
      const changed = records.size > 0; records.clear(); if (changed) notify()
    },
    dispose() { closed = true; this.clear() },
  }
}
