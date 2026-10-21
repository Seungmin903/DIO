import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { ERASER_MAX_SIZE, ERASER_MIN_SIZE, ERASER_MODES, normalizeEraserSize } from '../utils/eraser.js'
import Slider from './controls/Slider'

/** 지우개 설정. 스티커·마테·사진 옵션과 같은 모양(구역 제목 + 막대 −·+·숫자). mode: 획 지우기 | 영역 지우기 */
export default function EraserSettings({ size, onChange, mode = 'stroke', onModeChange, onClose }) {
  const value = normalizeEraserSize(size)
  const update = (next) => onChange(normalizeEraserSize(Math.round(next)))
  return <View style={toolPanelStyles.card}>
    <ToolPanelHeader icon="eraser" title="지우개" closeLabel="지우개 설정 닫기" onClose={onClose} />
    <View style={toolPanelStyles.content}>
      <View style={styles.preview} pointerEvents="none">
        <View style={[styles.circle, { width: value, height: value, borderRadius: value / 2 }]} />
      </View>
      {onModeChange && <Segmented items={ERASER_MODES} selected={(id) => mode === id} onPress={onModeChange} />}
      <Text style={toolPanelStyles.label}>크기</Text>
      <Slider label="지우개 크기" minusLabel="지우개 작게" plusLabel="지우개 크게" value={value} min={ERASER_MIN_SIZE} max={ERASER_MAX_SIZE} step={1} onChange={update} />
    </View>
  </View>
}

const styles = StyleSheet.create({
  preview: { height: 84, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF7', borderRadius: 12 },
  circle: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'rgba(255,255,255,0.4)' },
})
