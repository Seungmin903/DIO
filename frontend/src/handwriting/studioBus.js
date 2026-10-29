let current = null
let closeGuard = null
const listeners = new Set()
export const studioSnapshot = () => current
export const subscribeStudio = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export function openFontStudio(options = {}) { current = options; listeners.forEach(f => f()) }
export function setStudioCloseGuard(guard) { closeGuard = guard; return () => { if (closeGuard === guard) closeGuard = null } }
export async function closeFontStudio() { if (closeGuard && !await closeGuard()) return; current = null; listeners.forEach(f => f()) }
