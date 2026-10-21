// Deterministic paper tooth. Fine deposits are batched once, not regenerated while drawing.
export const GRAPHITE_TILE_SIZE = 24
const noise = (i) => {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
const n = value => Number(value.toFixed(3))
function particles(side, seed, radius) {
  const cell = GRAPHITE_TILE_SIZE / side
  return Array.from({ length: side * side }, (_, i) => {
    const r = radius * (0.5 + noise(seed + i) * 0.8)
    const x = (i % side + 0.2 + noise(seed + i + 311) * 0.6) * cell
    const y = (Math.floor(i / side) + 0.2 + noise(seed + i + 617) * 0.6) * cell
    return `M${n(x-r)} ${n(y)}l${n(r*0.8)} ${n(-r*0.65)} ${n(r*1.3)} ${n(r*0.25)} ${n(-r*0.35)} ${n(r*0.95)} ${n(-r)} ${n(r*0.2)}Z`
  }).join('')
}
export const GRAPHITE_DUST = particles(32, 17, 0.33)
export const GRAPHITE_GRAINS = particles(25, 1231, 0.44)
export const GRAPHITE_FIBERS = Array.from({ length: 110 }, (_, i) => {
  const x = 1 + noise(i + 2301) * 20, y = 2 + noise(i + 2501) * 20
  return `M${n(x)} ${n(y)}l${n(0.8 + noise(i + 2701) * 1.8)} ${n(-0.3 - noise(i + 2901) * 0.7)}`
}).join('')
export function pencilTextureSettings(width) {
  return {
    // Paper tooth stays fine even when a wide pencil is selected.
    tileSize: 12,
    baseOpacity: width <= 2 ? 0.24 : 0.1,
  }
}
