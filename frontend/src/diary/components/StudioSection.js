import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';

// 꾸미기 공방에서 지금 고른 종류 하나(내 폰트 · 내 스티커 · 내 표지 · 내 속지)를 보여 주는 구역.
// 카드로 감싸지 않는다: 제목(22/800) + 개수 + 오른쪽 동작 한 줄, 그 아래 선반 · 목록이 앱 바탕 위에 바로 놓인다.
// count: 모아 둔 개수 글자(예: '3개'), 없으면 감춘다.
// fill: 빈 상태일 때 화면의 남은 높이를 채워 빈 상태(디오 + 제목)가 홈 · 휴지통처럼 가운데보다 약간 위에 오게 한다.
// stacked: 오른쪽 동작을 제목 아래 전폭으로 한 줄씩 쌓는다(폰의 만들기 도구 버튼)
export default function StudioSection({ title, count = null, right = null, stacked = false, fill = false, children }) {
  return (
    <View style={[local.section, fill && local.fill]}>
      <View style={local.head}>
        <Text accessibilityRole="header" style={local.title}>{title}</Text>
        {count ? <Text style={local.count}>{count}</Text> : null}
        {right ? <View style={stacked ? local.stacked : local.right}>{right}</View> : null}
      </View>
      {children}
    </View>
  );
}

const local = StyleSheet.create({
  section: { gap: 16 },
  fill: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, minHeight: 48 },
  title: { flexShrink: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.4, color: colors.text },
  count: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 8 },
  stacked: { width: '100%', gap: 8 },
});
