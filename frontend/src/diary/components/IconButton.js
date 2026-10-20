import { Pressable, Text } from 'react-native';
import { styles as s } from '../styles';

export default function IconButton({ label, icon, onPress, selected = false, compact = false }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [s.iconButton, compact && s.iconButtonCompact, selected && s.iconButtonSelected, pressed && s.pressed]}
    >
      <Text style={[s.icon, selected && s.iconSelected]}>{icon}</Text>
    </Pressable>
  );
}
