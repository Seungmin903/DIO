// 연필 획 하나를 앱 Skia 와 같은 함수(strokesPicture)로 오프스크린 표면에 그린다 — 웹 · 썸네일 · 내보내기가 이 그림을 쓴다.
// 요소 상자 기준 좌표(요소 크기 w × h, 크기 바꾼 획은 strokesPicture 가 baseWidth 로 늘린다)에 그려, 요소 래퍼의 위치 · 회전 · 뒤집기를 그대로 받는다.
// 연필은 요소 상자 밖으로 번지는 가장자리가 있어(굵은 획 끝 · 둥근 캡) 상자 둘레에 굵기만큼 여백을 둔다(SVG 연필은 상자에서 잘렸다).
// 진행 거리(inkDistance)가 없는 옛 저장 획은 앱 Skia 도 도장을 못 찍으므로(strokeSkia) SVG 그림으로 둔다. 지우개 조각(sampled)은 그리는 쪽이 거리를 다시 매긴다.
export const isSkiaPencil = object =>
  object?.type === 'stroke' && object.penKind === 'pencil' && (object.renderVersion === 2 || object.renderVersion === 3) && object.points?.length > 0
  && (object.sampled || object.taperBaked || object.points.every(p => Number.isFinite(p.inkDistance)))

const MAX_EDGE = 4096, MAX_PIXELS = 16 * 1024 * 1024

// 요소 상자 기준 그림 범위(CSS 단위) — 배율과 무관
export function pencilRasterBounds(object) {
  const sx = object.baseWidth ? object.w / object.baseWidth : 1, sy = object.baseHeight ? object.h / object.baseHeight : 1
  const pad = (object.strokeWidth ?? 3) + 2
  return { left: -pad * sx, top: -pad * sy, width: object.w + 2 * pad * sx, height: object.h + 2 * pad * sy }
}

// 같은 획 · 같은 배율이면 같은 그림이라는 열쇠
export const pencilRasterKey = (object, scale) => [object.color, object.strokeWidth, object.materialSeed, object.sampled, object.taperBaked,
  object.grainOrigin?.x, object.grainOrigin?.y, object.inkStartDistance, object.w, object.h, object.baseWidth, object.baseHeight, scale].join('|')

// → { image: SkImage(투명 바탕), pxWidth, pxHeight, ...bounds, scale } · 그릴 수 없으면 null
export function drawPencilRaster(runtime, object, scale) {
  const bounds = pencilRasterBounds(object)
  let s = scale
  const area = bounds.width * bounds.height
  s = Math.min(s, MAX_EDGE / bounds.width, MAX_EDGE / bounds.height, Math.sqrt(MAX_PIXELS / area))
  const pxWidth = Math.max(1, Math.ceil(bounds.width * s)), pxHeight = Math.max(1, Math.ceil(bounds.height * s))
  const surface = runtime.makeSurface(pxWidth, pxHeight)
  if (!surface) return null
  try {
    const canvas = surface.getCanvas()
    canvas.scale(pxWidth / bounds.width, pxHeight / bounds.height)
    canvas.translate(-bounds.left, -bounds.top)
    // 위치 · 회전 · 뒤집기 · 투명도는 요소 래퍼가 맡는다 → 원점에서 그린다
    const local = { ...object, x: 0, y: 0, rotation: 0, flipX: false, flipY: false, opacity: 1 }
    canvas.drawPicture(runtime.strokesPicture([local], undefined, s))
    surface.flush()
    const image = surface.makeImageSnapshot()
    return { image, pxWidth, pxHeight, ...bounds, scale: s, dispose: () => { image.dispose?.(); surface.dispose?.() } }
  } catch (error) {
    surface.dispose?.()
    throw error
  }
}
