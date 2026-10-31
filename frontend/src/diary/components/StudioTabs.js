import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';

// 견출지 스택형 인덱스(1020 감성 점검 시안 C, 사용자 선택): 위 모서리만 둥근 직사각 탭을 겹치지 않고 6 간격으로 세운다.
// 고른 탭은 lavender100 으로 8 더 높이 서고 아래 선(cardBorder)보다 2 내려와 선을 덮어 아래 면과 이어진다. 나머지는 surfaceMuted.
const SIZE = { wide: { width: 104, idle: 40, selected: 48 }, compact: { width: 88, idle: 40, selected: 48 } };
const GAP = 6, DROP = 2, CORNER = 8;

/**
 * 꾸미기 공방 종류 전환(폰트 · 스티커 · 표지 · 속지 · 프리셋). 한 번에 하나만 연다. 눌림 효과 · 장식 라벨은 없다.
 */
export default function StudioTabs({ tabs, value, onChange, compact = false }) {
  const size = compact ? SIZE.compact : SIZE.wide;
  const selectedIndex = Math.max(0, tabs.findIndex(tab => tab.id === value));
  return (
    <View style={local.wrap}>
      {/* 아래 선을 먼저 그리고 탭을 그 위에 그린다: 고른 탭만 선 아래까지 내려와 선을 덮는다 */}
      <View style={local.line} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={[local.row, compact && local.rowCompact]}>
        {tabs.map((tab, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }}
              onPress={() => onChange(tab.id)}
              style={[local.tab, { width: size.width, height: selected ? size.selected + DROP : size.idle }, selected ? local.tabSelected : local.tabIdle]}>
              <Text numberOfLines={1} style={[local.label, selected && local.labelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  wrap: { marginBottom: 24 },
  row: { alignItems: 'flex-end', gap: GAP, paddingRight: 8 },
  rowCompact: { paddingRight: 20 },
  tab: { alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: CORNER, borderTopRightRadius: CORNER },
  tabIdle: { backgroundColor: colors.surfaceMuted, marginBottom: DROP },
  tabSelected: { backgroundColor: colors.lavender100, paddingTop: DROP },
  // 글자 16/600 #0B1766(1020 코덱스 5번): 안 고른 탭도 같은 색, 고른 탭은 면 · 높이로만 구분
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  labelSelected: { fontWeight: '700' },
  // 안 고른 탭 바로 아래(바닥에서 DROP 위)의 선
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: colors.cardBorder },
});
