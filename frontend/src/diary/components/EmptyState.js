import { Pressable, Text, View } from 'react-native';
import { C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';

export default function EmptyState({ title, copy, onCreate, search = false, compact = false }) {
  return (
    <View style={[s.empty, compact && s.emptyCompact]}>
      <View style={s.emptyIcon}>
        <AppIcon name={search ? 'search' : 'book'} size={30} color={C.blue} strokeWidth={1.7} />
      </View>
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
