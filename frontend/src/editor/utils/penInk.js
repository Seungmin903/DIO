import { simplifyInkPreview } from './inkPreviewGeometry.js'
import { penSweeps, samplePenPart } from './strokes.js'
import { fountainInkOpacity } from './penMaterials.js'

const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }
export function inkOpacity(kind, distance, { length = Infinity, continuing = false } = {}) {
  if (kind === 'fountain') return 1
  if (kind === 'brush') return 0.96 - 0.4 * smooth((distance - 120) / 360)
  const pooling = Math.max(1 - smooth(distance / 18), continuing ? 0 : 1 - smooth((length - distance) / 18))
  return Math.min(0.98, 0.84 + 0.035 * Math.sin(distance / 23) + 0.12 * pooling)
}

const BRUSH_LEVELS = Array.from({ length: 41 }, (_, i) => 0.56 + i * 0.01)
const fullInkLevels = kind => kind === 'fountain' ? [1] : BRUSH_LEVELS
// 만년필 · 붓펜은 잉크 농도 변화 없이 불투명도 100으로 그린다(사용자 결정 2026-11-02). 이미 그린 획도 같다.
// 단계를 하나(1)로 두면 모든 조각이 한 Path 에 모여 겹침 · 이음에서도 같은 색이다. 예전 단계 표는 되돌릴 때를 위해 남겨 둔다.
const SOLID_INK = true
export function inkLevels(kind, renderVersion = 2, preview = false) {
  if (SOLID_INK) return [1]
  const full = fullInkLevels(kind, renderVersion)
  if (!preview || kind === 'fountain') return full
  return Array.from({ length: 8 }, (_, i) => full[Math.round(i * (full.length - 1) / 7)])
}
const cache = new WeakMap()

// 완성된 미리보기 구간은 재계산하지 않는다. 1% 농도 단계로 밴딩을 줄인다.
// 같은 농도의 도형은 하나의 Path에 모아 구간 경계/되짚기에서 중복 알파가 쌓이지 않는다.
// 누적 단계는 교차부도 최대 농도로 합성한다. 단일 알파 bucket으로 바꾸면
// 서로 다른 농도의 교차부가 더 진해질 수 있어 별도 시각/성능 검증이 필요하다.
export function inkPaths(part, width, kind, endPool = false, renderVersion = 2, preview = false) {
  const key = `${width}:${kind}:${endPool}:${renderVersion}:${preview}`
  const previous = cache.get(part)
  if (previous?.key === key) return previous.paths
  const sampled = samplePenPart(part)
  const length = sampled.at(-1)?.inkDistance ?? part.startDistance ?? 0
  const levels = inkLevels(kind, renderVersion, preview), buckets = levels.map(() => [])
  for (const piece of penSweeps(preview ? simplifyInkPreview(sampled, width) : sampled, width, kind, part.startDistance ?? 0,
    { capStart: !part.key && !endPool, capEnd: !part.continuing })) {
    const opacity = kind === 'fountain' && renderVersion === 3
      ? fountainInkOpacity(piece.point, piece.distance, { length, continuing: !endPool })
      : inkOpacity(kind, piece.distance, { length, continuing: !endPool })
    levels.forEach((level, i) => { if (i === 0 || opacity >= level) buckets[i].push(piece.path) })
  }
  const paths = buckets.map(bucket => bucket.join(''))
  cache.set(part, { key, paths })
  return paths
}

export function strokeInkLayers(parts, width, kind, renderVersion = 2, preview = false) {
  const paths = parts.map(part => inkPaths(part, width, kind, false, renderVersion, preview))
  // 끝의 농도는 마지막 24좌표만 별도로 계산한다. 완성 구간에 끝 효과를 굳히거나,
  // 미리보기 분할 경계마다 잉크 고임이 생기지 않게 한다.
  if (kind === 'fountain' && parts.length && parts.at(-1).points.length) {
    const tail = parts.at(-1)
    let total = tail.startDistance ?? 0
    for (let i = 1; i < tail.points.length; i++) total += Math.hypot(tail.points[i].x - tail.points[i - 1].x, tail.points[i].y - tail.points[i - 1].y)
    const ending = []
    let travelled = 0, previousIndex = Infinity, curveBefore, needsContext = false
    outer: for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      const part = parts[partIndex], offset = Math.max(0, (part.key ?? 0) - 1)
      for (let i = part.points.length - 1; i >= 0; i--) {
        const index = offset + i
        if (index >= previousIndex) continue
        const point = part.points[i]
        if (needsContext) { curveBefore = point; break outer }
        const before = ending.at(-1)
        if (before) travelled += Math.hypot(point.x - before.x, point.y - before.y)
        ending.push(point); previousIndex = index
        if (travelled >= 24) needsContext = true
      }
    }
    paths.push(inkPaths({ points: ending.reverse(), curveBefore, startDistance: total - travelled }, width, kind, true, renderVersion, preview))
  }
  return inkLevels(kind, renderVersion, preview).map((_, index) => paths.map(part => part[index]).join(''))
}
