// 연필 획 하나를 앱 Skia 와 같은 함수(strokesPicture)로 오프스크린 표면에 그린다 — 웹 · 썸네일 · 내보내기가 이 그림을 쓴다.
// 요소 상자 기준 좌표(요소 크기 w × h, 크기 바꾼 획은 strokesPicture 가 baseWidth 로 늘린다)에 그려, 요소 래퍼의 위치 · 회전 · 뒤집기를 그대로 받는다.
// 연필은 요소 상자 밖으로 번지는 가장자리가 있어(굵은 획 끝 · 둥근 캡) 상자 둘레에 굵기만큼 여백을 둔다(SVG 연필은 상자에서 잘렸다).
// 진행 거리(inkDistance)가 없는 옛 저장 획은 앱 Skia 도 도장을 못 찍으므로(strokeSkia) SVG 그림으로 둔다. 지우개 조각(sampled)은 그리는 쪽이 거리를 다시 매긴다.
// 잉크펜(유리펜)도 앱(기기)에서는 같은 방식으로 굽는다: 편집 화면은 Skia 셰이더(glassPooled)로 그리는데
// 썸네일 · 내보내기가 SVG 근사(GlassStrokeContent)로 그려 색 · 테 · 글리터가 달라 보였다. 웹 편집 화면은 SVG 그대로라 웹은 바꾸지 않는다(isSkiaRaster).
import { pencilAccumulates } from '../utils/pencilBrush.js'
import { GLASS_INK } from '../utils/glassInk.js'
import { glassOrigin } from '../utils/strokes.js'

export const isSkiaPencil = object =>
  object?.type === 'stroke' && object.penKind === 'pencil' && (object.renderVersion === 2 || object.renderVersion === 3) && object.points?.length > 0
  && (object.sampled || object.taperBaked || object.points.every(p => Number.isFinite(p.inkDistance)))

export const isSkiaGlass = object =>
  object?.type === 'stroke' && object.penKind === 'glass' && object.points?.length > 0 && typeof object.color === 'string'

// Skia 로 구워 띄우는 획(PencilSkiaStroke): 연필, 그리고 앱(웹이 아닌 곳)의 잉크펜 — platform 은 Platform.OS
export const isSkiaRaster = (object, platform) => isSkiaPencil(object) || (platform !== 'web' && isSkiaGlass(object))

// 연필은 겹쳐 묻으면 불투명도를 넘어 쌓인다(pencilBrush pencilAccumulates) — 획 그림 안에 불투명도까지 구워야 편집 화면과 같고, 요소 래퍼가 다시 곱하면 안 된다(objectDrawOpacity)
export const pencilBakesOpacity = object => isSkiaPencil(object) && pencilAccumulates()

const MAX_EDGE = 4096, MAX_PIXELS = 16 * 1024 * 1024

// 요소 상자 기준 그림 범위(CSS 단위) — 배율과 무관
export function pencilRasterBounds(object) {
  const sx = object.baseWidth ? object.w / object.baseWidth : 1, sy = object.baseHeight ? object.h / object.baseHeight : 1
  // 잉크펜은 획 둘레로 번짐(halo, 블러 시그마 haloSpread)이 퍼지므로 그만큼(3σ) 더 둔다
  const pad = (object.strokeWidth ?? 3) + 2 + (object.penKind === 'glass' ? 3 * GLASS_INK.haloSpread : 0)
  return { left: -pad * sx, top: -pad * sy, width: object.w + 2 * pad * sx, height: object.h + 2 * pad * sy }
}

// 모양을 정하는 값(불투명도 · 배율 제외). 이 값과 점이 같으면 불투명도 · 배율만 다른 그림이라 잠깐 대신 보여 줘도 된다
const pencilShapeKey = object => [object.penKind, object.color, object.strokeWidth, object.materialSeed, object.sampled, object.taperBaked,
  object.grainOrigin?.x, object.grainOrigin?.y, object.inkStartDistance, object.w, object.h, object.baseWidth, object.baseHeight,
  // 잉크펜: 무늬 기준점 · 글리터 · 테 설정이 바뀌면 다른 그림
  ...(object.penKind === 'glass' ? [glassOrigin(object).x, glassOrigin(object).y, object.inkGlitter, object.inkSheen, object.inkFilm,
    object.inkGlitterColor, object.inkAmount, object.inkSheenColor, object.inkSheenAmount] : [])].join('|')
// 같은 획 · 같은 배율이면 같은 그림이라는 열쇠
export const pencilRasterKey = (object, scale) => [pencilShapeKey(object), pencilBakesOpacity(object) ? object.opacity ?? 1 : 1, scale].join('|')
// 새 그림을 시간 예산 때문에 미루는 동안 대신 보여 줄 이전 그림: 불투명도 · 배율만 다를 때만(색 · 굵기 · 크기 · 점이 바뀌었으면 옛 그림을 보여 주지 않는다)
export const rememberRaster = (object, raster) => ({ raster, points: object.points, shape: pencilShapeKey(object) })
export const reusableRaster = (remembered, object) => remembered && remembered.points === object.points && remembered.shape === pencilShapeKey(object) ? remembered.raster : null

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
    // 위치 · 회전 · 뒤집기는 요소 래퍼가 맡는다 → 원점에서 그린다. 불투명도는 그림 안에(pencilBakesOpacity)
    // 잉크펜 무늬는 페이지에 붙어 있다(glassOrigin: 저장된 inkOrigin, 없으면 요소 원래 위치) → 원점으로 옮기기 전에 정해 둬야 편집 화면과 같은 자리에 반짝인다
    const local = { ...object, x: 0, y: 0, rotation: 0, flipX: false, flipY: false, opacity: pencilBakesOpacity(object) ? object.opacity ?? 1 : 1,
      ...(object.penKind === 'glass' && { inkOrigin: glassOrigin(object) }) }
    canvas.drawPicture(runtime.strokesPicture([local], undefined, s))
    surface.flush()
    const image = surface.makeImageSnapshot()
    return { image, pxWidth, pxHeight, ...bounds, scale: s, dispose: () => { image.dispose?.(); surface.dispose?.() } }
  } catch (error) {
    surface.dispose?.()
    throw error
  }
}
