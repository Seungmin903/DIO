export const PAGE_REPEAT_DELAY = 350
export const PAGE_REPEAT_INTERVAL = 90

// A short press advances once on release; a hold repeats without an extra release step.
export function createPageRepeat(step, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let timer = null, held = false, repeated = false
  const stop = () => { held = false; clearTimer(timer); timer = null }
  const tick = () => {
    if (!held) return
    repeated = true
    if (step() === false) { stop(); return }
    if (held) timer = setTimer(tick, PAGE_REPEAT_INTERVAL)
  }
  return {
    start() { stop(); held = true; repeated = false; timer = setTimer(tick, PAGE_REPEAT_DELAY) },
    release: stop,
    cancel() { stop(); repeated = true },
    press() { stop(); if (!repeated) step(); repeated = false },
  }
}
