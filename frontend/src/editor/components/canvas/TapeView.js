import { useMediaUri } from '../../hooks/useMediaUri'
import { coverLayout } from '../../utils/objects'
import { LEGACY_TAPE_PATTERNS, TAPE_PALETTES } from '../../constants'
import { useSvgId } from '../../utils/svgId'
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Line, Path, Pattern, Polygon, Rect } from 'react-native-svg'

const TAPE_OPACITY = 0.88
// 기본 테이프 크기(180×34)의 가로:세로. 이미지 테이프 자르기 틀도 이 비율을 쓴다.
export const TAPE_RATIO = 180 / 34

/** 무늬 + 색 정하기. 예전 문서의 무늬 이름(mint-stripe 등)도 지금 방식으로 바꿔 읽는다. */
export function tapeLook(pattern, palette) {
  const legacy = LEGACY_TAPE_PATTERNS[pattern]
  const look = { pattern: legacy?.pattern ?? pattern ?? 'solid', palette: palette ?? legacy?.palette ?? 'lavender' }
  const colors = TAPE_PALETTES.find((p) => p.id === look.palette) ?? TAPE_PALETTES[0]
  return { ...look, bg: colors.bg, fg: colors.fg }
}

/**
 * 무늬 타일. 바탕(bg)·무늬(fg) 두 색으로 그려서 무늬는 그대로 두고 색만 바꿀 수 있다.
 * 화면 배율과 상관없이 같은 밀도로 보이도록 scale 을 곱한다.
 */
function PatternTile({ id, pattern, bg, fg, scale }) {
  const s = (v) => v * scale
  switch (pattern) {
    case 'stripe':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(16)}>
          <Rect width={s(16)} height={s(16)} fill={bg} />
          <Path
            d={`M${s(-4)} ${s(4)} L${s(4)} ${s(-4)} M0 ${s(16)} L${s(16)} 0 M${s(12)} ${s(20)} L${s(20)} ${s(12)}`}
            stroke={fg}
            strokeOpacity={0.8}
            strokeWidth={s(5.5)}
          />
        </Pattern>
      )
    case 'dot':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(12)}>
          <Rect width={s(12)} height={s(12)} fill={bg} />
          <Circle cx={s(6)} cy={s(6)} r={s(2.6)} fill={fg} />
        </Pattern>
      )
    case 'check':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(14)} height={s(14)}>
          <Rect width={s(14)} height={s(14)} fill={bg} />
          <Rect width={s(7)} height={s(14)} fill={fg} fillOpacity={0.45} />
          <Rect width={s(14)} height={s(7)} fill={fg} fillOpacity={0.45} />
        </Pattern>
      )
    case 'kraft':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(7)} height={s(7)}>
          <Rect width={s(7)} height={s(7)} fill={bg} />
          <Rect width={s(2)} height={s(7)} fill={fg} fillOpacity={0.18} />
        </Pattern>
      )
    case 'grid':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(8)} height={s(8)}>
          <Rect width={s(8)} height={s(8)} fill={bg} />
          <Line x1="0" y1="0" x2={s(8)} y2="0" stroke={fg} strokeOpacity={0.7} strokeWidth={s(1)} />
          <Line x1="0" y1="0" x2="0" y2={s(8)} stroke={fg} strokeOpacity={0.7} strokeWidth={s(1)} />
        </Pattern>
      )
    case 'wave':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(12)}>
          <Rect width={s(24)} height={s(12)} fill={bg} />
          <Path d={`M0 ${s(6)} Q${s(6)} ${s(1)} ${s(12)} ${s(6)} T${s(24)} ${s(6)}`} stroke={fg} strokeWidth={s(1.6)} fill="none" />
        </Pattern>
      )
    case 'gingham':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(16)}>
          <Rect width={s(16)} height={s(16)} fill={bg} />
          <Rect width={s(8)} height={s(16)} fill={fg} fillOpacity={0.3} />
          <Rect width={s(16)} height={s(8)} fill={fg} fillOpacity={0.3} />
        </Pattern>
      )
    case 'heart':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(18)} height={s(18)}>
          <Rect width={s(18)} height={s(18)} fill={bg} />
          <Path
            d={`M${s(9)} ${s(13)} C${s(3)} ${s(9)} ${s(4)} ${s(4.5)} ${s(7)} ${s(5)} C${s(8)} ${s(5.2)} ${s(8.6)} ${s(6)} ${s(9)} ${s(6.8)} C${s(9.4)} ${s(6)} ${s(10)} ${s(5.2)} ${s(11)} ${s(5)} C${s(14)} ${s(4.5)} ${s(15)} ${s(9)} ${s(9)} ${s(13)}Z`}
            fill={fg}
          />
        </Pattern>
      )
    case 'star':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(20)} height={s(20)}>
          <Rect width={s(20)} height={s(20)} fill={bg} />
          <Path
            d={`M${s(6)} ${s(2)} L${s(7)} ${s(5)} L${s(10)} ${s(6)} L${s(7)} ${s(7)} L${s(6)} ${s(10)} L${s(5)} ${s(7)} L${s(2)} ${s(6)} L${s(5)} ${s(5)}Z`}
            fill={fg}
          />
          <Circle cx={s(15)} cy={s(15)} r={s(1.1)} fill={fg} />
        </Pattern>
      )
    case 'plaid':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(20)} height={s(20)}>
          <Rect width={s(20)} height={s(20)} fill={bg} />
          <Rect x={s(6)} width={s(6)} height={s(20)} fill={fg} fillOpacity={0.28} />
          <Rect y={s(6)} width={s(20)} height={s(6)} fill={fg} fillOpacity={0.28} />
          <Line x1={s(16)} y1="0" x2={s(16)} y2={s(20)} stroke={fg} strokeOpacity={0.6} strokeWidth={s(0.8)} />
          <Line x1="0" y1={s(16)} x2={s(20)} y2={s(16)} stroke={fg} strokeOpacity={0.6} strokeWidth={s(0.8)} />
        </Pattern>
      )
    default:
      // solid: 무늬 없이 한 가지 색(진한 쪽)
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(10)}>
          <Rect width={s(10)} height={s(10)} fill={fg} />
        </Pattern>
      )
  }
}

