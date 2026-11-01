import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import PenSafeTextInput from './PenSafeTextInput'
import { colors } from '../../../shared/theme'
import { clamp } from '../../utils/common'
import Icon from './Icon'

/**
 * 숫자와 좌우 −·+ 버튼만 있는 값 고르기(끌어서 바꾸는 막대 없음). 숫자 칸에 값을 직접 넣을 수도 있다.
 * 칸에는 value × scale 을 보여 준다 (예: 자간 0.1 → 10). 버튼은 step 만큼, 입력은 확정(엔터 · 포커스 아웃) 때 범위 안으로 맞춰 반영한다.
 */
export default function NumberStepper({ value, min, max, step, onChange, scale = 1, label = '값', minusLabel = '줄이기', plusLabel = '늘리기' }) {
  const decimals = step * scale < 1 ? 1 : 0
  const format = (v) => String(Number((v * scale).toFixed(decimals)))
  const shown = format(value)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)
  useEffect(() => { if (!editing) setDraft(shown) }, [shown, editing])

  const nudge = (delta) => onChange(clamp(Math.round((value + delta) / step) * step, min, max))
  const commit = () => {
    setEditing(false)
    const n = Number(draft.replace(/[^0-9.-]/g, ''))
    if (!draft.trim() || !Number.isFinite(n)) { setDraft(shown); return }
    const next = clamp(n / scale, min, max)
    if (next !== value) onChange(next)
    setDraft(format(next))
  }

  return (
    <View style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={minusLabel} onPress={() => nudge(-step)} style={styles.stepButton}>
        <Icon name="minus" size={16} />
      </Pressable>
      <View style={styles.inputBox}>
        <PenSafeTextInput value={draft} onChangeText={setDraft} onFocus={() => setEditing(true)} onBlur={commit} onSubmitEditing={commit}
          keyboardType="numeric" selectTextOnFocus maxLength={5} style={styles.input} accessibilityLabel={`${label} 숫자 입력`} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={plusLabel} onPress={() => nudge(step)} style={styles.stepButton}>
        <Icon name="plus" size={16} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepButton: { width: 36, height: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceMuted },
  inputBox: { flex: 1, minWidth: 0, height: 40, paddingHorizontal: 4, justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { padding: 0, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.text, includeFontPadding: false },
})
