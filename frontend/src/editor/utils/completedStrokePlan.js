import { rotatedBounds } from './common.js'

export const STROKES_PER_BATCH = 32
// 화면 표시 캐시는 페이지 하나당 최대 약 16MB로 제한한다.
export const STROKE_CACHE_PIXELS = 4 * 1024 * 1024
const MAX_TEXTURE_EDGE = 4096

// 문서와 별개인 표시 계획. 원본 요소·레이어 순서·좌표는 변경하지 않는다.
export function createCompletedStrokePlanner() {
  const remembered = new WeakMap()
  return (objects, { width, height, zoom, pixelRatio }) => {
    const layers = []
    let remaining = STROKE_CACHE_PIXELS
    for (let i = 0; i < objects.length;) {
      const object = objects[i]
      if (object.hidden) { i++; continue }
      if (object.type !== 'stroke') { layers.push({ object }); i++; continue }
      const strokes = []
      while (i < objects.length && objects[i].type === 'stroke' && strokes.length < STROKES_PER_BATCH) {
        if (!objects[i].hidden) strokes.push(objects[i])
        i++
      }
      let batch = remembered.get(strokes[0])
      if (!batch || batch.width !== width || batch.height !== height
        || batch.objects.length !== strokes.length || strokes.some((stroke, index) => stroke !== batch.objects[index])) {
        const boxes = strokes.map(rotatedBounds)
        // 페이지 밖 경로는 저장하되, 캐시의 할당 범위는 페이지 안으로 제한한다.
        const left = Math.max(0, Math.min(...boxes.map(box => box.left)) - 1)
        const top = Math.max(0, Math.min(...boxes.map(box => box.top)) - 1)
        const right = Math.min(width, Math.max(...boxes.map(box => box.right)) + 1)
        const bottom = Math.min(height, Math.max(...boxes.map(box => box.bottom)) + 1)
        batch = { objects: strokes, width, height, left, top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
        remembered.set(strokes[0], batch)
      }
      const pixelWidth = Math.ceil(batch.w * zoom * pixelRatio)
      const pixelHeight = Math.ceil(batch.h * zoom * pixelRatio)
      const pixels = pixelWidth * pixelHeight
      const rasterize = strokes.length >= 4 && pixels > 0 && pixels <= remaining
        && pixelWidth <= MAX_TEXTURE_EDGE && pixelHeight <= MAX_TEXTURE_EDGE
      if (rasterize) remaining -= pixels
      layers.push({ batch, rasterize })
    }
    return layers
  }
}
