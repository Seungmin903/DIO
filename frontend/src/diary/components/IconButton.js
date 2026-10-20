import { Pressable, Text } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

export default function IconButton({ label, icon, iconName, iconFill, onPress, selected = false, compact = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, compact && s.iconButtonCompact, selected && s.iconButtonSelected, pressed && s.pressed]}
    >
      {iconName ? (
        <AppIcon name={iconName} size={compact ? 18 : 21} color={selected ? '#FFFFFF' : '#0B1957'} fill={iconFill} />
      ) : (
        <Text style={[s.icon, selected && s.iconSelected]}>{icon}</Text>
      )}
    </Pressable>
  );
}
