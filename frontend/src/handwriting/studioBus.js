import { HANDWRITING_FONT_CREATION_ENABLED } from '../shared/featureFlags.js'

let current = null
let closeGuard = null
const listeners = new Set()
export const studioSnapshot = () => current
export const subscribeStudio = listener => { listeners.add(listener); return () => listeners.delete(listener) }
// 폰트 만들기를 끈 빌드(shared/featureFlags.js)에서는 완성 폰트 관리(manage: 이름 · 폰트 파일 저장 · 글자 간격 보정)로만 연다.
// 새로 만들기 · 작성 중 이어 쓰기는 열지 않고 상태도 남기지 않는다(열린 것으로 보고 뒤로가기를 가로채지 않게)
export const canOpenFontStudio = (options = {}) => HANDWRITING_FONT_CREATION_ENABLED || Boolean(options.manage && options.open)
export function openFontStudio(options = {}) { if (!canOpenFontStudio(options)) return; current = options; listeners.forEach(f => f()) }
export function setStudioCloseGuard(guard) { closeGuard = guard; return () => { if (closeGuard === guard) closeGuard = null } }
export async function closeFontStudio() { if (closeGuard && !await closeGuard()) return; current = null; listeners.forEach(f => f()) }
