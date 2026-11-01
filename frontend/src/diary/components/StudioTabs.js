import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';

// 견출지 스택형 인덱스(1020 감성 점검 시안 C, 사용자 선택): 위 모서리만 둥근 직사각 탭을 겹치지 않고 6 간격으로 세운다.
// 고른 탭은 lavender100 으로 4 더 높이 서고 아래 선(cardBorder)까지 내려와 선을 덮어 아래 면과 이어진다. 나머지는 surfaceSoft(#F7F8FD), 테두리 · 그림자 없음.
// 높이 36(고른 탭 40). 폰은 가로로 밀지 않고 다섯 칸을 본문 폭 안에 같은 폭으로 나눈다(앱 디자인 점검 원 페이저 08)
const SIZE = { wide: { width: 104, idle: 36, selected: 40 }, compact: { width: null, idle: 36, selected: 40 } };
// DROP = 아래 선 굵기: 프리셋 · 속지 구분선과 같은 1(사용자 지시로 굵기 통일). 고른 탭은 이만큼 내려와 선을 덮는다
const GAP = 6, GAP_COMPACT = 4, DROP = 1, CORNER = 8;

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
      {(() => {
        const items = tabs.map((tab, index) => {
          const selected = index === selectedIndex;
          return (
            <Pressable key={tab.id} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected }}
              onPress={() => onChange(tab.id)}
              style={[local.tab, compact ? local.tabCompact : { width: size.width }, { height: selected ? size.selected + DROP : size.idle }, selected ? local.tabSelected : local.tabIdle]}>
              <Text numberOfLines={1} style={[local.label, compact && local.labelCompact, selected && local.labelSelected]}>{tab.label}</Text>
            </Pressable>
          );
        });
        return compact
          ? <View accessibilityRole="tablist" style={[local.row, local.rowCompact]}>{items}</View>
          : <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" contentContainerStyle={local.row}>{items}</ScrollView>;
      })()}
    </View>
  );
}

const local = StyleSheet.create({
  wrap: { marginBottom: 24 },
  row: { alignItems: 'flex-end', gap: GAP, paddingRight: 8 },
  rowCompact: { flexDirection: 'row', gap: GAP_COMPACT, paddingRight: 0 },
  tabCompact: { flex: 1, minWidth: 0 },
  tab: { alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: CORNER, borderTopRightRadius: CORNER },
  tabIdle: { backgroundColor: colors.surfaceSoft, marginBottom: DROP },
  tabSelected: { backgroundColor: colors.lavender100, paddingTop: DROP },
  // 글자 16/600 #0B1766(1020 코덱스 5번): 안 고른 탭도 같은 색, 고른 탭은 면 · 높이로만 구분
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  labelCompact: { fontSize: 13 }, // 폰: 13(고른 탭은 아래 labelSelected 로 700)
  labelSelected: { fontWeight: '700' },
  // 안 고른 탭 바로 아래(바닥에서 DROP 위)의 선
  line: { position: 'absolute', left: 0, right: 0, bottom: 0, height: DROP, backgroundColor: colors.cardBorder },
});
