// Accept only explicit Pencil contacts; fingers retain their existing gestures.
export function installStylusTouchBridge(node, pointer) {
  const contacts = new Map(), win = node.ownerDocument?.defaultView
  const wrap = (event, touch) => ({ currentTarget: node, preventDefault: () => event.preventDefault(),
    nativeEvent: { pointerType: 'pen', pointerId: `stylus-touch-${touch.identifier}`, button: 0,
      clientX: touch.clientX, clientY: touch.clientY, pressure: touch.force, timeStamp: event.timeStamp,
      cancelable: event.cancelable, inputChannel: 'stylus-touch' } })
  const handle = event => {
    for (const touch of Array.from(event.changedTouches ?? [])) {
      if (event.type === 'touchstart') {
        if (touch.touchType !== 'stylus') continue
        const fallback = !pointer.active
        const arrival = fallback ? { inputTraceId: `stylus-touch-${Date.now()}-${touch.identifier}`,
          started: performance.now(), area: 'pen-input', pointerType: 'pen' } : win?.__DIO_INPUT_ARRIVAL__
        if (fallback && win?.__DIO_PEN_QA_REPORT__) win.__DIO_INPUT_ARRIVAL__ = arrival
        contacts.set(touch.identifier, { fallback, arrival, started: performance.now(), moves: 0 })
        if (fallback) pointer.handlers.onPointerDown(wrap(event, touch))
      }
      const contact = contacts.get(touch.identifier)
      if (!contact) continue
      if (event.cancelable) event.preventDefault()
      if (event.type === 'touchmove') {
        contact.moves++
        if (contact.fallback) pointer.handlers.onPointerMove(wrap(event, touch))
      }
      if (event.type === 'touchend' || event.type === 'touchcancel') {
        if (contact.fallback) pointer.handlers[event.type === 'touchend' ? 'onPointerUp' : 'onPointerCancel'](wrap(event, touch))
        contacts.delete(touch.identifier)
        win?.__DIO_PEN_QA_REPORT__?.({ type: 'stylus-touch-stream', inputChannel: contact.fallback ? 'stylus-touch' : 'pointer-companion',
          inputTraceId: contact.arrival?.inputTraceId, acceptedSequence: contact.arrival?.acceptedSequence ?? null,
          durationMs: performance.now() - contact.started, moves: contact.moves, endedBy: event.type })
      }
    }
  }
  // Release outside the input node and page deactivation must release its owner too.
  const deactivate = () => { pointer.cancel(); contacts.clear() }
  const visibility = () => { if (node.ownerDocument?.hidden) deactivate() }
  const up = event => pointer.handlers.onPointerUp(event)
  const cancel = event => pointer.handlers.onPointerCancel(event)
  const globalEvents = { touchend: handle, touchcancel: handle, pointerup: up, pointercancel: cancel, blur: deactivate, pagehide: deactivate }
  for (const [name, listener] of Object.entries(globalEvents)) win?.addEventListener?.(name, listener, true)
  node.ownerDocument?.addEventListener?.('visibilitychange', visibility)
  const names = ['touchstart', 'touchmove', 'touchend', 'touchcancel']
  for (const name of names) node.addEventListener(name, handle, { capture: true, passive: false })
  return () => {
    for (const name of names) node.removeEventListener(name, handle, true)
    for (const [name, listener] of Object.entries(globalEvents)) win?.removeEventListener?.(name, listener, true)
    node.ownerDocument?.removeEventListener?.('visibilitychange', visibility)
    if ([...contacts.values()].some(contact => contact.fallback)) pointer.cancel()
    contacts.clear()
  }
}
