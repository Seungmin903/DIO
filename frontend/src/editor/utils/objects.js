// 페이지 오브젝트 생성·계산 헬퍼
// 공통 필드: { id, type, x, y, w, h, rotation, hidden?, locked?, groupId?, name? }
// x, y 는 회전 전 박스의 좌상단, 회전은 박스 중심 기준이다.

import { CROP_RATIOS, OBJECT_TYPE_LABELS, PHOTO_FRAME_ASSETS, PHOTO_SHAPES, LEGACY_TAPE_NAMES, FRAME_INSETS, TAPE_DEFAULT_OPACITY, TAPE_SIZES, TAPES } from '../constants'
import { shapeDefinition } from './editorShapes'
import { clamp, createId } from './common'
import { createDdayWidget, ddayStyleOf } from '../widgets/dday'
import { createMemo } from '../widgets/memo'
import { fillCells, isStripFrame, photoCell, stripSizeForCell } from './photoStrip'

const base = (type, center, w, h, extra) => ({
  id: createId(),
  type,
  x: center.x - w / 2,
  y: center.y - h / 2,
  w,
  h,
  rotation: 0,
  ...extra,
})

export function createSticker(item, center) {
  if (item.widget === 'dday') {
    const style = ddayStyleOf(item.style)
    return base('sticker', center, style.w, style.h, { widget: createDdayWidget(style.id), name: item.name })
  }
  if (item.asset) {
    return base('sticker', center, 96, 96, {
      asset: item.asset,
      name: item.name,
    })
  }
  if (item.mediaFileId || item.src) {
    const aspect = item.aspect ?? 1
    const w = aspect >= 1 ? 110 : 110 * aspect
    return base('sticker', center, w, w / aspect, {
      src: item.src,
      mediaFileId: item.mediaFileId,
      poster: item.poster,
      name: item.name,
    })
  }
  return base('sticker', center, 84, 84, {
    emoji: item.emoji,
    name: item.name,
  })
}

export function createTape(item, center) {
  // 이미지 테이프도 기본 테이프와 같은 네모 틀에 꽉 채워(cover) 넣어 테이프 비율을 유지한다.
  if (item.mediaFileId || item.src) {
    const imageSize = TAPE_SIZES.find((s) => s.id === item.size) ?? TAPE_SIZES[1]
    return base('tape', center, imageSize.w, imageSize.h, {
      size: imageSize.id,
      // 잘라서 등록한 이미지 한 조각의 길이. 테이프가 이보다 길어지면 조각을 옆으로 반복한다.
      segmentW: imageSize.w,
      src: item.src,
      mediaFileId: item.mediaFileId,
      name: item.name,
      imageWidth: item.imageWidth,
      imageHeight: item.imageHeight,
      crop: item.crop,
      edge: item.edge ?? 'straight',
      opacity: TAPE_DEFAULT_OPACITY,
    })
  }
  // 무늬 테이프는 늘 기본 폭으로 붙는다. 폭은 붙인 뒤 위아래 손잡이로 바꾼다.
  const size = TAPE_SIZES[1]
  return base('tape', center, size.w, size.h, {
    pattern: item.pattern,
    palette: item.palette,
    size: size.id,
    name: item.name,
    edge: item.edge ?? 'straight',
    opacity: TAPE_DEFAULT_OPACITY,
  })
}

export function createPhoto(item, center) {
  const photo = {
    src: item.src,
    mediaFileId: item.mediaFileId,
    poster: item.poster,
    name: item.name,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    crop: { fx: 0.5, fy: 0.5, zoom: 1 },
    frame: 'polaroid',
    ratio: 'original',
    shape: 'rect',
  }
  const rotation = item.rotation ?? 0
  // 보관함에서 고른 사진 틀(item.frame)이 있으면 그 틀로, 없으면 예전 '붙일 모양'(item.style)으로 붙인다.
  if (isBorderFrame(item.frame)) {
    const w = item.w ?? 240
    return base('photo', center, w, framedHeight(w, 'original', photo, item.frame), { ...photo, frame: item.frame, rotation })
  }
  // 기본은 원본 비율 그대로의 사각 사진. 정사각 도형(원형·하트·별)은 정사각으로 붙인다.
  const style = item.frame === 'none' ? 'rect' : item.style ?? 'rect'
  if (style !== 'polaroid') {
    const square = PHOTO_SHAPES.find((s) => s.id === style)?.square
    const aspect = item.imageWidth / item.imageHeight
    // 긴 변을 260 으로 맞춘다.
    const w = square ? 220 : aspect >= 1 ? 260 : clamp(260 * aspect, 60, 260)
    const h = square ? 220 : w / aspect
    return base('photo', center, w, h, {
      ...photo,
      frame: 'shape',
      shape: style,
      rotation,
    })
  }
  const w = item.w ?? 240
  return base('photo', center, w, polaroidHeight(w, 'original', photo), {
    ...photo,
    ...item.extra,
    rotation,
  })
}

