// Aggregate arrival/timing only: never retain coordinates, text or pointer objects.
export function createStallDiagnostics({ now = () => performance.now(), windowMs = 8000, limit = 128 } = {}) {
  let previous = null
  const frames = [], inputs = []
  const push = (list, value) => { list.push(value); if (list.length > limit) list.shift() }
  return {
    frame(time) {
      if (previous != null && time - previous >= 50) push(frames, { at: time, gapMs: time - previous })
      previous = time
    },
    resetFrame() { previous = null },
    input(details) {
      const safe = {}
      for (const key of ['event', 'area', 'pointerType', 'touchType', 'inputTraceId', 'acceptedSequence', 'reason', 'qaCase', 'kind']) {
        if (typeof details[key] === 'string') safe[key] = details[key].slice(0, 100)
        else if (typeof details[key] === 'number' && Number.isFinite(details[key])) safe[key] = details[key]
      }
      push(inputs, { at: now(), ...safe })
    },
    snapshot() {
      const time = now(), recent = list => list.filter(item => time - item.at <= windowMs).map(({ at, ...item }) => ({ agoMs: Math.max(0, time - at), ...item }))
      return { windowMs, frameGaps: recent(frames), inputArrivals: recent(inputs), sinceLastFrameMs: previous == null ? null : Math.max(0, time - previous) }
    },
  }
}
