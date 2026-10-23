import { StyleSheet } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import { colors } from '../../../shared/theme'

/** 자유형·사각형 올가미로 확정한 선택의 닫힌 점선 윤곽. */
export default function LassoOutline({ paths, zoom, pageWidth, pageHeight }) {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} width={pageWidth * zoom} height={pageHeight * zoom} viewBox={`0 0 ${pageWidth} ${pageHeight}`}>
      {paths.map((path, index) => <Path key={index}
        d={'M' + path.points.map(p => `${p.x} ${p.y}`).join('L') + 'Z'}
        fill="none" stroke={colors.primary} strokeWidth={1.5 / zoom} strokeDasharray={[6 / zoom, 4 / zoom]} />)}
    </Svg>
  )
}
