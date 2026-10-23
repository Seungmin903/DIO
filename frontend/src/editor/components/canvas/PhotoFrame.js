import { StyleSheet } from 'react-native'
import Svg, { Path, Rect } from 'react-native-svg'

const FILM_COLOR = '#1F2026'
const FILM_HOLE = 'rgba(255,255,255,0.88)'
// 흰 종이에 흰 폴라로이드를 올려도 가장자리가 보이게 아주 옅은 선
const EDGE = 'rgba(11,25,87,0.16)'
const EDGE_WIDTH = 0.8
const MAT_COLOR = '#FBFAF7'
const MAT_LINE = 'rgba(0,0,0,0.12)'
const FRAME_SHADE = 'rgba(0,0,0,0.22)'

/**
 * 여백 있는 사진 틀의 바탕 (사진은 그 위에 inner 자리에 들어간다).
 * - polaroid: 단색 판
 * - film: 어두운 필름 + 위아래 띠의 구멍
 * - stamp: 가장자리가 톱니(반원 구멍)인 우표
 * - frame: 액자. 틀 색 띠 + 흰 매트 + 사진 둘레의 옅은 안쪽 선
 * width·height·inner 는 화면 px. color 는 틀 색(필름은 고정).
 */
export default function FrameBackdrop({ frame, width, height, inner, color = '#FFFFFF' }) {
  if (width <= 0 || height <= 0) return null
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      {frame === 'film' && <Film width={width} height={height} inner={inner} />}
      {frame === 'stamp' && <Path d={stampPath(width, height)} fill={color} />}
      {frame === 'frame' && <PictureFrame width={width} height={height} inner={inner} color={color} />}
      {frame === 'polaroid' && <Rect width={width} height={height} fill={color} stroke={EDGE} strokeWidth={EDGE_WIDTH} />}
    </Svg>
  )
}

/** 액자: 바깥 틀(색) 안에 흰 매트, 매트와 사진 사이에 옅은 그늘 선 (사진은 inner 자리) */
function PictureFrame({ width, height, inner, color }) {
  const band = inner.left * 0.55 // 틀 띠 두께 (나머지는 매트)
  const shade = Math.max(0.6, inner.left * 0.06)
  return (
    <>
      <Rect width={width} height={height} fill={color} />
      <Rect x={band} y={band} width={width - band * 2} height={height - band * 2} fill={MAT_COLOR} />
      {/* 틀 안쪽 모서리의 그늘 (틀이 매트보다 도드라져 보이게) */}
      <Rect x={band} y={band} width={width - band * 2} height={height - band * 2} fill="none" stroke={FRAME_SHADE} strokeWidth={shade} />
      <Rect
        x={inner.left - shade / 2}
        y={inner.top - shade / 2}
        width={inner.width + shade}
        height={inner.height + shade}
        fill="none"
        stroke={MAT_LINE}
        strokeWidth={shade}
      />
    </>
  )
}

function Film({ width, height, inner }) {
  const band = inner.top
  const holeH = band * 0.42
  const holeW = Math.max(2, width * 0.034)
  const gap = width * 0.075
  const count = Math.max(1, Math.floor((width - gap * 0.5) / gap))
  const start = (width - (count - 1) * gap) / 2
  const r = Math.min(holeW, holeH) * 0.25
  const holes = []
  for (let i = 0; i < count; i += 1) {
    const x = start + i * gap - holeW / 2
    holes.push(<Rect key={`t${i}`} x={x} y={(band - holeH) / 2} width={holeW} height={holeH} rx={r} fill={FILM_HOLE} />)
    holes.push(
      <Rect key={`b${i}`} x={x} y={height - band + (band - holeH) / 2} width={holeW} height={holeH} rx={r} fill={FILM_HOLE} />,
    )
  }
  return (
    <>
      <Rect width={width} height={height} fill={FILM_COLOR} />
      {holes}
    </>
  )
}

/** 네 변에 반원 톱니를 판 우표 모양 (시계 방향으로 돌며 안쪽으로 파낸다) */
function stampPath(w, h) {
  const r = Math.max(1.2, Math.min(w, h) * 0.028)
  const edge = (len) => {
    const n = Math.max(2, Math.round(len / (r * 3.6)))
    return { n, step: len / n }
  }
  const top = edge(w)
  const side = edge(h)
  let d = 'M0 0'
  for (let i = 0; i < top.n; i += 1) {
    const c = top.step * (i + 0.5)
    d += ` L${c - r} 0 A${r} ${r} 0 0 0 ${c + r} 0`
  }
  d += ` L${w} 0`
  for (let i = 0; i < side.n; i += 1) {
    const c = side.step * (i + 0.5)
    d += ` L${w} ${c - r} A${r} ${r} 0 0 0 ${w} ${c + r}`
  }
  d += ` L${w} ${h}`
  for (let i = 0; i < top.n; i += 1) {
    const c = w - top.step * (i + 0.5)
    d += ` L${c + r} ${h} A${r} ${r} 0 0 0 ${c - r} ${h}`
  }
  d += ` L0 ${h}`
  for (let i = 0; i < side.n; i += 1) {
    const c = h - side.step * (i + 0.5)
    d += ` L0 ${c + r} A${r} ${r} 0 0 0 0 ${c - r}`
  }
  return `${d} Z`
}
