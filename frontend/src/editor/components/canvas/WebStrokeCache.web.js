import { memo, useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio, View } from 'react-native'
import { createCompletedStrokePlanner } from '../../utils/completedStrokePlan.js'
import { rasterizeStrokeBatch } from '../../utils/webStrokeRaster.js'
import { createStrokeRasterQueue } from '../../utils/strokeRasterQueue.js'
import { reusableStrokeRaster } from '../../utils/reusableStrokeRaster.js'
import { objectDrawOpacity, TextMeasure } from './ObjectView'
import PageObject from './PageObject'
import { WebStrokeCachePreparation } from './WebStrokeCacheContext'
import { rememberStrokeThumbnail } from '../../utils/strokeThumbnailRaster.web.js'
import { useSkiaRuntime } from '../../skia/skiaRuntime'
import { isSkiaPencil } from '../../skia/pencilRaster.js'

const Batch = memo(function Batch({ batch, zoom, rasterize, queue, areaPreviewObjects, deferredAreaObjects, areaErasing }) {
  const preparation = useContext(WebStrokeCachePreparation)
  const source = useRef(null), buffers = useRef([null, null]), saved = useRef(null)
  const [ready, setReady] = useState(null), [failed, setFailed] = useState(null)
  const retained = rasterize && reusableStrokeRaster(ready?.batch, batch)
    && !(failed?.batch === batch && failed.zoom === zoom)
  const displayed = retained ? ready : null
  const displayBatch = displayed?.batch ?? batch
  // An invalidated batch also contains untouched neighbours. Avoid mounting their
  // full material layers during the gesture; restore all of them before caching.
  const erasingBatch = areaErasing && batch.objects.some(object => areaPreviewObjects?.has(object))
  if (!displayed && (rasterize || erasingBatch)) for (const object of batch.objects) deferredAreaObjects?.add(object)
  useEffect(() => () => { for (const node of buffers.current) if (node) { node.width = 0; node.height = 0 } }, [])
  useEffect(() => {
    if (!ready) return
    const old = buffers.current[1 - ready.index]
    if (old) { old.width = 0; old.height = 0 }
  }, [ready])
  useEffect(() => {
    if (!rasterize) {
      if (!areaErasing) for (const object of batch.objects) deferredAreaObjects?.delete(object)
      saved.current = null; setReady(null)
      for (const node of buffers.current) if (node) { node.width = 0; node.height = 0 }
      return
    }
    let cancelled = false
    setFailed(null)
    const queued = performance.now()
    const cancel = queue.enqueue(() => {
      const started = performance.now(), previous = saved.current
      const index = previous ? 1 - previous.index : 0, target = buffers.current[index]
      let task
      const failure = error => {
        if (cancelled) return
        if (target) { target.width = 0; target.height = 0 }
        setFailed({ batch, zoom })
        window.__DIO_PEN_QA_REPORT__?.({ type: 'raster-error', ...window.__DIO_PERF_CASE__, expected: error.code === 'QA_RASTER_FAILURE', message: String(error.message).slice(0, 200) })
      }
      try {
        if (preparation?.faultMode === 'failure') throw Object.assign(new Error('QA injected raster failure'), { code: 'QA_RASTER_FAILURE' })
        // Parse retained SVG only when the idle queue starts, outside the displayed DOM.
        // Existing pixels stay visible until the second buffer is completely ready.
        const original = reusableStrokeRaster(previous?.batch, batch)
          ? new DOMParser().parseFromString(previous.markup, 'image/svg+xml').documentElement : source.current
        if (!original || !target) throw Error('Stroke source unavailable')
        task = rasterizeStrokeBatch(original, target, batch, zoom, PixelRatio.get(), { restoreInk: object => Boolean(deferredAreaObjects?.has(object)) })
      } catch (error) { failure(error); return }
      task.done.then(() => {
        if (cancelled || task.cancelled) return
        const next = { batch, zoom, index, markup: task.sourceMarkup }
        for (const object of batch.objects) deferredAreaObjects?.delete(object)
        saved.current = next; setReady(next)
        const thumbnailStarted = performance.now()
        const thumbnail = rememberStrokeThumbnail(batch, target)
        const thumbnailCopyMs = performance.now() - thumbnailStarted
        preparation?.complete()
        window.__DIO_PEN_QA_REPORT__?.({ type: 'raster-ready', ...window.__DIO_PERF_CASE__,
          strokes: batch.objects.length, buildMs: performance.now() - started,
          queueWaitMs: started - queued, ...task.metrics, reusedSource: Boolean(previous && reusableStrokeRaster(previous.batch, batch)),
          thumbnailCopyMs, thumbnailAvailable: Boolean(thumbnail),
          pixels: target.width * target.height })
      }).catch(failure)
      return task
    })
    return () => { cancelled = true; cancel() }
  }, [batch, zoom, rasterize, queue])
  return <View pointerEvents="none" style={{ position: 'absolute', left: displayBatch.left * zoom, top: displayBatch.top * zoom,
    width: displayBatch.w * zoom, height: displayBatch.h * zoom, overflow: 'hidden' }}>
    {[0, 1].map(index => <canvas key={index} ref={node => { buffers.current[index] = node }}
      data-dio-stroke-cache="true" data-dio-cache-strokes={batch.objects.length}
      data-dio-cache-ready={Boolean(displayed && displayed.index === index)}
      data-dio-cache-eligible={rasterize && (!displayed || displayed.index === index)} aria-hidden="true"
      style={{ position: 'absolute', width: '100%', height: '100%', display: displayed?.index === index ? 'block' : 'none' }} />)}
    {!displayed && <View ref={source} pointerEvents="none" style={{ width: '100%', height: '100%' }}>
      <TextMeasure.Provider value={null}>
        {batch.objects.map(object => <PageObject key={object.id} object={object} zoom={zoom} areaPreview={erasingBatch || (Boolean(deferredAreaObjects?.has(object)) && rasterize && !(failed?.batch === batch && failed.zoom === zoom))}
          originX={batch.left} originY={batch.top} opacity={objectDrawOpacity(object)} still />)}
      </TextMeasure.Provider>
    </View>}
  </View>
}, (a, b) => a.batch === b.batch && a.zoom === b.zoom && a.rasterize === b.rasterize && a.areaErasing === b.areaErasing && a.queue === b.queue
  && a.batch.objects.every(object => Boolean(a.areaPreviewObjects?.has(object)) === Boolean(b.areaPreviewObjects?.has(object))))

