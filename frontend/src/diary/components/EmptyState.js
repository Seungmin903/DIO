import { Pressable, Text, View } from 'react-native';
import { styles as s } from '../styles';

export default function EmptyState({ title, copy, onCreate, search = false }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><Text style={s.emptyIconText}>{search ? '⌕' : '+'}</Text></View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyCopy}>{copy}</Text>
      {onCreate && (
        <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [s.secondary, pressed && s.pressed]}>
          <Text style={s.secondaryText}>새 다이어리 만들기</Text>
          <Text style={s.secondaryArrow}>→</Text>
        </Pressable>
      )}
    </View>
  );
}
