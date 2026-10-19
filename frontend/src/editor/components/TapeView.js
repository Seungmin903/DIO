import { useMediaUri } from '../hooks/useMediaUri'
import { coverLayout } from '../utils/objects'
import { useSvgId } from '../utils/svgId'
import Svg, { Circle, ClipPath, Defs, G, Image as SvgImage, Line, Path, Pattern, Polygon, Rect } from 'react-native-svg'

const TAPE_OPACITY = 0.88
// 기본 테이프 크기(180×34)의 가로:세로. 이미지 테이프 자르기 틀도 이 비율을 쓴다.
export const TAPE_RATIO = 180 / 34

/** 패턴 타일 정의. 화면 배율과 상관없이 같은 밀도로 보이도록 scale 을 곱한다. */
function PatternTile({ id, pattern, scale }) {
  const s = (v) => v * scale
  switch (pattern) {
    case 'mint-stripe':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(16)} height={s(16)}>
          <Rect width={s(16)} height={s(16)} fill="#E3F4EC" />
          <Path
            d={`M${s(-4)} ${s(4)} L${s(4)} ${s(-4)} M0 ${s(16)} L${s(16)} 0 M${s(12)} ${s(20)} L${s(20)} ${s(12)}`}
            stroke="#A8DCC8"
            strokeWidth={s(5.5)}
          />
        </Pattern>
      )
    case 'pink-dot':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(12)} height={s(12)}>
          <Rect width={s(12)} height={s(12)} fill="#FAD3DC" />
          <Circle cx={s(6)} cy={s(6)} r={s(2.6)} fill="#F59AB2" />
        </Pattern>
      )
    case 'butter-check':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(14)} height={s(14)}>
          <Rect width={s(14)} height={s(14)} fill="#FFF1C2" />
          <Rect width={s(7)} height={s(14)} fill="rgba(245,190,70,0.45)" />
          <Rect width={s(14)} height={s(7)} fill="rgba(245,190,70,0.45)" />
        </Pattern>
      )
    case 'kraft':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(7)} height={s(7)}>
          <Rect width={s(7)} height={s(7)} fill="#D9B98F" />
          <Rect width={s(2)} height={s(7)} fill="rgba(150,110,60,0.14)" />
        </Pattern>
      )
    case 'blue-grid':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(8)} height={s(8)}>
          <Rect width={s(8)} height={s(8)} fill="#F1F4FB" />
          <Line x1="0" y1="0" x2={s(8)} y2="0" stroke="#9FB6D9" strokeWidth={s(1)} />
          <Line x1="0" y1="0" x2="0" y2={s(8)} stroke="#9FB6D9" strokeWidth={s(1)} />
        </Pattern>
      )
    case 'sky-wave':
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(24)} height={s(12)}>
          <Rect width={s(24)} height={s(12)} fill="#DCEBFA" />
          <Path
            d={`M0 ${s(6)} Q${s(6)} ${s(1)} ${s(12)} ${s(6)} T${s(24)} ${s(6)}`}
            stroke="#6E92C6"
            strokeWidth={s(1.6)}
            fill="none"
          />
        </Pattern>
      )
    default:
      return (
        <Pattern id={id} patternUnits="userSpaceOnUse" width={s(10)} height={s(10)}>
          <Rect width={s(10)} height={s(10)} fill="#D7CCF7" />
        </Pattern>
      )
  }
}

/** 절취선(톱니) 모양의 양 끝 */
function tornPolygon(w, h) {
  const tooth = Math.max(3, h / 7)
  const steps = 7
  const right = []
  const left = []
  for (let i = 0; i <= steps; i += 1) {
    const y = (h / steps) * i
    right.push(`${i % 2 ? w - tooth : w},${y}`)
    left.push(`${i % 2 ? tooth : 0},${h - y}`)
  }
  return [...right, ...left].join(' ')
}

/**
 * 마스킹테이프. 기본 패턴은 SVG 무늬로 채우고, 사용자가 올린 이미지는 테이프 네모 틀에 꽉 채워(cover) 넣는다.
 * 어느 쪽이든 끝 모양(절취선·직선)으로 자르고 테이프처럼 살짝 비치게 그린다.
 */
export default function TapeView({ pattern, src, mediaFileId, crop, imageWidth, imageHeight, edge = 'torn', width, height, scale = 1, onAssetLoad }) {
  const uri = useMediaUri({ src, mediaFileId })
  const hasImage = Boolean(mediaFileId || src)
  const svgId = useSvgId('tape')
  const patternId = `${svgId}-pattern`
  const clipId = `${svgId}-clip`
  return (
    <Svg width={width} height={height}>
      <Defs>
        {!hasImage && <PatternTile id={patternId} pattern={pattern} scale={scale} />}
        <ClipPath id={clipId}>
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
