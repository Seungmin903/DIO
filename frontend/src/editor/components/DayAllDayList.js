import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { PLANNER_POPUP, PlannerPopup, popupFont } from './PlannerPopup'

// 데일리 플래너 종일 칸에 다 못 올라온 일정(+n 알약)을 누르면 뜨는 종일 일정 전체 목록(지라 827).
// 시간 · 날짜 창과 같은 속지 양식(흰 바탕 · 얇은 회색 선 · 마루부리)이다. 줄을 누르면 그 줄의 시간 창이 열린다(종일 칸 막대를 누른 것과 같다).
const ROW_H = 44, MAX_SHOWN = 6, HEADER = 40, BOTTOM = 10
/** 위치를 정할 때 쓰는 창 크기: 줄이 많으면 MAX_SHOWN 줄까지 보이고 안에서 넘긴다 */
export const dayAllDayListSize = count => ({ width: 300, height: HEADER + Math.min(Math.max(count, 1), MAX_SHOWN) * ROW_H + BOTTOM })

/** items: [{ row, title, color }] (dayAllDayItems). onPick(row): 그 줄의 시간 창 열기 */
export default function DayAllDayList({ items, onPick, onClose, style }) {
  const shown = Math.min(Math.max(items.length, 1), MAX_SHOWN)
  return (
    <PlannerPopup label="종일 일정 목록" closeLabel="종일 일정 목록 닫기" onClose={onClose} style={[{ width: 300 }, style]}>
      <ScrollView style={{ maxHeight: shown * ROW_H }} contentContainerStyle={styles.list} nestedScrollEnabled showsVerticalScrollIndicator={items.length > MAX_SHOWN}>
        {items.map(item => (
          <Pressable key={item.row} accessibilityRole="button" accessibilityLabel={`${item.title || '할 일 없음'} 시간 정하기`} onPress={() => onPick(item.row)} style={styles.row}>
            <View style={[styles.swatch, item.color ? { backgroundColor: item.color } : styles.noColor]} />
            <Text numberOfLines={1} style={[styles.text, popupFont(), !item.title && styles.empty]}>{item.title || '할 일 없음'}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </PlannerPopup>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: 2 },
  row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: PLANNER_POPUP.band },
  swatch: { width: 14, height: 14, borderRadius: 3, opacity: 0.85 },
  noColor: { backgroundColor: PLANNER_POPUP.band, borderWidth: 1, borderColor: PLANNER_POPUP.line },
  text: { flex: 1, minWidth: 0, fontSize: 14, color: PLANNER_POPUP.text },
  empty: { color: PLANNER_POPUP.label },
})