// 여러 칸 틀의 처음 칸 너비 (인생네컷은 세로로 길고, 필름 4컷은 가로로 길다)
const STRIP_CELL_WIDTH = { fourcut: 130, filmstrip: 110 }
const stripName = (frame) => PHOTO_FRAME_ASSETS.find((item) => item.id === frame)?.name ?? OBJECT_TYPE_LABELS.photo

/** 여러 칸 틀(인생네컷 · 필름 4컷). photos 를 앞 칸부터 순서대로 넣고 나머지는 빈 칸으로 둔다. */
export function createPhotoStrip(frame, photos, center) {
  const size = stripSizeForCell(frame, STRIP_CELL_WIDTH[frame])
  return base('photo', center, size.w, size.h, {
    frame,
    name: stripName(frame),
    cells: fillCells(frame, photos.map(photoCell)),
  })
}

/** 사진 틀의 온전한 이름 (보관함 칸은 '티켓' 묶음 아래라 '공연'처럼 줄여 쓴다) */
export function frameAssetName(frame) {
  const asset = PHOTO_FRAME_ASSETS.find((item) => item.id === frame)
  if (!asset) return OBJECT_TYPE_LABELS.photo
  return asset.group === 'ticket' && asset.id !== 'ticketBoarding' ? `${asset.name} 티켓` : asset.name
}

/** 사진 보관함의 사진 틀: 사진 없이 틀부터 붙인다. 빈 자리는 캔버스의 + 로 채운다. */
export function createEmptyFrame(frame, center) {
  if (isStripFrame(frame)) return createPhotoStrip(frame, [], center)
  const ratio = PHOTO_FRAME_ASSETS.find((item) => item.id === frame)?.ratio ?? '1:1'
  // 티켓은 인쇄 글자가 읽히도록 넓게
  const w = frame.startsWith('ticket') ? 340 : 240
  return base('photo', center, w, framedHeight(w, ratio, {}, frame), {
    frame,
    ratio,
    shape: 'rect',
    crop: { fx: 0.5, fy: 0.5, zoom: 1 },
    name: frameAssetName(frame),
  })
}

export function createObjectFromDecor(item, center) {
  if (item.kind === 'frame') return createEmptyFrame(item.frame, center)
  if (item.kind === 'sticker') return createSticker(item, center)
  if (item.kind === 'memo') return createMemo(item, center)
  if (item.kind === 'tape') return createTape(item, center)
  if (isStripFrame(item.frame)) return createPhotoStrip(item.frame, item.photos ?? [item], center)
  return createPhoto(item, center)
}

export function getObjectName(object) {
  if (object.name) return object.name
  if (object.type === 'shape') return shapeDefinition(object.shape).label
  // 예전 문서의 테이프는 무늬 이름이 곧 테이프 id 였다.
  if (object.type === 'tape') return LEGACY_TAPE_NAMES[object.pattern] ?? TAPES.find((tape) => tape.id === object.pattern)?.name ?? '마스킹테이프'
  return OBJECT_TYPE_LABELS[object.type]
}

/* ---------- 사진 ---------- */

/** 비율 id → 가로:세로 값. '원본'은 사진 원래 비율, '자유'·모르는 값은 null */
export function ratioValueOf(ratioId, photo) {
  if (ratioId === 'original') return photo?.imageWidth && photo?.imageHeight ? photo.imageWidth / photo.imageHeight : null
  return CROP_RATIOS.find((item) => item.id === ratioId)?.value ?? null
}

/** 여백 있는 틀(폴라로이드·필름·우표·티켓)인지 */
export const isBorderFrame = (frame) => FRAME_INSETS[frame] != null

/** 틀 여백 (사진 너비 대비) — 좌우가 다른 틀(티켓)도 left·right 로 */
export function frameInsets(frame) {
  const insets = FRAME_INSETS[frame]
  return insets && { top: insets.top, bottom: insets.bottom, left: insets.side, right: insets.right ?? insets.side }
}

/** 틀 너비 w, 안쪽 사진 비율 ratioId 일 때의 틀 높이 */
export function framedHeight(w, ratioId, photo, frame = photo.frame) {
  const insets = frameInsets(frame) ?? frameInsets('polaroid')
  const ratio = ratioValueOf(ratioId, photo) ?? 4 / 5
  const innerW = w * (1 - insets.left - insets.right)
  return innerW / ratio + w * (insets.top + insets.bottom)
}
export function polaroidHeight(w, ratioId, photo) {
  return framedHeight(w, ratioId, photo, 'polaroid')
}

