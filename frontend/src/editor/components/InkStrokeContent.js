import { useMemo } from 'react'
import { Path } from 'react-native-svg'
import { strokeInkLayers, inkLevels } from '../utils/penInk'
import { completedStrokeGeometry } from '../utils/completedStrokeGeometry'

// 저장 화면·썸네일·내보내기와 실시간 필기가 같은 재질 계산을 공유한다.
export default function InkStrokeContent({ object, parts, points, width, kind, color, startDistance = 0, renderVersion = 2, areaPreview = false }) {
  const source = useMemo(() => parts ?? [{ points, startDistance, continuing: false }], [parts, points, startDistance])
  const layers = useMemo(() => object && !parts && !areaPreview
    ? completedStrokeGeometry.ink(object)
    : strokeInkLayers(source, width, kind, renderVersion, areaPreview), [object, parts, source, width, kind, renderVersion, areaPreview])
  const levels = inkLevels(kind, renderVersion, areaPreview)
  return layers.map((path, i) => path ? <Path key={i} d={path} fill={color} fillRule="nonzero"
    fillOpacity={i === 0 ? levels[0] : (levels[i] - levels[i - 1]) / (1 - levels[i - 1])} /> : null)
}
