import { penSweeps } from './strokes.js'

export function penMaterialSeed(id = '') {
  let value = 2166136261
  for (const char of String(id)) value = Math.imul(value ^ char.charCodeAt(0), 16777619)
  return value >>> 0
}
const noise = (seed, index) => {
  let value = Math.imul((seed ^ index) >>> 0, 0x45d9f3b)
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b)
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296
}
const ellipse = (x, y, rx, ry, angle) => {
  const c = Math.cos(angle), s = Math.sin(angle)
  return Array.from({ length: 8 }, (_, i) => {
    const a = i * Math.PI / 4, dx = Math.cos(a) * rx, dy = Math.sin(a) * ry
    return `${i ? 'L' : 'M'}${(x + c * dx - s * dy).toFixed(3)} ${(y + s * dx + c * dy).toFixed(3)}`
  }).join('') + 'Z'
}

// Continuous opaque core, a soft skirt, then stroke-oriented ink flecks. Each
// particle uses arc distance + persisted seed, never document position/random().
// Whole paths at each opacity prevent darker joins at preview chunk boundaries.
const FELT = [
  { scale: 1, alpha: 0.045 }, { scale: 0.92, alpha: 0.12 },
  { scale: 0.8, alpha: 0.32 }, { scale: 0.68, alpha: 0.7 }, { scale: 0.56, alpha: 0.99 },
]
export const FELT_MATERIAL_OPACITIES = FELT.map((v, i) => i ? (v.alpha - FELT[i - 1].alpha) / (1 - FELT[i - 1].alpha) : v.alpha).concat(0.28)
const cache = new WeakMap()
function feltPart(part, width, seed) {
  const key = `${width}:${seed}`, cached = cache.get(part)
  if (cached?.key === key) return cached.paths
  const paths = FELT.map(layer => penSweeps(part.points, width * layer.scale, 'felt', 0,
    { capStart: !part.key, capEnd: !part.continuing }).map(piece => piece.path).join(''))
  const dots = [], spacing = Math.max(0.6, width * 0.16)
  let distance = part.startDistance ?? 0
  for (let i = 1; i < part.points.length; i++) {
    const a = part.points[i - 1], b = part.points[i], dx = b.x - a.x, dy = b.y - a.y
    const length = Math.hypot(dx, dy)
    if (!length) continue
    const start = a.inkDistance ?? distance, end = b.inkDistance ?? start + length
    const angle = Math.atan2(dy, dx)
    const stride = Math.max(1, Math.ceil((end - start) / spacing / 128))
    for (let n = Math.ceil(start / spacing); n * spacing < end; n += stride) {
      const t = (n * spacing - start) / Math.max(1e-8, end - start)
      const radius = width * ((a.pressure ?? 1) + ((b.pressure ?? 1) - (a.pressure ?? 1)) * t) / 2
      for (const side of [-1, 1]) {
        const lateral = radius * (0.58 + noise(seed, n * 7 + side) * 0.28) * side
        const x = a.x + dx * t - dy / length * lateral
        const y = a.y + dy * t + dx / length * lateral
        dots.push(ellipse(x, y, radius * (0.07 + noise(seed, n * 11 + side) * 0.1), radius * 0.045, angle))
      }
    }
    distance += length
  }
  paths.push(dots.join(''))
  cache.set(part, { key, paths })
  return paths
}
export function feltMaterialLayers(parts, width, seed = 0) {
  const paths = parts.map(part => feltPart(part, width, seed))
  return FELT_MATERIAL_OPACITIES.map((_, i) => paths.map(part => part[i]).join(''))
}

// Finite, nonperiodic ink deposition. Measured pressure is optional; width stays
// governed by the established fountain response. The release force of zero is
// never a reason to cut a hole or collapse the endpoint.
export function fountainInkOpacity(point, distance, { length = Infinity, continuing = false } = {}) {
  const force = Number.isFinite(point?.force) ? point.force : 0.45
  const speed = Number.isFinite(point?.speed) ? point.speed : 0.5
  const pool = Math.max(Math.exp(-distance / 8), continuing ? 0 : Math.exp(-Math.max(0, length - distance) / 8))
  return Math.min(0.99, 0.73 + 0.13 * Math.sqrt(Math.max(0, Math.min(1, force))) + 0.07 / (1 + speed * 2) + 0.11 * pool)
}
