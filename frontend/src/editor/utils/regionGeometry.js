export const REGION_MIN = 32
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
export const REGION_PRESETS = {
  free: { label: '자유' }, square: { label: '정사각형 1:1', ratio: 1, width: 1080, height: 1080 },
  portrait: { label: '세로 피드 4:5', ratio: 4 / 5, width: 1080, height: 1350 },
  story: { label: '스토리 9:16', ratio: 9 / 16, width: 1080, height: 1920 },
}
export function validRegion(r, page, ratio) {
  return !!r && Object.keys(regionInputErrors(r, page, ratio)).length === 0
}

export function regionInputErrors(region, page, ratio) {
  const errors = {}
  for (const [position, size] of [['x', 'width'], ['y', 'height']]) {
    const offset = region[position], length = region[size], limit = page[size]
    if (!Number.isFinite(offset)) errors[position] = '숫자를 입력해 주세요.'
    else if (offset < 0 || offset >= limit) errors[position] = '페이지 안의 위치를 입력해 주세요.'
    if (!Number.isFinite(length)) errors[size] = '숫자를 입력해 주세요.'
    else if (length < REGION_MIN) errors[size] = `${REGION_MIN} 이상 입력해 주세요.`
    else if (!errors[position] && !(offset + length <= limit + 1e-6)) {
      errors[size] = '페이지 밖으로 나가요. 위치나 크기를 조정해 주세요.'
    }
  }
  if (!errors.width && !errors.height && ratio && Math.abs(region.width / region.height / ratio - 1) > 1e-6) {
    errors.ratio = '너비와 높이를 선택한 비율에 맞춰 주세요.'
  }
  return errors
}
export function moveRegion(r, dx, dy, page) {
  return { ...r, x: clamp(r.x+dx,0,page.width-r.width), y: clamp(r.y+dy,0,page.height-r.height) }
}
export function regionFromDrag(start, end, page, ratio) {
  const x = clamp(start.x,0,page.width), y = clamp(start.y,0,page.height)
  let dx = clamp(end.x,0,page.width)-x, dy = clamp(end.y,0,page.height)-y
  if (ratio) {
    const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1
    const width = Math.min(Math.max(Math.abs(dx),Math.abs(dy)*ratio), sx < 0 ? x : page.width-x, (sy < 0 ? y : page.height-y)*ratio)
    dx = sx*width; dy = sy*width/ratio
  }
  return { x: Math.min(x,x+dx), y: Math.min(y,y+dy), width: Math.abs(dx), height: Math.abs(dy) }
}
export function resizeRegion(r, corner, dx, dy, page, ratio) {
  const left = corner.includes('w'), top = corner.includes('n')
  const anchor = { x: left ? r.x+r.width : r.x, y: top ? r.y+r.height : r.y }
  const maxW = left ? anchor.x : page.width-anchor.x, maxH = top ? anchor.y : page.height-anchor.y
  let width = clamp(r.width+(left ? -dx : dx),Math.min(REGION_MIN,maxW),maxW)
  let height = clamp(r.height+(top ? -dy : dy),Math.min(REGION_MIN,maxH),maxH)
  if (ratio) {
    const minW = Math.max(REGION_MIN,REGION_MIN*ratio)
    width = Math.min(Math.min(maxW,maxH*ratio), Math.max(minW,Math.max(width,height*ratio)))
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

/** 새 드래그가 취소되거나 유효하지 않으면 기존 유효 영역을 보존한다. */
export function finishRegionDrag(previous, draft, { cancelled, moved, page, ratio }) {
  return cancelled || !moved || !validRegion(draft, page, ratio) ? previous : draft
}

/** 게시 안내는 조작 오차를 허용한다. 출력 프리셋의 엄격한 비율 검증과 별개다. */
export function regionPublishWarning(region, destination = 'feed') {
  if (!(region.width > 0 && region.height > 0)) return false
  const ratio = region.width / region.height
  return destination === 'story'
    ? Math.abs(ratio / (9 / 16) - 1) > 0.01 + 1e-12
    : ratio < 0.8 || ratio > 1.91
}
