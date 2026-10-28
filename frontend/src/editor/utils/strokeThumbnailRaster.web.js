import { createStrokeThumbnailCache } from './strokeThumbnailCache.js'

export const strokeThumbnails = createStrokeThumbnailCache()

// At most 256 pixels across a full logical page: sufficient for the 122px
// page-list preview at 2x. Completed editor buffers remain separately owned.
export function rememberStrokeThumbnail(batch, source) {
  if (!source?.width || !source.height) return null
  const scale = 256 / batch.width
  const width = Math.max(1, Math.ceil(batch.w * scale)), height = Math.max(1, Math.ceil(batch.h * scale))
  if (width * height > 1024 * 1024) return null
  try {
    const image = document.createElement('canvas'); image.width = width; image.height = height
    const context = image.getContext('2d')
    if (!context) return null
    context.drawImage(source, 0, 0, width, height)
    return strokeThumbnails.put(batch, image, width * height)
  } catch { return null }
}
