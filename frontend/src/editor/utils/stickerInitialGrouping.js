import { splitGroups } from './stickerSplitGroups.js'

// Match the existing 0.1% slider steps. Never discard candidates to meet a count.
export async function initialStickerGrouping(parts, shortSide, queryEdges, check = () => {}) {
  const ids = parts.map(part => part.id)
  const zero = { distance: 0, edges: [], count: ids.length }
  check()
  if (ids.length <= 50 || !Number.isFinite(shortSide) || shortSide <= 0) return zero
  const cache = new Map([[0, zero]])
  async function at(step) {
    check()
    if (!cache.has(step)) {
      const distance = step / 10
      const edges = await queryEdges(shortSide * distance / 100)
      check()
      cache.set(step, { distance, edges, count: splitGroups(parts, ids, edges).length })
    }
    return cache.get(step)
  }
  const maximum = await at(50)
  if (maximum.count > 50) return maximum
  let low = 1, high = 50
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if ((await at(mid)).count <= 50) high = mid
    else low = mid + 1
  }
  const first = await at(low)
  // A discontinuous jump below 20 must not force unrelated stickers together.
  return first.count >= 20 ? first : at(low - 1)
}
