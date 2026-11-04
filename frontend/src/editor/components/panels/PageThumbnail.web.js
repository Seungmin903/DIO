import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { PixelRatio, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import StaticPage from '../canvas/StaticPage'
import PageObject from '../canvas/PageObject'
import PageBackground from '../PageBackground'
import { TextMeasure, objectDrawOpacity } from '../canvas/ObjectView'
import { pageSize } from '../../utils/pageGeometry.js'
import { createCompletedStrokePlanner } from '../../utils/completedStrokePlan.js'
import { createStrokeRasterQueue } from '../../utils/strokeRasterQueue.js'
import { rasterizeStrokeBatch } from '../../utils/webStrokeRaster.js'
import { rememberStrokeThumbnail, strokeThumbnails } from '../../utils/strokeThumbnailRaster.web.js'
import { useSkiaRuntime } from '../../skia/skiaRuntime'
import { isSkiaPencil } from '../../skia/pencilRaster.js'

function report(details) {
  window.__DIO_PEN_QA_REPORT__?.({ type: 'page-thumbnail', ...window.__DIO_PERF_CASE__, ...details })
}

// skia: CanvasKit 로딩이 끝났으면 연필은 묶음에 넣지 않고 획마다 앱과 같은 Skia 그림(PencilSkiaStroke.web)으로 둔다
function thumbnailLayers(objects, width, height, skia) {
  const visible = objects.filter(object => !object.hidden), layers = []
  const plan = createCompletedStrokePlanner({ batchSize: 2, minBatchSize: 1 })
  for (let index = 0; index < visible.length;) {
    const object = visible[index]
    if (object.type !== 'stroke' || (skia && isSkiaPencil(object))) { layers.push({ object }); index++; continue }
    const cached = strokeThumbnails.get(visible, index, width, height)
    if (cached) { layers.push({ batch: cached.batch, cached }); index += cached.batch.objects.length; continue }
    const group = [object]; index++
    while (index < visible.length && visible[index].type === 'stroke' && !(skia && isSkiaPencil(visible[index])) && group.length < 2 && !strokeThumbnails.get(visible, index, width, height)) group.push(visible[index++])
    const planned = plan(group, { width, height, zoom: 256 / width, pixelRatio: 1 })
    if (planned.some(layer => ![layer.batch.left, layer.batch.top, layer.batch.w, layer.batch.h].every(Number.isFinite))) layers.push(...group.map(object => ({ object })))
    else layers.push(...planned)
  }
  let remainingPixels = 1024 * 1024
  return layers.map(layer => {
    if (!layer.batch) return layer
    const pixels = Math.max(1, Math.ceil(layer.batch.w * 256 / width)) * Math.max(1, Math.ceil(layer.batch.h * 256 / width))
    const cacheable = pixels <= remainingPixels
    if (cacheable) remainingPixels -= pixels
    return { ...layer, cached: cacheable ? layer.cached : null, cacheable }
  })
}

const ThumbnailBatch = memo(function ThumbnailBatch({ layer, zoom, queue, onMetrics }) {
  const { batch } = layer
  const source = useRef(null), target = useRef(null), job = useRef(null), mounted = useRef(false)
  const [result, setResult] = useState(null), [building, setBuilding] = useState(false)
  const stored = result?.ownerBatch === batch ? result : layer.cached
  const current = layer.cacheable === false && stored?.image ? null : stored
  const displayBatch = current?.batch ?? batch
  useLayoutEffect(() => {
    if (!current?.image || !target.current) return
    const canvas = target.current
    try {
      const ratio = Math.min(2, PixelRatio.get())
      canvas.width = Math.max(1, Math.ceil(displayBatch.w * zoom * ratio))
      canvas.height = Math.max(1, Math.ceil(displayBatch.h * zoom * ratio))
      const context = canvas.getContext('2d')
      if (!context) throw Error('Thumbnail copy unavailable')
      const copied = performance.now()
      context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high'
      context.drawImage(current.image, 0, 0, canvas.width, canvas.height)
      onMetrics({ copiedBatches: 1, maxCopyMs: performance.now() - copied })
    } catch { setResult({ batch, ownerBatch: batch, fallback: true }); onMetrics({ fallbackBatches: 1 }) }
  }, [current, zoom])
  useEffect(() => {
    mounted.current = true
    if (layer.cached) return () => { mounted.current = false }
    const cancel = queue.enqueue(() => {
      const cached = strokeThumbnails.get(batch.objects, 0, batch.width, batch.height)
      if (cached && cached.batch.objects.length === batch.objects.length) { onMetrics({ lateReusedBatches: 1 }); setResult({ ...cached, ownerBatch: batch }); return }
      let finish
      const work = { cancelled: false, started: performance.now(), done: new Promise(resolve => { finish = resolve }), finish: () => finish(), task: null }
      job.current = work; setBuilding(true)
      return { done: work.done, cancel() {
        work.cancelled = true; work.task?.cancel(); finish()
        if (job.current === work) job.current = null
        if (mounted.current) setBuilding(false)
      } }
    })
    return () => { mounted.current = false; cancel() }
  }, [batch, queue, layer.cached, layer.cacheable])
  useLayoutEffect(() => {
    const work = job.current
    if (!building || !source.current || !work || work.cancelled || work.task) return
    const fail = error => {
      if (!work.cancelled && mounted.current) {
        setResult({ batch, ownerBatch: batch, fallback: true })
        onMetrics({ fallbackBatches: 1 })
      }
      work.finish()
    }
    try {
      if (!layer.cacheable) { setResult({ batch, ownerBatch: batch, fallback: true }); onMetrics({ budgetFallbackBatches: 1 }); work.finish(); return }
      const canvas = document.createElement('canvas')
      const sourceCommitMs = performance.now() - work.started
      work.task = rasterizeStrokeBatch(source.current, canvas, batch, 256 / batch.width, 1)
      work.task.done.then(() => {
        if (work.cancelled || !mounted.current) return
        const cached = rememberStrokeThumbnail(batch, canvas)
        if (!cached) throw Error('Thumbnail cache unavailable')
        onMetrics({ generatedBatches: 1, maxSourceCommitMs: sourceCommitMs,
          maxCloneMs: work.task.metrics.cloneJsMs ?? 0, maxSerializeMs: work.task.metrics.serializeJsMs ?? 0,
          maxImageWaitMs: work.task.metrics.imageWaitMs ?? 0, maxDrawMs: work.task.metrics.drawJsMs ?? 0 })
        setResult({ ...cached, ownerBatch: batch }); setBuilding(false); work.finish()
      }).catch(fail)
    } catch (error) { fail(error) }
  }, [building, batch])
  const fallback = current?.fallback
  return <View pointerEvents="none" style={{ position: 'absolute', left: displayBatch.left * zoom, top: displayBatch.top * zoom, width: displayBatch.w * zoom, height: displayBatch.h * zoom, overflow: 'hidden' }}>
    {current && !fallback && <canvas data-dio-thumbnail="true" ref={target} style={{ width: '100%', height: '100%', position: 'absolute', left: 0, top: 0, display: 'block' }} />}
    {/* The SVG is a serialization source, not a second visible preview. Keep its
        layout for extraction but avoid painting it before the bitmap is ready. */}
    {(!current && building || fallback) && <View ref={source} dataSet={fallback ? { dioThumbnailFallback: 'true' } : undefined} style={{ width: '100%', height: '100%', visibility: fallback ? 'visible' : 'hidden' }}>
      {batch.objects.map(object => <PageObject key={object.id} object={object} zoom={zoom} originX={batch.left} originY={batch.top} opacity={objectDrawOpacity(object)} still />)}
    </View>}
  </View>
})

function CachedThumbnail({ page, zoom, showBackground }) {
  const { width, height } = pageSize(page)
  const { runtime: skia } = useSkiaRuntime(page.objects.some(isSkiaPencil))
  const planned = useMemo(() => { const started = performance.now(); return { layers: thumbnailLayers(page.objects, width, height, skia), planMs: performance.now() - started } }, [page.objects, width, height, skia])
  const layers = planned.layers
  const batchMetrics = useMemo(() => ({}), [layers])
  const onMetrics = useMemo(() => value => {
    for (const [key, amount] of Object.entries(value)) batchMetrics[key] = key.startsWith('max') ? Math.max(batchMetrics[key] ?? 0, amount) : (batchMetrics[key] ?? 0) + amount
  }, [batchMetrics])
  const queue = useRef(null), root = useRef(null)
  // Let panel layout/viewport resizing settle before mounting precise sources.
  // Leave a frame between jobs rather than competing with the editor queue.
  if (!queue.current) queue.current = createStrokeRasterQueue({ idleMs: 700, minGapMs: 32 })
  const [pending, setPending] = useState(false)
  useEffect(() => {
    const work = queue.current, pointers = new Set()
    const down = event => { pointers.add(event.pointerId); work.pause() }
    const end = event => { pointers.delete(event.pointerId); if (!pointers.size && !document.hidden) work.resume() }
    const visibility = () => { pointers.clear(); if (document.hidden) work.pause(); else work.resume() }
    const blur = () => { pointers.clear(); work.pause() }
    window.addEventListener('pointerdown', down, true); window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true)
    document.addEventListener('visibilitychange', visibility); work.resume()
    window.addEventListener('blur', blur); window.addEventListener('focus', visibility)
    return () => {
      window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true)
      document.removeEventListener('visibilitychange', visibility); work.clear()
      window.removeEventListener('blur', blur); window.removeEventListener('focus', visibility)
    }
  }, [])
  useEffect(() => {
    const started = performance.now()
    report({ stage: 'plan', planMs: planned.planMs, strokes: page.objects.filter(o => o.type === 'stroke').length, reusedBatches: layers.filter(l => l.cached).length, pendingBatches: layers.filter(l => l.batch && !l.cached).length })
    const inspect = () => {
      const ready = root.current?.querySelectorAll('canvas[data-dio-thumbnail]').length ?? 0
      const fallback = root.current?.querySelectorAll('[data-dio-thumbnail-fallback="true"]').length ?? 0
      const expected = layers.filter(layer => layer.batch).length
      setPending(ready + fallback < expected)
      if (ready + fallback === expected) { report({ stage: 'ready', batches: ready, fallbackBatches: fallback, plannedReusedBatches: layers.filter(l => l.cached).length, cacheEntries: strokeThumbnails.stats().entries, cachePixels: strokeThumbnails.stats().pixels, elapsedMs: performance.now() - started, ...batchMetrics }); return true }
      return false
    }
    if (inspect()) return
    const timer = setInterval(() => { if (inspect()) clearInterval(timer) }, 250)
    return () => clearInterval(timer)
  }, [layers])
  return <View ref={root} style={{ width: width * zoom, height: height * zoom, backgroundColor: colors.surface, overflow: 'hidden' }} pointerEvents="none">
    {showBackground && <PageBackground page={page} zoom={zoom} compact />}
    <TextMeasure.Provider value={null}>{layers.map(layer => layer.object
      ? <PageObject key={layer.object.id} object={layer.object} zoom={zoom} opacity={objectDrawOpacity(layer.object)} still />
      : <ThumbnailBatch key={layer.batch.objects[0].id} layer={layer} zoom={zoom} queue={queue.current} onMetrics={onMetrics} />)}</TextMeasure.Provider>
    {pending && <View style={{ position: 'absolute', bottom: 2, left: 2, right: 2, backgroundColor: colors.surfaceMuted }}><Text style={{ color: colors.textMuted, fontSize: 9 }}>미리보기 준비 중</Text></View>}
  </View>
}

export default memo(function PageThumbnail(props) {
  // Small pages and crop overlays retain the original renderer. Media/text stay
  // in their original stacking order even on heavy mixed pages.
  const strokes = props.page.objects.filter(object => object.type === 'stroke' && !object.hidden)
  return props.cropId || strokes.length < 64 && strokes.reduce((n, object) => n + (object.points?.length ?? 0), 0) < 8192
    ? <StaticPage {...props} /> : <CachedThumbnail {...props} />
})
