import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import FadeScroll from './controls/FadeScroll'
import { Text, View } from 'react-native'
import { ERASER_MAX_SIZE, ERASER_MIN_SIZE, ERASER_MODES, ERASER_TARGETS, normalizeEraserSize } from '../utils/eraser.js'
import Slider from './controls/Slider'
import ToolGuideAnimation from './ToolGuideAnimation'

export default function EraserSettings({ size, onChange, mode = 'stroke', onModeChange, target = 'all', onTargetChange, onClose, sheet = false, dragHandlers }) {
  const value = normalizeEraserSize(size)
  const update = (next) => onChange(normalizeEraserSize(Math.round(next)))
  return <View style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card}>
    <ToolPanelHeader icon="eraser" title="지우개" closeLabel="지우개 설정 닫기" onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} contentContainerStyle={toolPanelStyles.content} bounces={false}>
      <Text style={toolPanelStyles.label}>지우는 방식</Text>
      {onModeChange && <Segmented items={ERASER_MODES} selected={(id) => mode === id} onPress={onModeChange} />}
      <Text style={toolPanelStyles.label}>지울 대상</Text>
      <Segmented items={ERASER_TARGETS} selected={(id) => target === id} onPress={onTargetChange} />
      <ToolGuideAnimation key={mode} mode={mode} />
      <Text style={toolPanelStyles.label}>크기</Text>
      <Slider label="지우개 크기" minusLabel="지우개 작게" plusLabel="지우개 크게" value={value} min={ERASER_MIN_SIZE} max={ERASER_MAX_SIZE} step={1} onChange={update} />
    </FadeScroll>
  </View>
}
