import { createInkRestoreCache } from './inkRestoreCache.js'
import { strokeInkLayers, inkLevels } from './penInk.js'
import { compareStrokeAlpha } from './strokePixelAudit.js'
const exactInkCache = createInkRestoreCache()
const SVG_NS = 'http://www.w3.org/2000/svg'

function referencePixels(svg, width, height) {
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
  const image = new Image()
  let rejectTask, settled = false
  const cleanup = () => { URL.revokeObjectURL(url); image.onload = image.onerror = null }
  const done = new Promise((resolve, reject) => {
    rejectTask = reject
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw Error('Reference canvas unavailable')
        context.drawImage(image, 0, 0, width, height)
        const pixels = context.getImageData(0, 0, width, height).data
        canvas.width = canvas.height = 0
        settled = true; cleanup(); resolve(pixels)
      } catch (error) { settled = true; cleanup(); reject(error) }
    }
    image.onerror = () => { settled = true; cleanup(); reject(Error('Reference SVG failed')) }
    image.src = url
  })
  return { done, cancel() { if (!settled) { settled = true; cleanup(); image.src = ''; rejectTask(Error('Reference cancelled')) } } }
}

// SVG와 같은 내용을 픽셀로 보관한다. 문서 좌표와 재질은 변경하지 않는다.
export function rasterizeStrokeBatch(source, canvas, batch, zoom, pixelRatio, { restoreInk = () => false } = {}) {
  const started = performance.now(), metrics = {}
  const root = document.createElementNS(SVG_NS, 'svg')
  const width = Math.ceil(batch.w * zoom * pixelRatio), height = Math.ceil(batch.h * zoom * pixelRatio)
  root.setAttribute('width', width); root.setAttribute('height', height)
  root.setAttribute('viewBox', `0 0 ${batch.w} ${batch.h}`)
  root.setAttribute('preserveAspectRatio', 'none')
  const originals = source.querySelectorAll('svg')
  if (originals.length !== batch.objects.length) throw Error('Stroke SVG mismatch')
  batch.objects.forEach((object, index) => {
    const group = document.createElementNS(SVG_NS, 'g'), svg = originals[index].cloneNode(true)
    // Deferred erase previews never become low-quality completed caches.
    if (restoreInk(object) && ['fountain', 'brush'].includes(object.penKind) && [2, 3].includes(object.renderVersion)) {
      const restoreStarted = performance.now()
      metrics.restoredInkObjects = (metrics.restoredInkObjects ?? 0) + 1
      const restoreKind = String(object.id).includes('-fragment-') ? 'restoredFragmentObjects' : 'restoredOriginalObjects'
      metrics[restoreKind] = (metrics[restoreKind] ?? 0) + 1
      const geometry = exactInkCache.get(object, () => strokeInkLayers([{ points: object.points, startDistance: object.inkStartDistance ?? 0, continuing: false }], object.strokeWidth, object.penKind, object.renderVersion), String(object.id).includes('-fragment-') ? 1 : 0)
      const paths = geometry.paths
      metrics.restoreInkCacheHits = (metrics.restoreInkCacheHits ?? 0) + Number(geometry.hit)
      metrics.restoreInkCacheMisses = (metrics.restoreInkCacheMisses ?? 0) + Number(!geometry.hit)
      if (!geometry.hit) { metrics.restoreInkCacheMissReasons ??= {}; metrics.restoreInkCacheMissReasons[geometry.reason] = (metrics.restoreInkCacheMissReasons[geometry.reason] ?? 0) + 1 }
      const cacheStats = exactInkCache.stats()
      metrics.restoreInkCacheEntries = cacheStats.entries; metrics.restoreInkCacheChars = cacheStats.chars
      const levels = inkLevels(object.penKind, object.renderVersion)
      while (svg.firstChild) svg.removeChild(svg.firstChild)
      paths.forEach((path, i) => {
        if (!path) return
        const node = document.createElementNS(SVG_NS, 'path')
        node.setAttribute('d', path); node.setAttribute('fill', object.color); node.setAttribute('fill-rule', 'nonzero')
        node.setAttribute('fill-opacity', i === 0 ? levels[0] : (levels[i] - levels[i - 1]) / (1 - levels[i - 1]))
        svg.appendChild(node)
      })
      metrics.restoreInkJsMs = (metrics.restoreInkJsMs ?? 0) + performance.now() - restoreStarted
    }
    const cx = object.w / 2, cy = object.h / 2
    group.setAttribute('transform', `translate(${object.x - batch.left} ${object.y - batch.top}) translate(${cx} ${cy}) rotate(${object.rotation ?? 0}) scale(${object.flipX ? -1 : 1} ${object.flipY ? -1 : 1}) translate(${-cx} ${-cy})`)
    group.setAttribute('opacity', object.opacity ?? 1)
    svg.setAttribute('width', object.w); svg.setAttribute('height', object.h)
    svg.style.width = `${object.w}px`; svg.style.height = `${object.h}px`; svg.style.transform = 'none'
    group.appendChild(svg); root.appendChild(group)
  })
  metrics.cloneJsMs = performance.now() - started
  const serializeStarted = performance.now()
  const serialized = new XMLSerializer().serializeToString(root)
  metrics.serializeJsMs = performance.now() - serializeStarted
  const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }))
  const image = new Image()
  const imageStarted = performance.now()
  let cancelled = false, settle, timeout, auditCancel
  const cleanup = () => { clearTimeout(timeout); URL.revokeObjectURL(url); image.onload = image.onerror = null }
  const done = new Promise((resolve, reject) => {
    settle = resolve
    image.onload = async () => {
      if (cancelled) return
      try {
        metrics.imageWaitMs = performance.now() - imageStarted
        const drawStarted = performance.now()
        canvas.width = width; canvas.height = height
        const context = canvas.getContext('2d')
        if (!context) throw Error('Canvas 2D unavailable')
        context.drawImage(image, 0, 0, width, height)
        metrics.drawJsMs = performance.now() - drawStarted
        // QA에서만 새 필기(시험용 초기 획 제외)를 개별 기준 이미지와 비교한다.
        const audit = typeof window !== 'undefined' && window.__DIO_PEN_QA_REPORT__ && !['cache-ab', 'editor-cache', 'cache-preparation', 'cache-fallback', 'storage-integration', 'large-integration'].includes(window.__DIO_PERF_CASE__?.qaMode)
        const indices = audit ? batch.objects.flatMap((object, index) => String(object.id).startsWith('perf-') ? [] : [index]) : []
        if (indices.length) {
          const auditStarted = performance.now()
          const combined = context.getImageData(0, 0, width, height).data
          metrics.strokeChecks = []
          for (const index of indices) {
            if (cancelled) return
            const isolated = root.cloneNode(false)
            isolated.appendChild(root.children[index].cloneNode(true))
            const task = referencePixels(isolated, width, height); auditCancel = task.cancel
            const pixels = await task.done
            if (cancelled) return
            const check = compareStrokeAlpha(pixels, combined)
            metrics.strokeChecks.push({ ordinal: index, ...check })
          }
          metrics.auditMs = performance.now() - auditStarted
          const missing = metrics.strokeChecks.reduce((sum, check) => sum + check.missingPixels, 0)
          window.__DIO_PEN_QA_REPORT__({ type: 'stroke-raster-audit', ...window.__DIO_PERF_CASE__, checks: metrics.strokeChecks, missingPixels: missing, auditMs: metrics.auditMs })
          if (missing) throw Error('Individual stroke pixels missing; keeping SVG')
        }
        cleanup(); resolve()
      } catch (error) { cleanup(); reject(error) }
    }
    image.onerror = () => { cleanup(); reject(Error('Stroke SVG rasterization failed')) }
    timeout = setTimeout(() => { auditCancel?.(); cleanup(); image.src = ''; reject(Error('Stroke rasterization timed out')) }, 15000)
    image.src = url
  })
  return { done, metrics, get cancelled() { return cancelled }, sourceMarkup: serialized, cancel() { cancelled = true; auditCancel?.(); cleanup(); image.src = ''; settle() } }
}
