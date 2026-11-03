import { withStylusSensor } from './stylusSensor.js'

// Pointer pressure bypasses iOS's legacy Force Touch capability gate. Only pen
// pointers own this path; mouse/finger input continues through the responder.
export function createPenPointerInput(getHandlers, onActive = () => {}) {
  let active = null
  const preventBrowserDefault = event => {
    const raw = event.nativeEvent ?? event
    if (raw.cancelable === false) return
    if (event.preventDefault) event.preventDefault()
    else raw.preventDefault?.()
  }
  const local = (e, raw, release = false) => {
    const x = Number.isFinite(raw.clientX) ? (raw.clientX - active.originX) * active.scaleX : raw.offsetX ?? raw.locationX
    const y = Number.isFinite(raw.clientY) ? (raw.clientY - active.originY) * active.scaleY : raw.offsetY ?? raw.locationY
    // 안드로이드는 포인터 이벤트의 필압 · 기울기가 고정값이라 S펜 센서 값으로 바꾼다(stylusSensor)
    return withStylusSensor({ locationX: x, locationY: y, coordinateBasis: active.coordinateBasis, inputChannel: active.inputChannel, pointerType: 'pen', pressure: raw.pressure,
      timeStamp: raw.timeStamp ?? e.timeStamp, tiltX: raw.tiltX, tiltY: raw.tiltY, isRelease: release })
  }
  const move = (event, release = false) => {
    const e = event.nativeEvent ?? event
    if (!active || e.pointerId !== active.id) return
    preventBrowserDefault(event)
    let samples = []
    try { samples = release ? [] : e.getCoalescedEvents?.() ?? [] } catch { /* optional browser API */ }
    // The current event can duplicate the last coalesced sample; timestamps and
    // positions are deduplicated here. Predicted events are never committed.
    for (const raw of [...samples, e]) {
      const sample = local(e, raw, release && raw === e)
      sample.timeStamp ??= event.timeStamp
      if (!Number.isFinite(sample.locationX) || !Number.isFinite(sample.locationY)) continue
      if (Number.isFinite(sample.timeStamp) && sample.timeStamp < active.time) continue
      const signature = `${sample.timeStamp}:${sample.locationX}:${sample.locationY}:${sample.pressure}`
      if (signature === active.signature) continue
      active.signature = signature
      active.time = sample.timeStamp ?? active.time
      getHandlers().onMove?.(sample.locationX - active.x, sample.locationY - active.y, sample)
    }
  }
  const end = (event, cancelled = false) => {
    const e = event.nativeEvent ?? event
    if (!active || e.pointerId !== active.id) return
    const stamp = e.timeStamp ?? event.timeStamp
    if (stamp > 0 && active.startedAt > 0 && stamp < active.startedAt) return
    if (!cancelled) move(event, true)
    const id = active.id
    active = null
    onActive(false, id)
    getHandlers().onEnd?.({ cancelled })
  }
  return {
    get active() { return Boolean(active) },
    cancel() { if (active) { const id = active.id; active = null; onActive(false, id); getHandlers().onEnd?.({ cancelled: true }) } },
    handlers: {
      onPointerDown(event) {
        const e = event.nativeEvent ?? event
        if (getHandlers().disabled || e.pointerType !== 'pen' || (e.button != null && e.button !== 0)) return
        const target = event.currentTarget
        const rect = target?.getBoundingClientRect?.()
        // offsetX/Y는 자식 SVG/요소를 기준으로 할 수 있다. 입력 소유 View를 기준으로 고정한다.
        const style = rect && target.ownerDocument?.defaultView?.getComputedStyle?.(target)
        const scaleX = rect?.width > 0 && parseFloat(style?.width) > 0 ? parseFloat(style.width) / rect.width : 1
        const scaleY = rect?.height > 0 && parseFloat(style?.height) > 0 ? parseFloat(style.height) / rect.height : 1
        const x = rect && Number.isFinite(e.clientX) ? (e.clientX - rect.left) * scaleX : e.offsetX ?? e.locationX
        const y = rect && Number.isFinite(e.clientY) ? (e.clientY - rect.top) * scaleY : e.offsetY ?? e.locationY
        if (!Number.isFinite(x) || !Number.isFinite(y)) return
        let recovered = false
        const stamp = e.timeStamp ?? event.timeStamp
        if (active) {
          // A distinct new web down for the same pointer proves a new contact.
          // Preserve the old collected points; never connect them to the new tip.
          if (active.web && active.inputChannel === 'pointer' && e.inputChannel !== 'stylus-touch'
            && e.pointerId === active.id && Number.isFinite(stamp) && Number.isFinite(active.startedAt) && stamp > active.startedAt) {
            const previousId = active.id
            active = null; onActive(false, previousId)
            getHandlers().onEnd?.({ cancelled: false, reason: 'pointer-recontact' })
            recovered = true
          } else {
            getHandlers().onRejected?.({ reason: active.inputChannel === 'stylus-touch' ? 'touch-companion' : e.pointerId !== active.id ? 'different-owner' : 'duplicate-or-active-owner' })
            return
          }
        }
        preventBrowserDefault(event)
        // 이전 브라우저 선택 표시가 다음 필기 위에 남지 않게 한다.
        const selection = event.currentTarget?.ownerDocument?.getSelection?.()
        if (selection && !selection.isCollapsed) selection.removeAllRanges()
        active = { id: e.pointerId, startedAt: stamp, web: Boolean(rect), x, y, scaleX, scaleY, inputChannel: e.inputChannel ?? 'pointer', coordinateBasis: rect ? 'owner-view' : 'native-location',
          originX: rect ? rect.left : e.clientX - x, originY: rect ? rect.top : e.clientY - y, time: e.timeStamp ?? -Infinity }
        onActive(true, active.id)
        try { if (e.inputChannel !== 'stylus-touch') event.currentTarget?.setPointerCapture?.(e.pointerId) } catch { /* native has implicit capture */ }
        getHandlers().onStart?.({ ...local(e, e), recoveredPreviousPointer: recovered, timeStamp: e.timeStamp ?? event.timeStamp })
      },
      onPointerMove: move,
      onPointerUp: event => end(event),
      onPointerCancel: event => end(event, true),
      onLostPointerCapture: event => end(event, true),
    },
  }
}
