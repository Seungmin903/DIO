import { Pressable, StyleSheet, View } from 'react-native'
import { HIGHLIGHTER_COLORS } from '../utils/penSettings'
import { PLANNER_POPUP, PlannerPopup } from './PlannerPopup'

// 플래너 할 일 줄의 색 칸을 눌렀을 때 뜨는 색 고르기 창(데일리 · 스터디 공용).
// 시간 · 날짜 창과 같은 속지 양식이고, 고를 수 있는 색은 속지에 칠하는 형광펜 색과 같다. 고르면 바로 칠해지고 닫힌다.
const SWATCH = 30, GAP = 8, SIDE = 16, HEADER = 40, BODY_Y = 2 + 14 // 창 몸통(PlannerPopup)의 좌우 16 · 위아래 여백
const WIDTH = SIDE * 2 + HIGHLIGHTER_COLORS.length * SWATCH + (HIGHLIGHTER_COLORS.length - 1) * GAP
/** 위치를 정할 때 쓰는 창 크기 */
export const PLANNER_COLOR_POPUP = { width: WIDTH, height: HEADER + SWATCH + BODY_Y }

/** value: 지금 줄 색(없으면 null). onPick(색) */
export default function PlannerColorPopup({ value, onPick, onClose, style }) {
  const current = typeof value === 'string' ? value.toUpperCase() : null
  return (
    <PlannerPopup label="할 일 색 고르기" closeLabel="색 고르기 닫기" onClose={onClose} style={[{ width: WIDTH }, style]}>
      <View style={styles.row}>
        {HIGHLIGHTER_COLORS.map(c => {
          const on = current === c.toUpperCase()
          return (
            <Pressable key={c} accessibilityRole="button" accessibilityLabel={`색 ${c}`} accessibilityState={{ selected: on }} onPress={() => onPick(c)}
              style={[styles.ring, on && styles.ringOn]}>
              <View style={[styles.swatch, { backgroundColor: c }]} />
            </Pressable>
          )
        })}
      </View>
    </PlannerPopup>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: GAP },
  ring: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2, padding: 3, borderWidth: 1.5, borderColor: 'transparent' },
  ringOn: { borderColor: PLANNER_POPUP.text },
  swatch: { flex: 1, borderRadius: SWATCH / 2 },
})
