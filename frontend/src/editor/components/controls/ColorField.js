import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { colors } from '../../../shared/theme'
import ColorPicker from './ColorPicker'
import Icon from './Icon'

/**
 * 색 한 줄: 지금 색과 HEX 를 보여 주고, 누르면 아래에 색 피커를 펼친다. (프리셋 없이 사용자가 직접 고른다)
 * 윤곽선·그림자·사진 틀 색에 같이 쓴다.
 */
export default function ColorField({ label, value, onStart, onChange, title = '색' }) {
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable
        onPress={() => setOpen(!open)}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${open ? '접기' : '고르기'}`}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <Text style={styles.title}>{title}</Text>
        <View style={styles.value}>
          <View style={[styles.chip, { backgroundColor: value }]} />
          <Text style={styles.hex}>{value.toUpperCase()}</Text>
          <View style={open && styles.flip}>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </View>
        </View>
      </Pressable>
      {open && <ColorPicker value={value} label={label} onStart={onStart} onChange={onChange} />}
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
  pressed: { backgroundColor: colors.primarySoft },
  title: { fontSize: 12, fontWeight: '700', color: colors.textMuted },
  value: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { width: 26, height: 26, borderRadius: 13, borderWidth: 1, borderColor: colors.border },
  hex: { fontSize: 12.5, fontWeight: '700', color: colors.text },
  flip: { transform: [{ rotate: '180deg' }] },
})
