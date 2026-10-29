/**
 * 여러 칸 사진 틀 (인생네컷 · 필름 4컷). 사진 객체 하나가 cells 에 칸마다 사진을 담는다.
 * 여백·간격은 칸 너비 대비 비율이라 크기를 바꿔도 모양이 그대로다. (내보내기에서도 쓰므로 RN 의존 없음)
 */
export const PHOTO_STRIPS = {
  // 세로로 4칸, 아래에 글자 띠
  fourcut: { count: 4, direction: 'column', cellRatio: 4 / 3, top: 0.08, side: 0.08, bottom: 0.34, gap: 0.05 },
  // 가로로 4칸, 위아래에 필름 구멍 띠
  filmstrip: { count: 4, direction: 'row', cellRatio: 3 / 2, top: 0.24, side: 0.1, bottom: 0.24, gap: 0.08 },
}

export const isStripFrame = (frame) => PHOTO_STRIPS[frame] != null

/** 칸 너비 1 기준의 틀 전체 크기 */
function unitSize(spec) {
  const cellH = 1 / spec.cellRatio
  const span = (length) => spec.count * length + (spec.count - 1) * spec.gap
  return spec.direction === 'row'
    ? { w: spec.side * 2 + span(1), h: spec.top + cellH + spec.bottom }
    : { w: spec.side * 2 + 1, h: spec.top + span(cellH) + spec.bottom }
}

/** 틀 너비 w 일 때의 높이 */
export function stripHeight(frame, w) {
  const unit = unitSize(PHOTO_STRIPS[frame])
  return (w * unit.h) / unit.w
}

/** 칸 너비 cellW 일 때의 틀 크기 (틀을 바꿔도 칸 크기를 유지할 때) */
export function stripSizeForCell(frame, cellW) {
  const unit = unitSize(PHOTO_STRIPS[frame])
  return { w: cellW * unit.w, h: cellW * unit.h }
}

/** 칸 위치 (객체 좌상단 기준, 논리 좌표) */
export function stripCellBoxes(photo) {
  const spec = PHOTO_STRIPS[photo.frame]
  if (!spec) return []
  const c = photo.w / unitSize(spec).w
  const cellH = c / spec.cellRatio
  return Array.from({ length: spec.count }, (_, i) =>
    spec.direction === 'row'
      ? { left: c * (spec.side + i * (1 + spec.gap)), top: c * spec.top, width: c, height: cellH }
      : { left: c * spec.side, top: c * spec.top + i * (cellH + c * spec.gap), width: c, height: cellH },
  )
}

/** 칸에 넣을 사진 (불러온 사진·사진 객체에서 원본 정보만) */
export function photoCell(item) {
  return {
    src: item.src,
    mediaFileId: item.mediaFileId,
    poster: item.poster,
    name: item.name,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    crop: { fx: 0.5, fy: 0.5, zoom: 1 },
  }
}

/** 칸 수에 맞춘 칸 목록 (빈 칸은 null) */
export function fillCells(frame, cells) {
  const count = PHOTO_STRIPS[frame].count
  return Array.from({ length: count }, (_, i) => cells[i] ?? null)
}

/** 객체 안 좌표(x, y, 회전 전 좌상단 기준)가 몇 번째 칸인지. 칸 밖(여백)이면 -1 */
export function stripCellAt(photo, x, y) {
  return stripCellBoxes(photo).findIndex((b) => x >= b.left && x <= b.left + b.width && y >= b.top && y <= b.top + b.height)
}
