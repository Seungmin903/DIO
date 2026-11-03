import { rotatedBounds } from './common.js'

export const STROKES_PER_BATCH = 32
// 화면 표시 캐시는 페이지 하나당 최대 약 16MB로 제한한다.
export const STROKE_CACHE_PIXELS = 4 * 1024 * 1024
const MAX_TEXTURE_EDGE = 4096

// Keep native completed ink mounted across editing and reading. Web retains its live-tool cache policy.
export function shouldCacheCompletedStrokes(platform, readOnly, tool) {
  return platform !== 'web' || !readOnly && (tool === 'pen' || tool === 'highlighter' || tool === 'eraser')
}

// 문서와 별개인 표시 계획. 원본 요소·레이어 순서·좌표는 변경하지 않는다.
export function createCompletedStrokePlanner({ batchSize = STROKES_PER_BATCH, minBatchSize = 4, alignPixels = false, preserveBatches = false } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > STROKES_PER_BATCH) throw Error('Invalid stroke batch size')
  if (!Number.isInteger(minBatchSize) || minBatchSize < 1 || minBatchSize > STROKES_PER_BATCH) throw Error('Invalid minimum stroke batch size')
  const remembered = new WeakMap()
  return (objects, { width, height, zoom, pixelRatio, pixelBudget = STROKE_CACHE_PIXELS, uncachedObjects = null }) => {
    const layers = []
    let remaining = Number.isFinite(pixelBudget) && pixelBudget >= 0 ? Math.min(STROKE_CACHE_PIXELS, pixelBudget) : STROKE_CACHE_PIXELS
    for (let i = 0; i < objects.length;) {
      const object = objects[i]
      if (object.hidden) { i++; continue }
      if (object.type !== 'stroke' || uncachedObjects?.has(object)) { layers.push({ object }); i++; continue }
      const strokes = []
      // 이미 캐시 가능한 크기가 된 묶음은 봉인한다. 새 획 때문에 마지막 캐시를 버리지 않는다.
      const previous = remembered.get(object)
      const reusablePrefix = preserveBatches && previous?.objects.length >= 4
        && previous.objects.every((stroke, offset) => objects[i + offset] === stroke)
      const limit = preserveBatches && previous?.objects.length >= 4 ? previous.objects.length : batchSize
      while (i < objects.length && objects[i].type === 'stroke' && !uncachedObjects?.has(objects[i]) && strokes.length < limit) {
        // 삭제 후에도 다음의 변경 없는 묶음 경계를 유지한다.
        if (preserveBatches && !reusablePrefix && strokes.length && remembered.get(objects[i])?.objects.length >= 4) break
        if (!objects[i].hidden) strokes.push(objects[i])
        i++
      }
      let batch = remembered.get(strokes[0])
      if (!batch || batch.width !== width || batch.height !== height
        || (alignPixels && (batch.zoom !== zoom || batch.pixelRatio !== pixelRatio))
        || batch.objects.length !== strokes.length || strokes.some((stroke, index) => stroke !== batch.objects[index])) {
        const boxes = strokes.map(rotatedBounds)
        // 페이지 밖 경로는 저장하되, 캐시의 할당 범위는 페이지 안으로 제한한다.
        const scale = zoom * pixelRatio
        const floor = value => alignPixels ? Math.floor(value * scale) / scale : value
        const ceil = value => alignPixels ? Math.ceil(value * scale) / scale : value
        const left = floor(Math.max(0, Math.min(...boxes.map(box => box.left)) - 1))
        const top = floor(Math.max(0, Math.min(...boxes.map(box => box.top)) - 1))
        const right = ceil(Math.min(width, Math.max(...boxes.map(box => box.right)) + 1))
        const bottom = ceil(Math.min(height, Math.max(...boxes.map(box => box.bottom)) + 1))
        batch = { objects: strokes, width, height, zoom, pixelRatio, left, top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
        remembered.set(strokes[0], batch)
      }
      const pixelWidth = Math.ceil(batch.w * zoom * pixelRatio)
      const pixelHeight = Math.ceil(batch.h * zoom * pixelRatio)
      const pixels = pixelWidth * pixelHeight
      const rasterize = strokes.length >= minBatchSize && pixels > 0 && pixels <= remaining
        && pixelWidth <= MAX_TEXTURE_EDGE && pixelHeight <= MAX_TEXTURE_EDGE
      if (rasterize) remaining -= pixels
      layers.push({ batch, rasterize })
    }
    return layers
  }
}
