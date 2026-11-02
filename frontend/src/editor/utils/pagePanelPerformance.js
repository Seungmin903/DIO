let sequence = 0
export function startPagePanelMeasurement(details) {
  const reporter = typeof window !== 'undefined' ? window.__DIO_PEN_QA_REPORT__ : null
  const nativeDev = typeof __DEV__ !== 'undefined' && __DEV__ && typeof navigator !== 'undefined' && navigator.product === 'ReactNative'
  if (!reporter && !nativeDev) return null
  const start = performance.now(), metadata = { ...(typeof window !== 'undefined' ? window.__DIO_PERF_CASE__ : null), traceId: `page-panel-${Date.now().toString(36)}-${++sequence}`, ...details }
  let events = 0
  const emit = (stage, values = {}) => {
    const entry = { type: 'page-panel', ...metadata, recordId: `${metadata.traceId}-${++events}`, stage, elapsedMs: Math.round(performance.now() - start), ...values }
    if (reporter) reporter(entry)
    else console.info('[DIO-PAGE-PERF]', JSON.stringify(entry))
  }
  emit('intent')
  const duration = details.kind === 'page-select' ? 3000 : 700
  let frame, previous = start, maxGapMs = 0, stopped = false
  const beat = time => {
    maxGapMs = Math.max(maxGapMs, time - previous); previous = time
    if (time - start < duration && (typeof document === 'undefined' || !document.hidden)) frame = requestAnimationFrame(beat)
    else { stopped = true; emit('frame-window', { maxGapMs }) }
  }
  frame = requestAnimationFrame(beat)
  return { emit(stage, values) { if (!stopped) emit(stage, values) }, dispose() { cancelAnimationFrame(frame); if (!stopped) { stopped = true; emit('frame-window', { maxGapMs, interrupted: true }) } } }
}
