import { Defs, Path, Pattern, Rect } from 'react-native-svg'
import { GRAPHITE_GRAINS, GRAPHITE_FIBERS, GRAPHITE_VIEWBOX, pencilTextureSettings } from '../utils/pencilTexture'

// 필기 미리보기·저장된 캔버스·썸네일·내보내기가 함께 쓰는 연필 획.
export default function PencilStrokeContent({ grainId, path, width, dotWidth, singlePoint, color }) {
  const { tileSize, baseOpacity } = pencilTextureSettings(width)
  const strokeWidth = singlePoint ? dotWidth : width * 0.85
  return <>
    <Defs>
      <Pattern id={grainId} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse"
        width={tileSize} height={tileSize} viewBox={`0 0 ${GRAPHITE_VIEWBOX} ${GRAPHITE_VIEWBOX}`}>
        <Rect width={GRAPHITE_VIEWBOX} height={GRAPHITE_VIEWBOX} fill={color} opacity={baseOpacity} />
        <Path d={GRAPHITE_GRAINS} fill={color} opacity={0.7} />
        <Path d={GRAPHITE_FIBERS} fill="none" stroke={color} strokeWidth={1.8} strokeOpacity={0.32} strokeLinecap="round" />
      </Pattern>
    </Defs>
    {/* 반투명 획을 겹쳐 가장자리를 부드럽게 하고, 덧칠할수록 흑연이 짙어지게 한다. */}
    {[{ scale: 1, opacity: 0.25 }, { scale: 0.86, opacity: 0.48 }, { scale: 0.64, opacity: 0.38 }].map(layer =>
      <Path key={layer.scale} d={path} fill="none" stroke={`url(#${grainId})`}
        strokeWidth={strokeWidth * layer.scale} strokeOpacity={layer.opacity} strokeLinecap="round" strokeLinejoin="round" />)}
  </>
}
