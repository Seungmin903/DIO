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
// 필기 중에 끼어드는 다른 JS 작업(자동 저장 직렬화 등)을 진행 중인 획 측정에 붙인다. 측정이 꺼져 있으면 아무것도 하지 않는다.
// 획이 300ms 간격으로 이어지면 600ms 관찰 창이 겹친다. 중복 집계하지 않게 가장 최근 획에만 붙이고, 손을 뗀 뒤면 이름 뒤에 After 를 붙여 나눈다.
const active = new Set()
export function markPenPerformance(name, value) {
  if (!active.size) return
  const latest = [...active].at(-1)
  latest.record(latest.finished() ? `${name}After` : name, value)
}
/** 측정이 켜져 있을 때만 작업 시간을 잰다. 진행 중인 획이 있으면 그 획에 기록하고, 없으면(주기 동기화 등) 10ms 이상만 'mark' 보고로 보낸다. */
export function timePenPerformance(name, work, extra = null) {
  if (!PEN_PERFORMANCE_ENABLED) return work()
  const started = clock()
  try { return work() } finally {
    const ms = clock() - started
    if (active.size) { markPenPerformance(name, ms); if (extra) for (const [key, value] of Object.entries(extra())) markPenPerformance(key, value) }
    else if (ms >= 10) post({ type: 'mark', version: 1, name, ms, ...(extra ? extra() : {}) })
  }
}
/** 측정이 켜져 있을 때 상태 요약(협업 저널 대기열 등)을 'mark' 보고로 보낸다. 좌표·문서 내용은 담지 않는다. */
export function reportPenMark(name, fields = {}) {
  if (!PEN_PERFORMANCE_ENABLED) return
  try { post({ type: 'mark', version: 1, name, ms: 0, ...fields }) } catch { /* 보고 실패는 무시 */ }
}
// 테스트용 모듈 로더가 있는 훅은 import 대신 전역 훅으로 보고한다(측정이 꺼져 있으면 전역 훅을 두지 않는다).
if (PEN_PERFORMANCE_ENABLED) { globalThis.__DIO_PEN_MARK__ = markPenPerformance; globalThis.__DIO_PEN_REPORT__ = reportPenMark }
// 개발 측정 중 JS 오류(앱 종료 원인 후보)를 수집기에 보낸다. 좌표·문서 내용은 담지 않는다.
if (PEN_PERFORMANCE_ENABLED && typeof globalThis.ErrorUtils?.getGlobalHandler === 'function') {
  const previous = globalThis.ErrorUtils.getGlobalHandler()
  globalThis.ErrorUtils.setGlobalHandler((error, isFatal) => {
    try { post({ type: 'error', version: 1, fatal: Boolean(isFatal), message: String(error?.message ?? error).slice(0, 300), stack: String(error?.stack ?? '').slice(0, 1200) }) } catch { /* 보고 실패는 무시 */ }
    previous?.(error, isFatal)
  })
}

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
  // 미리보기 뭉침·지연: 마지막 입력 수신 시각과 그 뒤 쌓인 입력 수. 큐 지연: 첫 입력의 (JS 수신 − 네이티브 timestamp)를 기준으로 한 증가분.
  let lastMoveAt = null, pendingMoves = 0, queueBaseline = null
  const record = (name, value) => {
    if (Number.isFinite(value) && value >= 0) {
      const list = samples[name] ??= []
      if (list.length < 16384) list.push(value)
    }
  }
  const beat = () => {
    const now = clock()
    // 필기 중과 손을 뗀 뒤(확정 렌더·저장)를 나눠 기록한다.
    record(finished ? 'jsFrameGapAfterMs' : 'jsFrameGapMs', now - previousFrame)
    previousFrame = now
    frame = requestAnimationFrame(beat)
  }
  if (arrival) {
    record('downToAcceptedMs', arrival.downToAcceptedMs)
    if (arrival.downEventAgeMs != null) record('downEventAgeMs', arrival.downEventAgeMs)
  }
  frame = requestAnimationFrame(beat)
  let previewCommitted = false
  const measurement = {
    record,
    finished: () => finished,
    clock,
    move(event) {
      const now = clock()
      if (previousMove != null) record('jsMoveGapMs', now - previousMove)
      const timestamp = event?.timeStamp ?? event?.timestamp
      if (Number.isFinite(timestamp)) {
        if (previousNative != null) record('nativeTimestampDelta', timestamp - previousNative)
        previousNative = timestamp
        if (webQASink && now >= timestamp && now - timestamp < 60000) record('eventAgeMs', now - timestamp)
        // 네이티브 시계와 JS 시계의 단위·기준이 달라 절대 지연은 알 수 없다. 첫 입력을 기준으로 뒤 입력이 얼마나 더 늦게 도착하는지(큐에 밀린 양)만 본다.
        const offset = now - timestamp
        if (queueBaseline == null) queueBaseline = offset
        else if (Math.abs(offset - queueBaseline) < 60000) record('eventQueueDelayMs', Math.max(0, offset - queueBaseline))
      }
      previousMove = now; events++; lastMoveAt = now; pendingMoves++
    },
    preview() {
      previewFrames++
      const now = clock()
      if (lastMoveAt != null) record('moveToPreviewMs', now - lastMoveAt)
      record('eventsPerPreview', pendingMoves)
      pendingMoves = 0
    },
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
      // 손을 뗀 직후 확정 렌더링·저장도 600ms 동안 jsFrameGapAfterMs 로 따로 기록한다(객체 270개 페이지에서 480ms 멈춤 실측).
      setTimeout(() => {
        cancelAnimationFrame(frame)
        active.delete(measurement)
        post({ type: 'stroke', version: 1, sequence: id, ...metadata, ...details, gestureMs, events, previewFrames,
          firstPreviewCommitted: previewCommitted,
          metrics: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, stats(values)])) })
      }, 600)
    },
  }
  active.add(measurement)
  return measurement
}


export function reportPenInputRejected(details) {
  if (!webQASink) return
  post({ type: 'input-rejected', ...window.__DIO_PERF_CASE__, inputTraceId: window.__DIO_INPUT_ARRIVAL__?.inputTraceId, ...details })
}
