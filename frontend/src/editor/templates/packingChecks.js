import { createId } from '../utils/common.js'
import { createStroke } from '../utils/strokes.js'

// 두 직선을 같은 두께로 잇고 꺾인 지점은 각지게 그린다.
export function packingCheckPath(points, version = 1) {
  if (!Array.isArray(points) || points.length !== 3) return ''
  const [first] = points
  if (version === 4) {
    const x = first.x + 2, y = first.y + 6
    // 사용자가 직접 그린 체크의 윤곽: 가는 시작, 굽은 밑부분, 굵고 긴 오른쪽 획.
    return `M ${x - 2.6} ${y - 6.3} Q ${x - 0.6} ${y - 6.1} ${x + 0.8} ${y - 2.8} L ${x + 4.2} ${y + 3.1} Q ${x + 5.3} ${y + 5.3} ${x + 6.1} ${y + 3.2} L ${x + 11.6} ${y - 11.7} Q ${x + 12} ${y - 12.8} ${x + 13} ${y - 12.1} L ${x + 14.6} ${y - 11.4} L ${x + 8} ${y + 5.2} Q ${x + 6.2} ${y + 7.5} ${x + 3.9} ${y + 5.4} Q ${x + 2.3} ${y + 4.4} ${x + 1.1} ${y + 1.8} Z`
  }
  // 이전 체크도 저장된 요소를 수정하지 않고 새 비율로 표시한다.
  const [a, b, c] = version === 3 ? points : version === 2
    ? checkPoints(first.x - 2.3, first.y - 3.5)
    : checkPoints(first.x + 1, first.y - 4)
  if (![a.x, a.y, b.x, b.y, c.x, c.y].every(Number.isFinite)) return ''
  const normal = (p, q) => {
    const length = Math.hypot(q.x - p.x, q.y - p.y)
    return length ? { x: -(q.y - p.y) / length, y: (q.x - p.x) / length } : null
  }
  const n1 = normal(a, b), n2 = normal(b, c)
  if (!n1 || !n2) return ''
  const denominator = 1 + n1.x * n2.x + n1.y * n2.y
  if (denominator < 0.1) return ''
  const half = 0.45
  const m = { x: (n1.x + n2.x) * half / denominator, y: (n1.y + n2.y) * half / denominator }
  return `M ${a.x + n1.x * half} ${a.y + n1.y * half} L ${b.x + m.x} ${b.y + m.y} L ${c.x + n2.x * half} ${c.y + n2.y * half} L ${c.x - n2.x * half} ${c.y - n2.y * half} L ${b.x - m.x} ${b.y - m.y} L ${a.x - n1.x * half} ${a.y - n1.y * half} Z`
}

const checkPoints = (x, y) => [
  { x: x + 2.1, y: y + 5 },
  { x: x + 4.1, y: y + 7.1 },
  { x: x + 12, y: y - 1.8 },
]

// 좌표는 packing-list 원본 SVG의 네 구역과 여덟 줄을 따른다.
export function packingBoxes(assetId) {
  if (/^remote-packing-list-v[5678]-(portrait|landscape)$/.test(assetId)) {
    const portrait = assetId.endsWith('portrait')
    const xs = portrait ? [40, 220, 400, 580] : [40, 276, 512, 748]
    const top = portrait ? 750 : 587, step = portrait ? 27 : 23
    return xs.flatMap(x => Array.from({ length: 7 }, (_, row) => ({ x, y: top + row * step })))
  }
  if (/^remote-packing-list-v[34]-(portrait|landscape)$/.test(assetId)) {
    const portrait = assetId.endsWith('portrait')
    const xs = portrait ? [40, 220, 400, 580] : [40, 276, 512, 748]
    const top = (portrait ? 798 : 575) + (assetId.includes('-v4-') ? 12 : 0), step = portrait ? 27 : 23
    return xs.flatMap(x => Array.from({ length: 7 }, (_, row) => ({ x, y: top + row * step })))
  }
  const portrait = assetId === 'remote-packing-list-portrait' || assetId === 'remote-packing-list-v2-portrait'
  if (!portrait && assetId !== 'remote-packing-list-landscape' && assetId !== 'remote-packing-list-v2-landscape') return []
  const xs = portrait ? [40, 408] : [602, 810]
  const ys = portrait ? [597, 802] : [207, 463]
  return ys.flatMap(y => xs.flatMap(x => Array.from({ length: 8 }, (_, row) => ({ x, y: y + row * 21 }))))
}

export function packingCheckAction(assetId, point, objects, color = '#292929') {
  const boxes = packingBoxes(assetId)
  const index = boxes.findIndex(({ x, y }) => Math.abs(point.x - x - 5) <= 10 && Math.abs(point.y - y - 5) <= 10)
  if (index < 0) return null
  const existing = objects.filter(o => o.packingCheck === index && o.packingTemplate === 'packing-list')
  if (existing.length) return { type: 'removeObjects', ids: existing.map(o => o.id) }
  const { x, y } = boxes[index]
  const mark = createStroke([{ x: x - 2, y: y - 6 }, { x: x + 6, y: y + 6 }, { x: x + 14, y: y - 12 }], { id: createId(), color, width: 4 })
  return { type: 'addObjects', select: false, objects: [{ ...mark, locked: true, packingTemplate: 'packing-list', packingCheck: index, packingCheckVersion: 4 }] }
}

// 짧은 터치나 체크 획만 처리한다. 길게 이어 쓰는 필기는 원래대로 남긴다.
export function packingPenAction(assetId, points, objects, color) {
  const start = points?.[0]
  if (!start || points.some(p => Math.hypot(p.x - start.x, p.y - start.y) > 30)) return null
  return packingCheckAction(assetId, start, objects, color)
}
