// 수동 멈춤 표시 뒤에만 읽는다. 픽셀/좌표는 전송하지 않고 비어 있는 캐시 개수만 반환한다.
export function probeDisplayPixels(root) {
  const started = performance.now()
  let emptyCachedBatches = 0, unreadableCachedBatches = 0
  const canvases = [...root.querySelectorAll('canvas[data-dio-cache-ready="true"]')]
  for (const canvas of canvases) {
    try {
      const context = canvas.getContext('2d')
      if (!context || !canvas.width || !canvas.height) { unreadableCachedBatches++; continue }
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let ink = false
      for (let i = 3; i < data.length; i += 4) if (data[i]) { ink = true; break }
      if (!ink) emptyCachedBatches++
    } catch { unreadableCachedBatches++ }
  }
  return { cachedBatches: canvases.length, emptyCachedBatches, unreadableCachedBatches,
    pendingPreviews: root.querySelectorAll('[data-stroke-preview-id]').length,
    completedVectorNodes: root.querySelectorAll('[data-completed-stroke-id]').length,
    probeJsMs: performance.now() - started }
}
