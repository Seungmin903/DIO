import { memo, useMemo } from 'react'
import Svg, { Circle, ClipPath, Defs, G, Path, Rect } from 'react-native-svg'
import { previewGeometry } from '../utils/strokePreview.js'
import { useSvgId } from '../utils/svgId'
import { HIGHLIGHTER_OPACITY } from '../utils/penSettings'
import { penContour } from '../utils/strokes'
import { GraphitePattern, PENCIL_LAYERS } from './PencilStrokeContent'
import InkStrokeContent from './InkStrokeContent'
import FeltStrokeContent from './FeltStrokeContent'

const Piece = memo(function Piece({ part, settings, clipScale }) {
  const geometry = useMemo(() => clipScale && part.points.length > 1
    ? { outline: penContour(part.points.map(point => ({ ...point, pressure: 1 })), settings.width * 0.85 * clipScale, 'ball') }
    : previewGeometry(part, settings), [part, settings, clipScale])
  if (clipScale && part.points.length === 1) return <Circle cx={part.points[0].x} cy={part.points[0].y}
    r={settings.width * (part.points[0].pressure ?? 1) * clipScale / 2} fill="#000000" />
  if (geometry.outline) return <Path d={geometry.outline} fillRule="nonzero" fill={settings.color} />
  const single = part.points.length === 1
  const width = settings.width * (single ? part.points[0].pressure ?? 1 : settings.kind === 'pencil' ? 0.85 : 1)
  return <Path d={geometry.path} fill="none" stroke={clipScale ? '#000000' : settings.color}
    strokeWidth={width * (clipScale ?? 1)} strokeLinecap={settings.kind === 'highlighter' && settings.lineCap === 'square' ? 'square' : 'round'} strokeLinejoin="round" />
})

// 단일 좌표계와 한 겹의 투명도를 써서 구간 겹침에 형광펜·연필이 진해지지 않게 한다.
export default function StrokePreview({ preview, zoom, pageWidth, pageHeight }) {
  const grainId = useSvgId('live-pencil')
  const { parts, settings } = preview
  return <Svg width={pageWidth * zoom} height={pageHeight * zoom} viewBox={`0 0 ${pageWidth} ${pageHeight}`}>
    {settings.kind === 'felt' ? <FeltStrokeContent parts={parts} width={settings.width} color={settings.color} renderVersion={settings.renderVersion} materialSeed={settings.materialSeed} />
      : settings.kind === 'fountain' || settings.kind === 'brush'
      ? <InkStrokeContent parts={parts} width={settings.width} kind={settings.kind} color={settings.color} renderVersion={settings.renderVersion} />
      : settings.kind === 'pencil' ? <>
      <Defs>
        <GraphitePattern id={grainId} color={settings.color} width={settings.width} />
        {PENCIL_LAYERS.map(layer => <ClipPath key={layer.scale} id={`${grainId}-${layer.scale}`}>
          {parts.map(part => <Piece key={part.key} part={part} settings={settings} clipScale={layer.scale} />)}
        </ClipPath>)}
      </Defs>
      {PENCIL_LAYERS.map(layer => <G key={layer.scale} clipPath={`url(#${grainId}-${layer.scale})`} opacity={layer.opacity}>
        <Rect width={pageWidth} height={pageHeight} fill={`url(#${grainId})`} />
      </G>)}
    </> : <G opacity={settings.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}>
      {parts.map(part => <Piece key={part.key} part={part} settings={settings} />)}
    </G>}
  </Svg>
}
