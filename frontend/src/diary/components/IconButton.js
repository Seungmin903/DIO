import { Pressable, Text } from 'react-native';
import { C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

// bare: 테두리 · 면 없는 40 아이콘(보관함 도구줄의 검색 · 더보기)
export default function IconButton({ label, icon, iconName, iconFill, onPress, selected = false, compact = false, small = false, bare = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      hitSlop={small || bare ? 4 : 2}
      style={({ pressed }) => [s.iconButton, small && s.iconButtonPhone, compact && s.iconButtonCompact, bare && s.iconButtonBare, selected && s.iconButtonSelected, pressed && s.pressed]}
    >
      {iconName ? (
        <AppIcon name={iconName} size={compact ? 18 : 21} color={selected ? '#FFFFFF' : C.ink} fill={iconFill} />
      ) : (
        <Text style={[s.icon, selected && s.iconSelected]}>{icon}</Text>
      )}
    </Pressable>
  );
}