/** 사진이 실제로 보이는 안쪽 영역 (오브젝트 좌상단 기준, 논리 좌표) */
export function photoInnerBox(photo) {
  const insets = frameInsets(photo.frame)
  if (!insets) return { left: 0, top: 0, width: photo.w, height: photo.h }
  const left = photo.w * insets.left
  const top = photo.w * insets.top
  const bottom = photo.w * insets.bottom
  return {
    left,
    top,
    width: photo.w * (1 - insets.left - insets.right),
    height: Math.max(1, photo.h - top - bottom),
  }
}

/** 사진(원본)이 들어 있는지. 사진 틀만 붙이면 비어 있다. */
export const hasPhotoMedia = (photo) => Boolean(photo?.src || photo?.mediaFileId)

/** 사진을 채울 빈 자리: 여러 칸 틀은 빈 칸 번호들, 빈 한 장 틀은 [null], 다 찼으면 [] */
export function emptyPhotoSlots(photo) {
  if (photo?.type !== 'photo') return []
  if (isStripFrame(photo.frame)) return (photo.cells ?? []).map((cell, i) => (cell ? -1 : i)).filter((i) => i >= 0)
  return hasPhotoMedia(photo) ? [] : [null]
}

/** 지금 보이는 안쪽 사진의 가로:세로 (모양을 바꿀 때 이어 쓴다) */
function innerAspect(photo) {
  if (isBorderFrame(photo.frame)) return ratioValueOf(photo.ratio, photo) ?? photo.imageWidth / photo.imageHeight
  const square = photo.frame === 'shape' && PHOTO_SHAPES.find((s) => s.id === photo.shape)?.square
  const saved = photo.shapeAspectRatio
  // 정사각 모양 사이에서는 원래 비율을 유지하고, 사각·라운드로 돌아올 때 복원한다.
  return square && Number.isFinite(saved) && saved > 0 ? saved : photo.w / photo.h
}

/** 틀 없는 사진의 모양(사각·라운드·원형·하트·별)을 바꾸는 patch */
export function photoShapePatch(photo, shapeId) {
  if (photo.frame === 'shape' && photo.shape === shapeId) return {}
  const aspect = innerAspect(photo)
  if (PHOTO_SHAPES.find((s) => s.id === shapeId)?.square) {
    // 다른 틀과 동일하게 너비를 기준으로 유지한다. 짧은 변을 다시 쓰면
    // 가로형 틀 → 정사각형을 반복할 때 크기가 누적해서 줄어든다.
    return { frame: 'shape', shape: shapeId, shapeAspectRatio: aspect, ...resizeAroundCenter(photo, photo.w, photo.w) }
  }
  // 사각·라운드는 모서리 둥글기를 그 모양의 기본값으로 되돌린다
  return { frame: 'shape', shape: shapeId, radius: undefined, ...resizeAroundCenter(photo, photo.w, photo.w / aspect) }
}

/**
 * 영역을 꽉 채우는(cover) 이미지 배치. crop.fx/fy(0~1)는 넘치는 부분 중 어디를 보여줄지,
 * crop.zoom 은 추가 확대 배율이다.
 */
export function coverLayout(photo, boxWidth, boxHeight) {
  const scale = Math.max(boxWidth / photo.imageWidth, boxHeight / photo.imageHeight) * photo.crop.zoom
  const width = photo.imageWidth * scale
  const height = photo.imageHeight * scale
  return {
    width,
    height,
    left: -(width - boxWidth) * photo.crop.fx,
    top: -(height - boxHeight) * photo.crop.fy,
  }
}

/** 테이프 규격. 규격 정보가 없는 예전 테이프는 가로:세로 비율이 가장 가까운 규격 */
export function tapeSizeOf(tape) {
  const known = TAPE_SIZES.find((s) => s.id === tape.size)
  if (known) return known
  const ratio = tape.w / tape.h
  return TAPE_SIZES.reduce((best, size) => (Math.abs(size.w / size.h - ratio) < Math.abs(best.w / best.h - ratio) ? size : best))
}

/**
 * 무늬 한 단위의 기준 높이. 무늬는 h / 기준 높이 배율로 그린다.
 * 위아래 손잡이로 폭을 바꾸면 기준 높이도 같은 비율로 바꿔(unitH) 무늬 크기는 그대로, 줄 수만 늘고 준다.
 * 예전 테이프는 규격(size) 높이가 기준이다.
 */
export const tapeUnitH = (tape) => tape.unitH ?? tapeSizeOf(tape).h

/** 중심을 유지하면서 크기를 바꾸는 패치 */
export function resizeAroundCenter(object, w, h) {
  return {
    w,
    h,
    x: object.x + (object.w - w) / 2,
    y: object.y + (object.h - h) / 2,
  }
}
