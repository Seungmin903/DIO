import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import FadeScroll from './controls/FadeScroll'
import { Text, View } from 'react-native'
import ToolGuideAnimation from './ToolGuideAnimation'

// 형태 선택은 리본 아래에, 선택 후 작업 메뉴는 캔버스의 선택 영역 아래에 표시한다.
export default function LassoSettings({ shape, onShapeChange, onClose, sheet = false, dragHandlers }) {
  return <View style={sheet ? [toolPanelStyles.card, toolPanelStyles.sheetCard] : toolPanelStyles.card} accessibilityLabel="올가미 형태 설정">
    <ToolPanelHeader icon="lasso" title="올가미" closeLabel="올가미 설정 닫기" onClose={onClose} dragHandlers={dragHandlers} />
    <FadeScroll style={toolPanelStyles.scrollFrame} contentContainerStyle={toolPanelStyles.content} bounces={false}>
      <Text style={toolPanelStyles.label}>형태</Text>
      <Segmented items={[{ id: 'rectangle', label: '네모형' }, { id: 'freeform', label: '자유형' }]} selected={(id) => shape === id} onPress={onShapeChange} />
      <ToolGuideAnimation key={shape} mode={shape} />
    </FadeScroll>
  </View>
}
