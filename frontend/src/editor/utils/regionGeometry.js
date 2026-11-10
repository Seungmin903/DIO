export const REGION_MIN = 32
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
export const REGION_PRESETS = {
  free: { label: '자유' }, square: { label: '정사각형 1:1', ratio: 1, width: 1080, height: 1080 },
  portrait: { label: '세로 피드 4:5', ratio: 4 / 5, width: 1080, height: 1350 },
  story: { label: '스토리 9:16', ratio: 9 / 16, width: 1080, height: 1920 },
}
export function validRegion(r, page, ratio) {
  return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite)
    && r.x >= 0 && r.y >= 0 && r.width >= REGION_MIN && r.height >= REGION_MIN
    && r.x + r.width <= page.width + 1e-6 && r.y + r.height <= page.height + 1e-6
    && (!ratio || Math.abs(r.width / r.height / ratio - 1) <= 1e-6)
}
export function resizeRegion(r, corner, dx, dy, page, ratio) {
  const left = corner.includes('w'), top = corner.includes('n')
  const anchor = { x: left ? r.x+r.width : r.x, y: top ? r.y+r.height : r.y }
  const maxW = left ? anchor.x : page.width-anchor.x, maxH = top ? anchor.y : page.height-anchor.y
  const dw = left ? -dx : dx, dh = top ? -dy : dy
  let width = clamp(r.width + dw, Math.min(REGION_MIN, maxW), maxW)
  let height = clamp(r.height + dh, Math.min(REGION_MIN, maxH), maxH)
  if (ratio) {
    const minW = Math.max(REGION_MIN,REGION_MIN*ratio)
    // 비율을 유지하는 대각선에 움직임을 투영해 가로나 세로로만 끌어도 조절한다.
    const delta = (dw * ratio + dh) * ratio / (ratio * ratio + 1)
    width = Math.min(Math.min(maxW, maxH * ratio), Math.max(minW, r.width + delta))
    height = width/ratio
  }
  return { x: left ? anchor.x-width : anchor.x, y: top ? anchor.y-height : anchor.y, width, height }
}
export function fitRegionPreset(r, preset, page) {
  const ratio = REGION_PRESETS[preset]?.ratio
  if (!ratio) return { ...r }
  const minW = Math.max(REGION_MIN,REGION_MIN*ratio), maxW = Math.min(page.width,page.height*ratio)
  if (maxW < minW) return null
  const width = clamp(Math.min(r.width,r.height*ratio),minW,maxW), height = width/ratio
  return { x: clamp(r.x+r.width/2-width/2,0,page.width-width), y: clamp(r.y+r.height/2-height/2,0,page.height-height), width, height }
}
export function regionOutput(region, preset = 'free') {
  const config = REGION_PRESETS[preset]
  if (!config || !(region.width > 0 && region.height > 0)) throw new Error('영역과 프리셋을 확인해 주세요.')
  const s = Math.min(2,4096/region.width,4096/region.height,Math.sqrt(8000000/(region.width*region.height)))
  const width = config.width ?? Math.max(1,Math.floor(region.width*s)), height = config.height ?? Math.max(1,Math.floor(region.height*s))
  const magnification = Math.max(width/region.width,height/region.height)
  return { width,height,magnification,blocked:magnification>6,needsConfirmation:magnification>3&&magnification<=6 }
}
