let sequence = 0
export function startPagePanelMeasurement(details) {
  if (typeof window === 'undefined' || !window.__DIO_PEN_QA_REPORT__) return null
  const start = performance.now(), metadata = { ...window.__DIO_PERF_CASE__, traceId: `page-panel-${Date.now().toString(36)}-${++sequence}`, ...details }
  let events = 0
  const emit = (stage, values = {}) => window.__DIO_PEN_QA_REPORT__({ type: 'page-panel', ...metadata, recordId: `${metadata.traceId}-${++events}`, stage, elapsedMs: performance.now() - start, ...values })
  emit('intent')
  let frame, previous = start, maxGapMs = 0, stopped = false
  const beat = time => {
    maxGapMs = Math.max(maxGapMs, time - previous); previous = time
    if (time - start < 700 && !document.hidden) frame = requestAnimationFrame(beat)
    else { stopped = true; emit('frame-window', { maxGapMs }) }
  }
  frame = requestAnimationFrame(beat)
  return { emit, dispose() { cancelAnimationFrame(frame); if (!stopped) { stopped = true; emit('frame-window', { maxGapMs, interrupted: true }) } } }
}
