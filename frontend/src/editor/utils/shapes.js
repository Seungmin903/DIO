// 도형 자르기에 쓰는 SVG 경로 (w × h 박스 기준)

/** 경로의 좌표쌍을 (sx, sy) 배율로 늘린다. M/L/C/Z 처럼 좌표쌍만 쓰는 경로 전용 */
function scalePath(d, sx, sy) {
  let index = 0
  return d.replace(/-?\d*\.?\d+/g, (match) => {
    const value = Number(match) * (index % 2 === 0 ? sx : sy)
    index += 1
    return value.toFixed(2)
  })
}

const HEART_100 =
  'M50 92 C22 72 0 54 0 30 C0 13 13 0 29 0 C39 0 46 5 50 13 C54 5 61 0 71 0 C87 0 100 13 100 30 C100 54 78 72 50 92 Z'

function starPath(w, h) {
  const points = []
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? 0.5 : 0.22
    points.push(`${(0.5 + Math.cos(angle) * r) * w} ${(0.53 + Math.sin(angle) * r) * h}`)
  }
  return `M${points.join(' L')} Z`
}

export function shapePath(shape, w, h) {
  switch (shape) {
    case 'circle':
      return `M0 ${h / 2} A${w / 2} ${h / 2} 0 1 0 ${w} ${h / 2} A${w / 2} ${h / 2} 0 1 0 0 ${h / 2} Z`
    case 'round': {
      const r = Math.min(w, h) * 0.14
      return `M${r} 0 H${w - r} A${r} ${r} 0 0 1 ${w} ${r} V${h - r} A${r} ${r} 0 0 1 ${w - r} ${h} H${r} A${r} ${r} 0 0 1 0 ${h - r} V${r} A${r} ${r} 0 0 1 ${r} 0 Z`
    }
    case 'heart':
      return scalePath(HEART_100, w / 100, h / 92)
    case 'star':
      return starPath(w, h)
    default:
      return `M0 0 H${w} V${h} H0 Z`
  }
}
