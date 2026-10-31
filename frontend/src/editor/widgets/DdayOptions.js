import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../shared/theme'
import PenSafeTextInput from '../components/controls/PenSafeTextInput'
import Icon from '../components/controls/Icon'
import { DDAY_TITLE_MAX, addDays, dateKey, monthShift, normalizeWidget, parseDateKey, todayParts } from './dday'

/** 디데이 위젯의 옵션 (옵션 패널 '꾸미기'): 이름 · 기준 날짜. 모양은 붙일 때 정해 바꾸지 않는다. */
export default function DdayOptions({ object, dispatch }) {
  const widget = normalizeWidget(object.widget)
  if (!widget) return null
  const date = parseDateKey(widget.date) ?? todayParts()
  const patchWidget = (patch, record = true, extra = {}) =>
    dispatch({ type: 'updateObject', id: object.id, record, patch: { widget: { ...widget, ...patch }, ...extra } })

  // 월·일을 넘기면 달력대로 이어진다. 1월 1일에서 하루 전은 지난해 12월 31일.
  const shiftDate = (unit, step) => {
    const next = unit === 'd' ? addDays(date, step) : monthShift(date, unit === 'm' ? step : step * 12)
    patchWidget({ date: dateKey(next) })
  }

  return (
    <>
      <Section title="이름">
        <PenSafeTextInput
          value={widget.title}
          maxLength={DDAY_TITLE_MAX}
          placeholder="예: 콘서트, 시험"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="디데이 이름"
          onFocus={() => dispatch({ type: 'checkpoint' })}
          onBlur={() => dispatch({ type: 'commitCheckpoint' })}
          onChangeText={(title) => patchWidget({ title }, false)}
          style={styles.input}
        />
      </Section>
      <Section title="기준 날짜">
        <View style={styles.dates}>
          <Stepper label="년" flex={1.35} value={date.y} onStep={(step) => shiftDate('y', step)} />
          <Stepper label="월" value={date.m} onStep={(step) => shiftDate('m', step)} />
          <Stepper label="일" value={date.d} onStep={(step) => shiftDate('d', step)} />
        </View>
      </Section>
    </>
  )
}

function Stepper({ label, value, flex = 1, onStep }) {
  return (
    <View style={[styles.stepper, { flex }]}>
      <Text style={styles.stepLabel}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable onPress={() => onStep(-1)} accessibilityRole="button" accessibilityLabel={`${label} 줄이기`} style={styles.stepButton}><Icon name="minus" size={13} /></Pressable>
        <Text numberOfLines={1} style={styles.stepValue}>{value}</Text>
        <Pressable onPress={() => onStep(1)} accessibilityRole="button" accessibilityLabel={`${label} 늘리기`} style={styles.stepButton}><Icon name="plus" size={13} /></Pressable>
      </View>
    </View>
  )
}

function Section({ title, children }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 14 },
  sectionTitle: { marginBottom: 8, fontSize: 12, fontWeight: '700', color: colors.textMuted },
    input: { height: 40, paddingHorizontal: 12, paddingVertical: 0, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, fontSize: 13, color: colors.text, includeFontPadding: false },
  dates: { flexDirection: 'row', gap: 6 },
  stepper: { minWidth: 0 },
  stepLabel: { marginBottom: 4, fontSize: 11, fontWeight: '700', color: colors.textMuted, textAlign: 'center' },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stepButton: { width: 24, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepValue: { flex: 1, minWidth: 0, textAlign: 'center', fontSize: 14, fontWeight: '800', color: colors.text },
})
