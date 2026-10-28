import { penSweeps } from './strokes.js'

// 바깥 지름 안에서만 번진다. 중심 72%는 선명하게, 가장자리 14%는 점진적으로 옅게.
// alpha는 합성 후 목표 농도다. 같은 획의 구간들을 한 Path로 합쳐 접합부가 진해지지 않는다.
export const FELT_LAYERS = [
  { scale: 1, alpha: 0.04 }, { scale: 0.96, alpha: 0.09 },
  { scale: 0.92, alpha: 0.16 }, { scale: 0.88, alpha: 0.28 },
  { scale: 0.84, alpha: 0.44 }, { scale: 0.8, alpha: 0.65 },
  { scale: 0.76, alpha: 0.86 }, { scale: 0.72, alpha: 0.98 },
].map((layer, i, layers) => ({ ...layer,
  opacity: i ? (layer.alpha - layers[i - 1].alpha) / (1 - layers[i - 1].alpha) : layer.alpha,
}))

const cache = new WeakMap()
export function feltPaths(part, width) {
  const previous = cache.get(part)
  if (previous?.width === width) return previous.paths
  const paths = FELT_LAYERS.map(layer => penSweeps(part.points, width * layer.scale, 'felt', 0,
    { capStart: !part.key, capEnd: !part.continuing }).map(piece => piece.path).join(''))
  cache.set(part, { width, paths })
  return paths
}

export function feltStrokeLayers(parts, width) {
  const paths = parts.map(part => feltPaths(part, width))
  return FELT_LAYERS.map((_, i) => paths.map(part => part[i]).join(''))
}
