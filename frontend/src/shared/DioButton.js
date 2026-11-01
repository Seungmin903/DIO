import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from './AppIcon';
import { colors } from './theme';

// 버튼 체계(코덱스 설계, docs/공방 내 공간 재설계): 높이 48 · 모서리 10(1020 감성 점검 B안). 채움은 한 화면에 하나만 쓴다. 눌렀을 때 모양이 바뀌는 효과는 두지 않는다(사용자 지시).
// filled: primaryStrong 면(깊이선 없음, 눌려 보이는 입체를 두지 않는다). tonal: surfaceMuted 면 + primaryText 글자.
// ghost: 투명 + primaryText(outline 이면 primary 1px 테두리). danger: 투명 + dangerStrong 글자 · 테두리. icon: 48×48 · 모서리 10, 아이콘만(접근성 이름 필수).

/**
 * variant: 'filled' | 'tonal' | 'ghost' | 'danger' | 'icon'. label 은 접근성 이름이자 글자(icon 이면 글자 없이 이름만).
 * badge: 버튼 안 오른쪽의 작은 상태 글자(예: '준비 중'). block: 줄 전체 폭. selected: 토글 · 도구가 골라진 상태(흰 면 + primary 테두리).
 */
export default function DioButton({ variant = 'tonal', label, text = label, icon = null, badge = null, outline = false, block = false, disabled = false, selected = false, onPress, onLongPress, hint, style }) {
  const filled = variant === 'filled', iconOnly = variant === 'icon';
  // 고른 상태는 흰 면이라 채움 버튼이어도 글자는 primaryText(흰 글자가 흰 면에 묻히지 않게)
  const ink = filled && !selected ? colors.surface : variant === 'danger' ? colors.dangerStrong : colors.primaryText;
  return (
    // 안드로이드는 accessibilityState · disabled 에 참 · 거짓이 아닌 값(예: 'merge')이 오면 멈춘다
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{ disabled: !!disabled, selected: !!selected }}
      disabled={!!disabled} onPress={onPress} onLongPress={onLongPress}
      style={[local.base, iconOnly ? local.icon : local.text, local[variant], outline && variant === 'ghost' && local.outline, block && local.block, selected && local.selected, disabled && local.disabled, style]}>
      {icon ? <AppIcon name={icon} size={iconOnly ? 22 : 18} forText={iconOnly ? undefined : 15} color={ink} /> : null}
      {!iconOnly && <Text numberOfLines={1} style={[local.label, { color: ink }]}>{text}</Text>}
      {badge ? <View style={local.badge}><Text style={local.badgeText}>{badge}</Text></View> : null}
    </Pressable>
  );
}

const local = StyleSheet.create({
  block: { alignSelf: 'stretch' },
  base: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10 },
  text: { paddingHorizontal: 18 },
  icon: { width: 48, height: 48, borderRadius: 10, paddingHorizontal: 0 },
  filled: { backgroundColor: colors.primaryStrong },
  tonal: { backgroundColor: colors.surfaceMuted, paddingHorizontal: 16 },
  ghost: { backgroundColor: 'transparent', paddingHorizontal: 14 },
  outline: { borderWidth: 1, borderColor: colors.primary },
  // 고른 상태(토글 · 도구 선택): 흰 면 + primary 1px 테두리
  selected: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.dangerStrong },
  // 쓸 수 없을 때는 같은 모양을 흐리게(DISABLED_OPACITY) 둔다
  disabled: { opacity: 0.4 },
  label: { fontSize: 15, fontWeight: '800' },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.butter },
  badgeText: { fontSize: 11.5, fontWeight: '800', color: colors.text },
});
