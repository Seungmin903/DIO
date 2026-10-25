import Svg, { ClipPath, Defs, Filter, FeGaussianBlur, G, Mask, Path, Rect } from 'react-native-svg'
import { shadowOffset } from '../../utils/effects'
import { useSvgId } from '../../utils/svgId'

// SVG 외곽을 쓰는 사진도 실제 모양에 그림자를 건다. boxShadow의 사각 영역을 사용하지 않는다.
export default function PhotoPathShadow({ d, width, height, shadow, zoom, flipX = false, flipY = false }) {
  const id = useSvgId('photo-shadow')
  if (!shadow.on) return null
  const offset = shadowOffset(shadow)
  const dx = offset.x * zoom, dy = offset.y * zoom, spread = shadow.spread * zoom
  const blur = shadow.blur * zoom
  const pad = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) + spread + blur * 2 + 2)
  const clip = `${id}-clip`, mask = `${id}-mask`, filter = `${id}-blur`
  const reflected = `translate(${flipX ? width : 0} ${flipY ? height : 0}) scale(${flipX ? -1 : 1} ${flipY ? -1 : 1})`
  const xScale = Math.max(0.001, (width - spread * 2) / width)
  const yScale = Math.max(0.001, (height - spread * 2) / height)
  return <Svg pointerEvents="none" width={width + pad * 2} height={height + pad * 2}
    viewBox={`${-pad} ${-pad} ${width + pad * 2} ${height + pad * 2}`}
    style={{ position: 'absolute', left: -pad, top: -pad }}>
    <Defs>
      <ClipPath id={clip}><Path d={d} transform={reflected} /></ClipPath>
      <Filter id={filter} filterUnits="userSpaceOnUse" x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2}>
        <FeGaussianBlur stdDeviation={blur / 2} />
      </Filter>
      {shadow.inset && <Mask id={mask} maskType="luminance" maskUnits="userSpaceOnUse" x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2}>
        <Rect x={-pad} y={-pad} width={width + pad * 2} height={height + pad * 2} fill="white" />
        <G filter={`url(#${filter})`} transform={`translate(${dx + spread} ${dy + spread}) scale(${xScale} ${yScale})`}><Path d={d} fill="black" transform={reflected} /></G>
      </Mask>}
    </Defs>
    {shadow.inset
      ? <G clipPath={`url(#${clip})`}><Rect x={0} y={0} width={width} height={height} fill={shadow.color} opacity={shadow.opacity} mask={`url(#${mask})`} /></G>
      : <G opacity={shadow.opacity} filter={`url(#${filter})`} transform={`translate(${dx} ${dy})`}><Path d={d} transform={reflected}
        fill={shadow.color} stroke={shadow.color} strokeWidth={spread * 2} strokeLinejoin="round" /></G>}
  </Svg>
}
