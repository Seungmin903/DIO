import { useMemo } from 'react'
import { Path } from 'react-native-svg'
import { nibContour, nibPreviewPaths } from '../utils/nibStroke'

// 캘리펜 · 붓펜: 단색 채움 하나. 완성 획(object)과 그리는 중(parts)이 같은 외곽선 계산을 쓴다.
export default function NibStrokeContent({ object, parts, width, kind, color }) {
  const d = useMemo(() => object ? nibContour(object) : nibPreviewPaths(parts, width, kind).join(''),
    [object, parts, width, kind])
  return <Path d={d} fill={color} fillRule="nonzero" />
}
