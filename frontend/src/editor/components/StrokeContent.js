import { useMemo } from 'react'
import Svg, { Circle, Defs, Path, Pattern, Rect } from 'react-native-svg'
import { PENCIL_GRAIN, PENCIL_GRAIN_SIZE, penContour, strokeOutline, strokePath } from '../utils/strokes'
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
  const path = useMemo(() => strokePath(points), [points])
  const pencil = kind === 'pencil'
  const highlighter = kind === 'highlighter'
  const dotWidth = width * (points[0]?.pressure ?? 1)
  return <Svg width={object.w * zoom} height={object.h * zoom} viewBox={`0 0 ${object.baseWidth} ${object.baseHeight}`} preserveAspectRatio="none" style={{ transform }}>
    {modern && pencil && <Defs>
      <Pattern id={grainId} patternUnits="userSpaceOnUse" width={PENCIL_GRAIN_SIZE} height={PENCIL_GRAIN_SIZE}>
        <Rect width={PENCIL_GRAIN_SIZE} height={PENCIL_GRAIN_SIZE} fill={color} opacity={0.22} />
        {PENCIL_GRAIN.map((g, i) => <Circle key={i} cx={g.x} cy={g.y} r={g.radius} fill={color} opacity={g.opacity} />)}
      </Pattern>
    </Defs>}
    {highlighter ? <Path d={path} fill="none" stroke={color} strokeWidth={width} strokeOpacity={HIGHLIGHTER_OPACITY}
      strokeLinecap={object.lineCap === 'square' ? 'square' : 'round'} strokeLinejoin="round" />
      : outline ? <Path d={outline} fill={color} /> : <Path d={path} fill="none" stroke={modern && pencil ? `url(#${grainId})` : color}
      strokeWidth={points.length === 1 ? dotWidth : width * (pencil ? 0.85 : 1)}
      strokeOpacity={!modern && pencil ? 0.65 : 1} strokeDasharray={!modern && pencil ? [1.5, 0.5] : undefined}
      strokeLinecap="round" strokeLinejoin="round" />}
  </Svg>
}