export default function WebStrokeCache({ objects, width, height, zoom, renderObject, areaPreviewObjects = null, areaErasing = false, deferredAreaObjects = null }) {
  const preparation = useContext(WebStrokeCachePreparation), gate = useRef(null)
  gate.current = preparation
  const planner = useRef(null), queue = useRef(null)
  // 연필은 앱과 같은 Skia 그림이라 SVG 묶음 굽기(rasterizeStrokeBatch)에 넣지 않고 획마다 캔버스로 둔다(PencilSkiaStroke.web).
  // CanvasKit 가 아직 없을 때는 지금처럼 SVG 묶음에 들어갔다가, 로딩이 끝나면 따로 빠진다.
  const hasPencil = objects.some(isSkiaPencil)
  const { runtime: skia } = useSkiaRuntime(hasPencil)
  const exclude = skia ? isSkiaPencil : null
  if (!planner.current) planner.current = createCompletedStrokePlanner({ batchSize: 4, minBatchSize: 1, alignPixels: true, preserveBatches: true })
  if (!queue.current) queue.current = createStrokeRasterQueue({ idleMs: 650, minGapMs: 16, canStart: () => !gate.current || gate.current.canStart() })
  useEffect(() => {
    const work = queue.current, pointers = new Set()
    const down = event => {
      if (!event.target.closest?.('[aria-label$=" 캔버스"]')) return
      pointers.add(event.pointerId); work.pause()
    }
    const end = event => {
      if (!pointers.delete(event.pointerId)) return
      if (!pointers.size && !document.hidden) work.resume()
    }
    const blur = () => { pointers.clear(); work.pause() }
    const visible = () => { if (document.hidden || pointers.size) work.pause(); else work.resume() }
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    window.addEventListener('blur', blur)
    window.addEventListener('focus', visible)
    document.addEventListener('visibilitychange', visible)
    const unsubscribe = preparation?.subscribe(visible)
    visible()
    return () => {
      unsubscribe?.()
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
      window.removeEventListener('blur', blur)
      window.removeEventListener('focus', visible)
      document.removeEventListener('visibilitychange', visible)
      work.clear()
    }
  }, [])
  const layers = planner.current(objects, { width, height, zoom, pixelRatio: PixelRatio.get(), pixelBudget: preparation?.pixelBudget, exclude })
  useEffect(() => {
    if (preparation?.faultMode !== 'budget') return
    window.__DIO_PEN_QA_REPORT__?.({ type: 'fallback-plan', ...window.__DIO_PERF_CASE__, pixelBudget: preparation.pixelBudget, skippedBatches: layers.filter(layer => layer.batch && !layer.rasterize).length })
  }, [objects, width, height, zoom, preparation])
  return layers.map(layer => layer.batch
    ? <Batch key={layer.batch.objects[0].id} batch={layer.batch} zoom={zoom} rasterize={layer.rasterize && !(areaErasing && layer.batch.objects.some(object => areaPreviewObjects?.has(object)))} areaPreviewObjects={areaPreviewObjects} deferredAreaObjects={deferredAreaObjects} areaErasing={areaErasing} queue={queue.current} />
    : renderObject(layer.object))
}
