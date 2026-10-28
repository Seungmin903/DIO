// 개발용 기기 측정. 문서·좌표·텍스트를 전송하지 않으며 명시적인 QA sink/개발 환경 변수가 없으면 비활성이다.
const webQASink = typeof window !== 'undefined' && typeof window.__DIO_PEN_QA_REPORT__ === 'function' ? window.__DIO_PEN_QA_REPORT__ : null
export const PEN_PERFORMANCE_ENABLED = Boolean(webQASink || (typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PEN_PERF_URL))
const clock = () => performance.now()
const post = report => {
  if (webQASink) { webQASink(report); return }
  fetch(process.env.EXPO_PUBLIC_PEN_PERF_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => {})
}
const stats = values => {
  if (!values.length) return { count: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  return { count: sorted.length, p50: sorted[Math.floor((sorted.length - 1) * 0.5)], p95: sorted[Math.floor((sorted.length - 1) * 0.95)], max: sorted.at(-1) }
}
let sequence = 0
if (PEN_PERFORMANCE_ENABLED) post({ type: 'ready', version: 1 })

export function startPenMeasurement(metadata) {
  if (!PEN_PERFORMANCE_ENABLED) return null
  if (webQASink) metadata = { ...window.__DIO_PERF_CASE__, ...window.__DIO_PERF_INPUT__, cacheMode: window.__DIO_PERF_CACHE__ || 'svg', ...metadata }
  const id = ++sequence, started = clock(), samples = {}
  const arrival = webQASink ? window.__DIO_INPUT_ARRIVAL__ : null
  if (arrival) {
    metadata = { ...metadata, inputTraceId: arrival.inputTraceId, arrivalArea: arrival.area, arrivalPointerType: arrival.pointerType }
    arrival.acceptedSequence = id
    arrival.downToAcceptedMs = started - arrival.started
  }
  post({ type: 'input-accepted', version: 1, sequence: id, ...metadata })
  let frame, previousFrame = started, previousMove, previousNative, finished = false, events = 0, previewFrames = 0
  const record = (name, value) => {
    if (Number.isFinite(value) && value >= 0) {
      const list = samples[name] ??= []
      if (list.length < 16384) list.push(value)
    }
  }
  const beat = () => {
    const now = clock()
    record('jsFrameGapMs', now - previousFrame)
    previousFrame = now
    frame = requestAnimationFrame(beat)
  }
  if (arrival) {
    record('downToAcceptedMs', arrival.downToAcceptedMs)
    if (arrival.downEventAgeMs != null) record('downEventAgeMs', arrival.downEventAgeMs)
  }
  frame = requestAnimationFrame(beat)
  let previewCommitted = false
  return {
    record,
    clock,
    move(event) {
      const now = clock()
      if (previousMove != null) record('jsMoveGapMs', now - previousMove)
      const timestamp = event?.timeStamp ?? event?.timestamp
      if (Number.isFinite(timestamp)) {
        if (previousNative != null) record('nativeTimestampDelta', timestamp - previousNative)
        previousNative = timestamp
        if (webQASink && now >= timestamp && now - timestamp < 60000) record('eventAgeMs', now - timestamp)
      }
      previousMove = now; events++
    },
    preview() { previewFrames++ },
    handoffEnd(reason, elapsedMs) {
      record('previewToDocumentCommitMs', elapsedMs)
      post({ type: 'stroke-handoff', version: 1, sequence: id, ...metadata, reason, elapsedMs })
    },
    previewCommitted() {
      if (previewCommitted) return
      previewCommitted = true
      record('firstPreviewCommitMs', clock() - started)
      if (arrival) record('downToFirstPreviewCommitMs', clock() - arrival.started)
      if (arrival?.downEventAgeMs != null) record('eventToFirstPreviewCommitMs', clock() - arrival.started + arrival.downEventAgeMs)
      let first, second, complete = false
      first = requestAnimationFrame(() => { second = requestAnimationFrame(() => {
        complete = true
        // RAF 통과는 그리기 기회의 근사이며 실제 화면의 표시 완료 시각은 아니다.
        record('firstPreviewFrameOpportunityMs', clock() - started)
        if (arrival) record('downToFirstPreviewFrameOpportunityMs', clock() - arrival.started)
      }) })
      return () => {
        cancelAnimationFrame(first); cancelAnimationFrame(second)
        if (!complete) record('previewRemovedBeforeFrameOpportunity', 1)
      }
    },
    end(details) {
      if (finished) return
      finished = true
      const gestureMs = clock() - started
      // 손을 뗀 직후 확정 렌더링도 JS 프레임 간격에 포함한다.
      setTimeout(() => {
        cancelAnimationFrame(frame)
        post({ type: 'stroke', version: 1, sequence: id, ...metadata, ...details, gestureMs, events, previewFrames,
          firstPreviewCommitted: previewCommitted,
          metrics: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, stats(values)])) })
      }, 300)
    },
  }
}


export function reportPenInputRejected(details) {
  if (!webQASink) return
  post({ type: 'input-rejected', ...window.__DIO_PERF_CASE__, inputTraceId: window.__DIO_INPUT_ARRIVAL__?.inputTraceId, ...details })
}
