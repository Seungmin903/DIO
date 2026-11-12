import Svg, { Path } from 'react-native-svg'
import { BUILTIN_CANVAS } from '../../builtinStickers'

// 색이 맞닿은 칸 사이로 바탕이 비치지 않게 같은 색 선을 아주 얇게 두른다 (단위: 칸)
const SEAM = 0.04

/**
 * 기본 도트 스티커 그림. 칸 그대로의 벡터라 확대해도 깨지지 않고 가로세로 비율이 유지된다.
 * tint: 테두리 · 그림자용 단색 실루엣. canvas: 정사각 상자 안에서 그림끼리 같은 칸 크기로 그린다.
 */
export default function BuiltinStickerArt({ sticker, width, height, tint, canvas = false, style }) {
  const viewBox = canvas
    ? `${(sticker.w - BUILTIN_CANVAS) / 2} ${(sticker.h - BUILTIN_CANVAS) / 2} ${BUILTIN_CANVAS} ${BUILTIN_CANVAS}`
    : `0 0 ${sticker.w} ${sticker.h}`
  return (
    <Svg width={width} height={height} viewBox={viewBox} style={style}>
      {tint
        ? <Path d={sticker.paths.map(([, d]) => d).join('')} fill={tint} stroke={tint} strokeWidth={SEAM} />
        : sticker.paths.map(([color, d]) => <Path key={color} d={d} fill={color} stroke={color} strokeWidth={SEAM} />)}
    </Svg>
  )
}
