import { StyleSheet, Switch, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import { GRID_SPACINGS } from './canvas/GridOverlay'
import { Segmented, ToolPanelHeader, toolPanelStyles } from './ToolPanel'

const GUIDE_LINES = [
  { id: 'center', label: '가운데선' },
  { id: 'thirds', label: '3등분선' },
  { id: 'margin', label: '여백선' },
]

/** 격자·보조선 설정. 화면에 보여 주기만 하고 저장·내보내기에는 들어가지 않는다. 스티커·마테·사진 옵션과 같은 세그먼트 버튼을 쓴다. */
export default function GuideSettings({ guides, onChange, onClose }) {
  const gridOff = guides.grid === 'none'
  return (
    <View style={toolPanelStyles.card} accessibilityLabel="격자 가이드 설정">
      <ToolPanelHeader icon="grid" title="격자 가이드" closeLabel="격자 가이드 설정 닫기" onClose={onClose} />
      <View style={toolPanelStyles.content}>
        {/* 격자는 모눈 하나라 켜고 끄기만 한다 */}
        <View style={styles.switchRow}>
          <Text style={toolPanelStyles.label}>격자</Text>
          <Switch
            accessibilityLabel="격자 켜기"
            value={!gridOff}
            onValueChange={(on) => onChange({ ...guides, grid: on ? 'lines' : 'none' })}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.surface}
            activeThumbColor={colors.surface} // 웹(react-native-web)은 켜진 손잡이 색을 따로 받는다
          />
        </View>
        {/* 격자 바로 아래 좁게·보통·넓게가 간격이라 제목 없이 둔다 */}
        <Segmented
          items={GRID_SPACINGS}
          disabled={gridOff}
          selected={(id) => !gridOff && guides.spacing === id}
          onPress={(spacing) => onChange({ ...guides, spacing })}
        />
        {/* 다른 옵션 창처럼 작은 회색 구역 제목. 보조선은 여러 개를 함께 켤 수 있다. */}
        <Text style={toolPanelStyles.label}>보조선</Text>
        <Segmented separate items={GUIDE_LINES} selected={(id) => guides[id]} onPress={(id) => onChange({ ...guides, [id]: !guides[id] })} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
})
