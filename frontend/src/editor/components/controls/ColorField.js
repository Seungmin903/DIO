import { useRef } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import { useColorWindow } from '../../../diary/components/PresetColorEditor'
import Icon from './Icon'

/**
 * 색 한 줄: 지금 색과 HEX 를 보여 주고, 누르면 그 옆에 색 창을 띄운다(옵션 창 안에 펼치지 않는다 — 앱 안 색 창 통일, 2026-11-02).
 * 프리셋 없이 사용자가 직접 고른다. 윤곽선·그림자·사진 틀 색에 같이 쓴다.
 * onStart · onEnd: 창을 여는 동안의 변경을 되돌리기 한 번으로 묶는다.
 */
export default function ColorField({ label, value, onStart, onEnd, onChange, title = '색' }) {
  const ref = useRef(null)
  const colorWindow = useColorWindow()
  const open = () => {
    onStart?.()
    colorWindow.open(ref, { title, value, original: value, onChange,
      onDone: (color) => { onChange(color); onEnd?.() }, onClose: () => onEnd?.() })
  }
  return (
    <View>
      <Pressable
        ref={ref}
        collapsable={false}
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label} 고르기`}
        accessibilityState={{ expanded: colorWindow.isOpen }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.value}>
          <View style={[styles.chip, { backgroundColor: value }]} />
          <Text style={styles.hex}>{value.toUpperCase()}</Text>
          <Icon name="chevronRight" size={16} forText={12.5} color={colors.textMuted} />
        </View>
      </Pressable>
      {colorWindow.element}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 10,
  },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
  title: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  value: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
  hex: { fontSize: 12.5, fontWeight: '700', color: colors.text },
})
