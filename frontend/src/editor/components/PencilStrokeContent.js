import { Defs, Path, Pattern, Rect } from 'react-native-svg'
import { GRAPHITE_DUST, GRAPHITE_GRAINS, GRAPHITE_FIBERS, GRAPHITE_TILE_SIZE, pencilTextureSettings } from '../utils/pencilTexture'

// Shared by the live preview, saved canvas, thumbnails and export surfaces.
export default function PencilStrokeContent({ grainId, path, width, dotWidth, singlePoint, color }) {
  const { tileSize, baseOpacity } = pencilTextureSettings(width)
  const strokeWidth = singlePoint ? dotWidth : width * 0.85
  return <>
    <Defs>
      <Pattern id={grainId} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse"
        width={tileSize} height={tileSize} viewBox={`0 0 ${GRAPHITE_TILE_SIZE} ${GRAPHITE_TILE_SIZE}`}>
        <Rect width={GRAPHITE_TILE_SIZE} height={GRAPHITE_TILE_SIZE} fill={color} opacity={baseOpacity} />
        <Path d={GRAPHITE_DUST} fill={color} opacity={0.58} />
        <Path d={GRAPHITE_GRAINS} fill={color} opacity={0.7} />
        <Path d={GRAPHITE_FIBERS} fill="none" stroke={color} strokeWidth={0.18} strokeOpacity={0.32} strokeLinecap="round" />
      </Pattern>
    </Defs>
    {/* Layered translucent deposits soften the edge and build tone on repeated strokes. */}
    {[{ scale: 1, opacity: 0.25 }, { scale: 0.86, opacity: 0.48 }, { scale: 0.64, opacity: 0.38 }].map(layer =>
      <Path key={layer.scale} d={path} fill="none" stroke={`url(#${grainId})`}
        strokeWidth={strokeWidth * layer.scale} strokeOpacity={layer.opacity} strokeLinecap="round" strokeLinejoin="round" />)}
  </>
}
