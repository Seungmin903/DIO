import { useState } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import { colors } from '../../../shared/theme'
import Icon from './Icon'

/**
 * 제목 옆의 동그라미 물음표. 누르면 설명을 펼치고 다시 누르면 접는다.
 * const help = useHelp() → 제목 옆에 <HelpButton {...help} />, 설명 자리에 {help.open && <Text>…</Text>}
 * 글자 '?' 는 Android 글꼴 여백 때문에 가운데가 안 맞아서 SVG 아이콘으로 그린다.
 */
export function useHelp() {
  const [open, setOpen] = useState(false)
  return { open, onToggle: () => setOpen((v) => !v) }
}

export default function HelpButton({ open, onToggle, label = '도움말' }) {
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${open ? '닫기' : '보기'}`}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <Icon name="help" size={19} strokeWidth={2} color={open ? colors.primary : 'rgba(11,23,102,0.5)'} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  pressed: {}, // 눌림 효과 없음(사용자 지시)
})
