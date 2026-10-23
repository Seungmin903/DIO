import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'
import { Text, View } from 'react-native'

// 형태 선택은 리본 아래에, 선택 후 작업 메뉴는 캔버스의 선택 영역 아래에 표시한다.
// 스티커·마테·사진 옵션과 같은 세그먼트 버튼으로 고른다.
export default function LassoSettings({ shape, onShapeChange, onClose }) {
  return <View style={toolPanelStyles.card} accessibilityLabel="올가미 형태 설정">
    <ToolPanelHeader icon="lasso" title="올가미" closeLabel="올가미 설정 닫기" onClose={onClose} />
    <View style={toolPanelStyles.content}>
      <Text style={toolPanelStyles.label}>형태</Text>
      <Segmented items={[{ id: 'rectangle', label: '네모' }, { id: 'freeform', label: '자유형' }]} selected={(id) => shape === id} onPress={onShapeChange} />
    </View>
  </View>
}
