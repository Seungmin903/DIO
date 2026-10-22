import { useMemo } from 'react'
import Svg, { Path } from 'react-native-svg'
import { penContour, strokeOutline, strokePath } from '../utils/strokes'
import PencilStrokeContent from './PencilStrokeContent'
import { useSvgId } from '../utils/svgId'
import { HIGHLIGHTER_OPACITY } from '../utils/penSettings'

export default function StrokeContent({ object, zoom, transform }) {
  const grainId = useSvgId('pencil-grain')
  const { points, penKind: kind, strokeWidth: width, color } = object
  const variable = kind === 'fountain' || kind === 'brush'
  const modern = object.renderVersion === 2
  const outline = useMemo(() => variable && points.length > 1
    ? modern ? penContour(points, width, kind) : strokeOutline(points, width)
    : '', [points, width, kind, variable, modern])
  const path = useMemo(() => outline ? '' : strokePath(points), [points, outline])
  const pencil = kind === 'pencil'
  const highlighter = kind === 'highlighter'
  const dotWidth = width * (points[0]?.pressure ?? 1)
  return <Svg width={object.w * zoom} height={object.h * zoom} viewBox={`0 0 ${object.baseWidth} ${object.baseHeight}`} preserveAspectRatio="none" style={{ transform }}>
    {modern && pencil ? <PencilStrokeContent grainId={grainId} path={path} width={width}
      dotWidth={dotWidth} singlePoint={points.length === 1} color={color} />
      : highlighter ? <Path d={path} fill="none" stroke={color} strokeWidth={width} strokeOpacity={HIGHLIGHTER_OPACITY}
      strokeLinecap={object.lineCap === 'square' ? 'square' : 'round'} strokeLinejoin="round" />
      : outline ? <Path d={outline} fill={color} /> : <Path d={path} fill="none" stroke={color}
      strokeWidth={points.length === 1 ? dotWidth : width * (pencil ? 0.85 : 1)}
      strokeOpacity={!modern && pencil ? 0.65 : 1} strokeDasharray={!modern && pencil ? [1.5, 0.5] : undefined}
      strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>
}
