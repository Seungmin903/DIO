import { createStallDiagnostics } from './stall-diagnostics.js'
import { inputArrivalArea } from './input-arrival.js'

export function cacheDisplay() {
  const root = document.querySelector('[aria-label$=" 캔버스"]')
  const ready = root?.querySelectorAll('canvas[data-dio-cache-ready="true"]').length ?? 0
  const vectors = root?.querySelectorAll('[data-completed-stroke-id]').length ?? 0
  const logicalWidth = window.__DIO_LARGE_LOGICAL_WIDTH__ || 1188
  return { readyCaches: ready, vectorObjects: vectors, zoom: root ? parseFloat(root.style.width) / logicalWidth : null }
}

// Arrival and frame-gap diagnostics contain no coordinates or text.
export function installLargeInputDiagnostics() {
  const diagnostics = createStallDiagnostics(), streams = new Map()
  let frame, sequence = 0
  const report = details => window.__DIO_PEN_QA_REPORT__({ ...window.__DIO_PERF_CASE__, ...details })
  const beat = time => { if (!document.hidden) diagnostics.frame(time); frame = requestAnimationFrame(beat) }
  frame = requestAnimationFrame(beat)
  const down = event => {
    if (event.pointerType !== 'pen') return
    const area = inputArrivalArea(event.target)
    const arrival = { inputTraceId: `large-${window.__DIO_PERF_CASE__.qaSession}-${++sequence}`, started: performance.now(), area, pointerType: event.pointerType }
    const age = arrival.started - event.timeStamp
    arrival.downEventAgeMs = age >= 0 && age < 60000 ? age : null
    window.__DIO_INPUT_ARRIVAL__ = arrival
    streams.set(event.pointerId, { arrival, metadata: { ...window.__DIO_PERF_CASE__ }, cache: cacheDisplay() })
    diagnostics.input({ event: 'pointerdown', area, pointerType: event.pointerType, inputTraceId: arrival.inputTraceId })
    if (['pen-input', 'highlighter-input', 'canvas-other'].includes(area)) report({ type: 'large-input-start', inputTraceId: arrival.inputTraceId, area, ...cacheDisplay(), eventAgeMs: arrival.downEventAgeMs })
  }
  const end = event => {
    const stream = streams.get(event.pointerId)
    if (!stream) return
    streams.delete(event.pointerId)
    const a = stream.arrival
    diagnostics.input({ event: event.type, area: a.area, acceptedSequence: a.acceptedSequence, inputTraceId: a.inputTraceId })
    if (['pen-input', 'highlighter-input', 'canvas-other'].includes(a.area)) report({ ...stream.metadata, type: 'large-input-end', inputTraceId: a.inputTraceId,
      area: a.area, acceptedSequence: a.acceptedSequence ?? null, downToAcceptedMs: a.downToAcceptedMs ?? null,
      endedBy: event.type, cacheAtDown: stream.cache, durationMs: performance.now() - a.started })
  }
  const visibility = () => { diagnostics.resetFrame(); if (document.hidden) streams.clear() }
  const feedback = event => {
    if (event.detail.type === 'feedback') report({ type: 'large-feedback-context', feedbackRecordId: event.detail.recordId, value: event.detail.value,
      diagnostics: diagnostics.snapshot(), display: cacheDisplay() })
  }
  window.addEventListener('pointerdown', down, true)
  window.addEventListener('pointerup', end, true)
  window.addEventListener('pointercancel', end, true)
  window.addEventListener('dio-performance-report', feedback)
  document.addEventListener('visibilitychange', visibility)
  return { snapshot: () => diagnostics.snapshot(), dispose() {
    cancelAnimationFrame(frame)
    window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', end, true)
    window.removeEventListener('pointercancel', end, true); window.removeEventListener('dio-performance-report', feedback)
    document.removeEventListener('visibilitychange', visibility); streams.clear()
  } }
}
