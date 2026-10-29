export const PAGE_REPEAT_DELAY = 350
export const PAGE_REPEAT_INTERVAL = 90

// Native accessibility clicks and browser .click() have no preceding press-in.
export function isGesturePagePress(event) {
  const native = event?.nativeEvent ?? event
  return Boolean(native && (native.pointerType || native.identifier != null ||
    native.touches != null || native.changedTouches != null || native.key != null || native.detail > 0 ||
    /^(responder|touch|mouse|pointer|key)/i.test(event?.type ?? native.type ?? '')))
}

// A short press advances once on release; a hold repeats without an extra release step.
export function createPageRepeat(step, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, held = false, pressed = false, repeated = false, cancelled = false
  const stop = () => { held = false; clearTimer(timer); timer = null }
  const tick = () => {
    if (!held) return
    repeated = true
    if (step() === false) { stop(); return }
    if (held) timer = setTimer(tick, PAGE_REPEAT_INTERVAL)
  }
  return {
    start() { stop(); held = true; pressed = true; repeated = false; cancelled = false; timer = setTimer(tick, PAGE_REPEAT_DELAY) },
    release: stop,
    cancel() { stop(); if (pressed) cancelled = true },
    press({ gesture = false } = {}) {
      const advance = !gesture || (pressed && !repeated && !cancelled)
      stop(); pressed = false; repeated = false; cancelled = false
      if (advance) step()
    },
  }
}
