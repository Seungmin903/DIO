import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import PenSafeTextInput from './PenSafeTextInput'
import { colors } from '../../../shared/theme'
import { usePan } from '../../hooks/usePan'
import { clamp } from '../../utils/common'
import Icon from './Icon'

const THUMB = 26

/**
 * RN 기본 컴포넌트에는 슬라이더가 없어서 직접 만든다.
 * onStart 는 끌기를 시작할 때 한 번 (되돌리기 지점을 만들 때 쓴다).
 * 오른쪽 숫자 칸에 값을 직접 넣을 수도 있다. 칸에는 value × scale 을 보여 준다 (예: 불투명도 0.8 → 80, unit '%').
 */
export default function Slider({
  value,
  min,
  max,
  step,
  onChange,
  onStart,
  onEnd,
  minusLabel = '줄이기',
  plusLabel = '늘리기',
  scale = 1,
  unit = '',
  label = '값',
  wrap = false, // 각도처럼 범위를 넘으면 한 바퀴 돌려 맞춘다 (375 → 15)
  name = null, // 막대 왼쪽에 붙는 짧은 제목(굵기 · 불투명도). 주면 제목 줄 없이 한 줄(44)로 촘촘하게 그린다(코덱스 2026-11-02, 옵션 창 스크롤 없애기)
}) {
  const [trackWidth, setTrackWidth] = useState(1)
  const startRef = useRef(0)
  // 손잡이가 막대 양 끝(−·+ 버튼) 밖으로 나가지 않도록 손잡이 반지름만큼 안쪽에서 움직인다.
  const travel = Math.max(1, trackWidth - THUMB)
  const toValue = (x) => min + clamp((x - THUMB / 2) / travel, 0, 1) * (max - min)
  const ratio = clamp((value - min) / (max - min), 0, 1)

  const panHandlers = usePan({
    onStart: (event) => {
      onStart?.()
      startRef.current = event.locationX
      onChange(toValue(event.locationX))
    },
    onMove: (dx) => onChange(toValue(startRef.current + dx)),
    onEnd: event => onEnd?.(event),
  })

  const nudge = (delta) => {
    onStart?.()
    onChange(clamp(Math.round((value + delta) / step) * step, min, max))
    onEnd?.({cancelled:false})
  }

  // 숫자 칸: 입력 중에는 친 글자를 그대로 두고, 확정(엔터·포커스 아웃) 때 범위 안으로 맞춰 반영한다.
  // 칸에 보이는 숫자: 한 칸(step × scale)이 1보다 작으면 소수 한 자리까지 (예: 펜 굵기 2.5)
  const decimals = step * scale < 1 ? 1 : 0
  const format = (v) => String(Number((v * scale).toFixed(decimals)))
  const shown = format(value)
  const [draft, setDraft] = useState(shown)
  const [editing, setEditing] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(shown)
  }, [shown, editing])
  const commit = () => {
    setEditing(false)
    const n = Number(draft.replace(/[^0-9.-]/g, ''))
    if (!draft.trim() || !Number.isFinite(n)) {
      setDraft(shown)
      return
    }
    const raw = n / scale
    const span = max - min + step
    const next = wrap ? min + ((((raw - min) % span) + span) % span) : clamp(raw, min, max)
    if (next !== value) {
      onStart?.()
      onChange(next)
      onEnd?.({cancelled:false})
    }
    setDraft(format(next))
  }

  return (
    <View style={[styles.row, name && styles.rowInline]}>
      {name ? <Text style={styles.name} numberOfLines={Platform.OS === 'web' ? undefined : 1} adjustsFontSizeToFit minimumFontScale={0.75}>{name}</Text> : null}
      <Pressable onPress={() => nudge(-step)} hitSlop={name ? 6 : 4} style={[styles.stepButton, name && styles.stepCompact]} accessibilityLabel={minusLabel}>
        <Icon name="minus" size={16} />
      </Pressable>
      <View style={styles.track} onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)} {...panHandlers}>
        <View style={styles.trackLine} pointerEvents="none" />
        <View style={[styles.trackFill, { width: THUMB / 2 + ratio * travel }]} pointerEvents="none" />
        <View style={[styles.thumb, { left: ratio * travel }]} pointerEvents="none" />
      </View>
      <Pressable onPress={() => nudge(step)} hitSlop={name ? 6 : 4} style={[styles.stepButton, name && styles.stepCompact]} accessibilityLabel={plusLabel}>
        <Icon name="plus" size={16} />
      </Pressable>
      <View style={[styles.inputBox, name && styles.inputCompact]}>
        <PenSafeTextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setEditing(true)}
          onBlur={commit}
          onSubmitEditing={commit}
          keyboardType="numeric"
          selectTextOnFocus
          maxLength={5}
          style={styles.input}
          accessibilityLabel={`${label} 숫자 입력`}
        />
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowInline: { gap: 4, minHeight: 44 },
  name: { width: 56, fontSize: 12, fontWeight: '700', color: colors.textMuted },
  stepCompact: { width: 36, height: 36 },
  inputCompact: { width: 52, height: 36, marginLeft: 4 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 52,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    width: 0,
    height: '100%', // 칸 전체를 눌러도 입력이 열린다
    padding: 0,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    includeFontPadding: false,
  },
  unit: { marginLeft: 1, fontSize: 11, fontWeight: '700', color: colors.textMuted },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  track: { flex: 1, height: 44, justifyContent: 'center' },
  trackLine: { position: 'absolute', left: 0, right: 0, height: 4, borderRadius: 2, backgroundColor: colors.primarySoft },
  trackFill: { position: 'absolute', left: 0, height: 4, borderRadius: 2, backgroundColor: colors.primary },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
})