/**
 * 손으로 찢은 듯한 테이프 끝. 잘게 들쭉날쭉한 톱니를 위에서 아래로 놓되 깊이를 조금씩 달리한다.
 * 같은 크기면 항상 같은 모양이 나오도록 난수 대신 사인값으로 흔든다. (다시 그릴 때 모양이 바뀌지 않게)
 */
function tornPolygon(w, h) {
  // 톱니 하나의 높이를 키워(지그재그를 넓게) 테이프 높이에 4~6개 정도 들어가게 한다.
  const teeth = Math.max(3, Math.round(h / 7))
  const depth = Math.min(Math.max(3, h * 0.17), w * 0.12)
  const jitter = (i, seed) => 0.55 + 0.45 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233))
  const right = []
  const left = []
  for (let i = 0; i <= teeth * 2; i += 1) {
    const y = (h / (teeth * 2)) * i
    // 짝수 칸은 바깥, 홀수 칸은 안쪽으로 파고든다.
    const inR = i % 2 ? depth * jitter(i, 1) : depth * 0.12 * jitter(i, 3)
    const inL = i % 2 ? depth * jitter(i, 2) : depth * 0.12 * jitter(i, 4)
    right.push(`${(w - inR).toFixed(2)},${y.toFixed(2)}`)
    left.push(`${inL.toFixed(2)},${(h - y).toFixed(2)}`)
  }
  return [...right, ...left].join(' ')
}

/**
 * 마스킹테이프. 기본 패턴은 SVG 무늬로 채우고, 사용자가 올린 이미지는 테이프 네모 틀에 꽉 채워(cover) 넣는다.
 * 어느 쪽이든 끝 모양(절취선·직선)으로 자르고 테이프처럼 살짝 비치게 그린다.
 */
export default function TapeView({ pattern, palette, src, mediaFileId, crop, imageWidth, imageHeight, edge = 'torn', width, height, scale = 1, onAssetLoad }) {
  const uri = useMediaUri({ src, mediaFileId })
  const hasImage = Boolean(mediaFileId || src)
  const svgId = useSvgId('tape')
  const look = tapeLook(pattern, palette)
  // 무늬·색이 바뀌면 id 도 바꾼다. (같은 id 로 내용만 바꾸면 기기에서 이전 모양이 남는 경우가 있다)
  const patternId = `${svgId}-pattern-${look.pattern}-${look.palette}`
  // 끝 모양마다 다른 id 를 쓴다. 같은 id 로 ClipPath 안 도형만 바꾸면 웹·iOS 가 이전 잘림을 그대로 써서
  // 절취선↔직선을 바꿔도 미리보기가 안 바뀌었다.
  const clipId = `${svgId}-clip-${edge}`
  return (
    <Svg key={`${edge}-${look.pattern}-${look.palette}`} width={width} height={height}>
      <Defs>
        {!hasImage && <PatternTile id={patternId} pattern={look.pattern} bg={look.bg} fg={look.fg} scale={scale} />}
        <ClipPath id={clipId} key={clipId}>
          {edge === 'torn' ? <Polygon points={tornPolygon(width, height)} /> : <Rect width={width} height={height} />}
        </ClipPath>
      </Defs>
      <G clipPath={`url(#${clipId})`} opacity={TAPE_OPACITY}>
        {hasImage ? (
          <TapeImage onAssetLoad={onAssetLoad} uri={uri} crop={crop} imageWidth={imageWidth} imageHeight={imageHeight} width={width} height={height} />
        ) : (
          <Rect width={width} height={height} fill={`url(#${patternId})`} />
        )}
      </G>
    </Svg>
  )
}

/** 이미지 테이프: 고른 영역(crop)을 틀에 꽉 채운다. crop 이 없던 예전 테이프는 가운데 기준으로 채운다. */
function TapeImage({ onAssetLoad, uri, crop, imageWidth, imageHeight, width, height }) {
  if (!uri) return null
  const href = { uri }
  if (!crop || !imageWidth || !imageHeight) {
    return <SvgImage onLoad={onAssetLoad} href={href} width={width} height={height} preserveAspectRatio="xMidYMid slice" />
  }
  const layout = coverLayout({ imageWidth, imageHeight, crop }, width, height)
  return (
    <SvgImage onLoad={onAssetLoad} href={href} x={layout.left} y={layout.top} width={layout.width} height={layout.height} preserveAspectRatio="none" />
  )
}
