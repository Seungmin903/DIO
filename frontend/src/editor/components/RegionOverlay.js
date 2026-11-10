import { StyleSheet, View } from 'react-native'
import { colors } from '../../shared/theme'
import { REGION_CORNERS } from '../utils/regionGeometry.js'

export default function RegionOverlay({ selection, zoom }) {
  const x = selection.x * zoom, y = selection.y * zoom
  const width = selection.width * zoom, height = selection.height * zoom
  const size = Math.min(12, width, height)
  return <View testID="export-region-overlay" accessibilityLabel="내보내기 영역 선택판" pointerEvents="none" style={StyleSheet.absoluteFill}>
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: 0, right: 0, height: y }]} />
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: y + height, right: 0, bottom: 0 }]} />
    <View pointerEvents="none" style={[styles.mask, { left: 0, top: y, width: x, height }]} />
    <View pointerEvents="none" style={[styles.mask, { left: x + width, top: y, right: 0, height }]} />
    <View testID="export-region-frame" pointerEvents="none" style={[styles.frame, { left: x, top: y, width, height }]} />
    {Object.entries(REGION_CORNERS).map(([corner, label]) => <View key={corner} testID={`region-handle-${corner}`}
      accessibilityLabel={`${label} 영역 크기 조절`} style={[styles.dot, {
        left: x + (corner.includes('e') ? width : 0) - size / 2,
        top: y + (corner.includes('s') ? height : 0) - size / 2,
        width: size, height: size,
      }]} />)}
  </View>
}

const styles = StyleSheet.create({
  mask: { position: 'absolute', backgroundColor: colors.overlay },
  frame: { position: 'absolute', borderWidth: 2, borderColor: colors.primary },
  dot: { position: 'absolute', borderRadius: 6, backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.primary },
})
