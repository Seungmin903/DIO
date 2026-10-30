import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../shared/theme';
import { setDeskMode, useDeskMode } from '../utils/deskTimeStore';

const OPTIONS = [
  { id: 'auto', label: '실시간' },
  { id: 'off', label: '조명 없음' },
];

/** 내 공간 환경 설정: 홈 책상이 실시간 빛을 따를지, 조명 없이 둘지(표지에도 조명 효과를 얹지 않는다). 기기에 저장된다. */
export default function DeskLightSetting() {
  const mode = useDeskMode();
  return (
    <View style={local.card}>
      <Text style={local.title}>환경 설정</Text>
      <View style={local.row}>
        <Text style={local.label}>홈 책상 빛</Text>
        <View style={local.switch} accessibilityRole="radiogroup" accessibilityLabel="홈 책상 빛">
          {OPTIONS.map(option => (
            <Pressable
              key={option.id}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ checked: mode === option.id }}
              onPress={() => setDeskMode(option.id)}
              style={({ pressed }) => [local.option, mode === option.id && local.optionSelected, pressed && local.pressed]}
            >
              <Text style={[local.optionText, mode === option.id && local.optionTextSelected]}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  card: { padding: 20, marginTop: 16, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  row: { marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  switch: { flexDirection: 'row', padding: 3, gap: 3, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  option: { minHeight: 40, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md - 3 },
  optionSelected: { backgroundColor: colors.text },
  optionText: { fontSize: 13, fontWeight: '700', color: colors.textMuted },
  optionTextSelected: { color: colors.surface },
  pressed: { opacity: 0.7 },
});
