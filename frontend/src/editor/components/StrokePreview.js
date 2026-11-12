import { memo, useMemo } from 'react'
import Svg, { G, Path } from 'react-native-svg'
import { previewGeometry } from '../utils/strokePreview.js'
import { useSvgId } from '../utils/svgId'
import { HIGHLIGHTER_OPACITY } from '../utils/penSettings'
import PencilStrokeContent from './PencilStrokeContent'
import InkStrokeContent from './InkStrokeContent'
import FeltStrokeContent from './FeltStrokeContent'
import NibStrokeContent from './NibStrokeContent'
import { isNibKind } from '../utils/nibStroke'

const Piece = memo(function Piece({ part, settings }) {
  const geometry = useMemo(() => previewGeometry(part, settings), [part, settings])
  if (geometry.outline) return <Path d={geometry.outline} fillRule="nonzero" fill={settings.color} />
  const width = settings.width * (part.points.length === 1 ? part.points[0].pressure ?? 1 : 1)
  return <Path d={geometry.path} fill="none" stroke={settings.color}
    strokeWidth={width} strokeLinecap={settings.kind === 'highlighter' && settings.lineCap === 'square' ? 'square' : 'round'} strokeLinejoin="round" />
})

// 단일 좌표계와 한 겹의 투명도를 써서 구간 겹침에 형광펜·연필이 진해지지 않게 한다.
export default function StrokePreview({ preview, zoom, pageWidth, pageHeight }) {
  const grainId = useSvgId('live-pencil')
  const { parts, settings } = preview
  // 펜 불투명도는 획 전체에 한 번 건다(조각이 겹쳐도 더 진해지지 않게). 형광펜은 자기 농도를 따로 쓴다
  return <Svg width={pageWidth * zoom} height={pageHeight * zoom} viewBox={`0 0 ${pageWidth} ${pageHeight}`} style={settings.kind !== 'highlighter' && (settings.opacity ?? 1) < 1 ? { opacity: settings.opacity } : undefined}>
    {isNibKind(settings.kind) ? <NibStrokeContent parts={parts} width={settings.width} kind={settings.kind} color={settings.color} />
      : settings.kind === 'felt' ? <FeltStrokeContent parts={parts} width={settings.width} color={settings.color} renderVersion={settings.renderVersion} materialSeed={settings.materialSeed} />
      : settings.kind === 'fountain' || settings.kind === 'brush'
      ? <InkStrokeContent parts={parts} width={settings.width} kind={settings.kind} color={settings.color} renderVersion={settings.renderVersion} />
      : settings.kind === 'pencil' ? <PencilStrokeContent grainId={grainId} parts={parts} width={settings.width}
        dotWidth={settings.width * (parts[0]?.points[0]?.pressure ?? 1)} color={settings.color} seed={settings.materialSeed} zoom={zoom} />
      : <G opacity={settings.kind === 'highlighter' ? HIGHLIGHTER_OPACITY : 1}>
      {parts.map(part => <Piece key={part.key} part={part} settings={settings} />)}
    </G>}
  </Svg>
}
