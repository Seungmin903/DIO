// 페이지 오브젝트 생성·계산 헬퍼
// 공통 필드: { id, type, x, y, w, h, rotation, hidden?, locked?, groupId?, name? }
// x, y 는 회전 전 박스의 좌상단, 회전은 박스 중심 기준이다.

import { CROP_RATIOS, OBJECT_TYPE_LABELS, PHOTO_SHAPES, LEGACY_TAPE_NAMES, FRAME_INSETS, TAPE_DEFAULT_OPACITY, TAPE_SIZES, TAPES } from '../constants'
import { clamp, createId } from './common'

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
  const size = TAPE_SIZES.find((s) => s.id === item.size) ?? TAPE_SIZES[1]
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
  // 기본은 원본 비율 그대로의 사각 사진. 정사각 도형(원형·하트·별)은 정사각으로 붙인다.
  const style = item.style ?? 'rect'
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

export function createObjectFromDecor(item, center) {
  if (item.kind === 'sticker') return createSticker(item, center)
  if (item.kind === 'tape') return createTape(item, center)
  return createPhoto(item, center)
}

export function getObjectName(object) {
  if (object.name) return object.name
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

/** 여백 있는 틀(폴라로이드·필름·우표·찢은 종이)인지 */
export const isBorderFrame = (frame) => FRAME_INSETS[frame] != null

/** 틀 너비 w, 안쪽 사진 비율 ratioId 일 때의 틀 높이 */
export function framedHeight(w, ratioId, photo, frame = photo.frame) {
  const insets = FRAME_INSETS[frame] ?? FRAME_INSETS.polaroid
  const ratio = ratioValueOf(ratioId, photo) ?? 4 / 5
  const innerW = w * (1 - insets.side * 2)
  return innerW / ratio + w * (insets.top + insets.bottom)
}
export function polaroidHeight(w, ratioId, photo) {
  return framedHeight(w, ratioId, photo, 'polaroid')
}

/** 사진이 실제로 보이는 안쪽 영역 (오브젝트 좌상단 기준, 논리 좌표) */
export function photoInnerBox(photo) {
  const insets = FRAME_INSETS[photo.frame]
  if (!insets) return { left: 0, top: 0, width: photo.w, height: photo.h }
  const side = photo.w * insets.side
  const top = photo.w * insets.top
  const bottom = photo.w * insets.bottom
  return {
    left: side,
    top,
    width: photo.w - side * 2,
    height: Math.max(1, photo.h - top - bottom),
  }
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

/** 중심을 유지하면서 크기를 바꾸는 패치 */
export function resizeAroundCenter(object, w, h) {
  return {
    w,
    h,
    x: object.x + (object.w - w) / 2,
    y: object.y + (object.h - h) / 2,
  }
}
