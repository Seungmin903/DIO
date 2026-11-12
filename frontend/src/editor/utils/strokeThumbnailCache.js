// Bounded display-only cache. Entries require the same immutable objects and
// page dimensions; neither ids nor counts alone establish reuse.
export function createStrokeThumbnailCache({ maxPixels = 1024 * 1024, maxEntries = 256 } = {}) {
  const entries = new Map()
  let pixels = 0
  const remove = key => { const value = entries.get(key); if (value) { pixels -= value.pixels; entries.delete(key) } }
  return {
    get(objects, offset, width, height) {
      const entry = entries.get(objects[offset])
      if (!entry || entry.batch.width !== width || entry.batch.height !== height
        || !entry.batch.objects.every((object, index) => objects[offset + index] === object)) return null
      entries.delete(objects[offset]); entries.set(objects[offset], entry)
      return entry
    },
    put(batch, image, size) {
      if (!batch.objects.length || !Number.isFinite(size) || size <= 0 || size > maxPixels) return null
      const key = batch.objects[0]
      remove(key)
      while (entries.size && (entries.size >= maxEntries || pixels + size > maxPixels)) remove(entries.keys().next().value)
      const entry = { batch, image, pixels: size }
      entries.set(key, entry); pixels += size
      // Eviction drops ownership; it must not zero a canvas still being read by
      // an already-mounted thumbnail. Its final consumer releases it via GC.
      return entry
    },
    stats() { return { entries: entries.size, pixels } },
    clear() { entries.clear(); pixels = 0 },
  }
}
