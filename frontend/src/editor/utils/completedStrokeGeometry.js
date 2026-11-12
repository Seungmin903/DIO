import { createInkRestoreCache } from './inkRestoreCache.js'
import { strokeInkLayers } from './penInk.js'
import { feltStrokeLayers } from './feltStroke.js'
import { feltMaterialLayers } from './penMaterials.js'

// Shared by thumbnails and the canvas. Only immutable, completed objects enter
// this cache; live input and reduced eraser previews retain their own geometry.
// This budget bounds retained path text, not the app's total memory usage.
export function createCompletedStrokeGeometry(options = {}) {
  const cache = createInkRestoreCache({ maxChars: 4_000_000, maxEntries: 2048, ...options })
  return {
    ink(object) {
      return cache.get(object, () => strokeInkLayers([
        { points: object.points, startDistance: object.inkStartDistance ?? 0, continuing: false },
      ], object.strokeWidth, object.penKind, object.renderVersion)).paths
    },
    felt(object) {
      return cache.get(object, () => object.renderVersion === 3
        ? feltMaterialLayers([{ points: object.points }], object.strokeWidth, object.materialSeed ?? 0)
        : feltStrokeLayers([{ points: object.points }], object.strokeWidth)).paths
    },
    stats: cache.stats,
  }
}

export const completedStrokeGeometry = createCompletedStrokeGeometry()
