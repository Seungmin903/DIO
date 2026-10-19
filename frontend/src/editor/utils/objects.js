// 페이지 오브젝트 생성·계산 헬퍼
// 공통 필드: { id, type, x, y, w, h, rotation, hidden?, locked?, groupId?, name? }
// x, y 는 회전 전 박스의 좌상단, 회전은 박스 중심 기준이다.

import { OBJECT_TYPE_LABELS, POLAROID_INSETS, POLAROID_RATIOS, TAPES } from '../constants'
import { clamp, createId } from './common'

const randomTilt = (range) => Math.round((Math.random() * 2 - 1) * range)

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
  if (item.src) {
    const aspect = item.aspect ?? 1
    const w = aspect >= 1 ? 110 : 110 * aspect
    return base('sticker', center, w, w / aspect, { src: item.src, name: item.name, rotation: randomTilt(8) })
  }
  return base('sticker', center, 84, 84, { emoji: item.emoji, name: item.name, rotation: randomTilt(8) })
}

export function createTape(item, center) {
  if (item.src) {
    const h = clamp(200 / (item.aspect ?? 6), 18, 70)
    return base('tape', center, 200, h, { src: item.src, name: item.name, edge: 'straight', rotation: randomTilt(6) })
  }
  return base('tape', center, 180, 34, { pattern: item.pattern, edge: 'torn', rotation: randomTilt(6) })
}

export function createPhoto(item, center) {
  const photo = {
    src: item.src,
    name: item.name,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    crop: { fx: 0.5, fy: 0.5, zoom: 1 },
    frame: 'polaroid',
    ratio: '4:5',
    shape: 'rect',
  }
  const w = item.w ?? 240
  return base('photo', center, w, polaroidHeight(w, '4:5'), { ...photo, ...item.extra, rotation: item.rotation ?? randomTilt(4) })
}

export function createObjectFromDecor(item, center) {
  if (item.kind === 'sticker') return createSticker(item, center)
  if (item.kind === 'tape') return createTape(item, center)
  return createPhoto(item, center)
}

export function getObjectName(object) {
  if (object.name) return object.name
  if (object.type === 'tape') return TAPES.find((tape) => tape.pattern === object.pattern)?.name ?? '마스킹테이프'
  return OBJECT_TYPE_LABELS[object.type]
}

/* ---------- 사진 ---------- */

export function polaroidHeight(w, ratioId) {
  const ratio = POLAROID_RATIOS.find((item) => item.id === ratioId)?.value ?? 4 / 5
  const innerW = w * (1 - POLAROID_INSETS.side * 2)
  return innerW / ratio + w * (POLAROID_INSETS.top + POLAROID_INSETS.bottom)
}

/** 사진이 실제로 보이는 안쪽 영역 (오브젝트 좌상단 기준, 논리 좌표) */
export function photoInnerBox(photo) {
  if (photo.frame !== 'polaroid') return { left: 0, top: 0, width: photo.w, height: photo.h }
  const side = photo.w * POLAROID_INSETS.side
  const top = photo.w * POLAROID_INSETS.top
  const bottom = photo.w * POLAROID_INSETS.bottom
  return { left: side, top, width: photo.w - side * 2, height: Math.max(1, photo.h - top - bottom) }
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

/** 중심을 유지하면서 크기를 바꾸는 패치 */
export function resizeAroundCenter(object, w, h) {
  return { w, h, x: object.x + (object.w - w) / 2, y: object.y + (object.h - h) / 2 }
}
