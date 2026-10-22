// 개발용 기기 측정. 저장 문서·좌표·텍스트를 전송하지 않으며 환경 변수가 없으면 비활성이다.
export const PEN_PERFORMANCE_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__ && Boolean(process.env.EXPO_PUBLIC_PEN_PERF_URL)
const clock = () => performance.now()
const post = report => {
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
  const id = ++sequence, started = clock(), samples = {}
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
  frame = requestAnimationFrame(beat)
  return {
    record,
    clock,
    move(event) {
      const now = clock()
      if (previousMove != null) record('jsMoveGapMs', now - previousMove)
      if (Number.isFinite(event?.timestamp)) {
        if (previousNative != null) record('nativeTimestampDelta', event.timestamp - previousNative)
        previousNative = event.timestamp
      }
      previousMove = now; events++
    },
    preview() { previewFrames++ },
    end(details) {
      if (finished) return
      finished = true
      const gestureMs = clock() - started
      // 손을 뗀 직후 확정 렌더링도 JS 프레임 간격에 포함한다.
      setTimeout(() => {
        cancelAnimationFrame(frame)
        post({ type: 'stroke', version: 1, sequence: id, ...metadata, ...details, gestureMs, events, previewFrames,
          metrics: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, stats(values)])) })
      }, 300)
    },
  }
}
