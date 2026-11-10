import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../../editor/components/controls/Icon';
import DioButton from '../../shared/DioButton';
import { usePalette } from '../../editor/hooks/usePalettes';
import { colors } from '../../shared/theme';
import EditablePalette from '../../editor/components/controls/EditablePalette';

// 내 프리셋: 편집기 도구(펜 · 형광펜 · 마스킹 테이프 · 글자)가 한 줄로 보여 주는 색 목록을 여기서 고친다. 편집기 색 줄이 그대로 따른다.
// 팔레트 편집 모드에서 색을 누르면 공용 색 창이 뜬다. 바꾼 도구에만 '기본 색으로'가 생긴다.
// 견본은 모두 원(30, 편집기 · 속지 견본과 같은 크기, 테두리 없음): 테이프는 바탕 원 안에 무늬색 작은 원을 겹친다(편집기 색 고르기와 같은 모양).
// 바꾸는 중인 견본만 primaryText 2px 고리를 두른다(앱 디자인 점검 원 페이저 10). 흰색에 가까운 색만 옅은 테두리를 남겨 흰 면에 묻히지 않게 한다.
const GROUPS = [
  { scope: 'pen', label: '펜' },
  { scope: 'glass', label: '유리펜' },
  { scope: 'dashed', label: '점선' },
  { scope: 'highlighter', label: '형광펜' },
  { scope: 'tape', label: '마스킹 테이프' },
  { scope: 'text', label: '글자' },
];

// 바탕과 잘 안 갈리는 옅은 색(세 채널 모두 E0 이상: 흰색 · 종이 색 견본)만 옅은 테두리를 둔다(코덱스 2026-11-02)
const nearWhite = hex => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].every(i => parseInt(hex.slice(i, i + 2), 16) >= 0xE0);

function Dot({ bg, fg, active }) {
  return <View style={[local.ring, active && local.ringActive]}>
    <View style={[local.dot, nearWhite(bg) && local.dotEdge, { backgroundColor: bg }]}>{fg ? <View style={[local.inner, { backgroundColor: fg }]} /> : null}</View>
  </View>;
}

// 도구 표시: 편집기 도구막대와 같은 앱 아이콘(펜 · 형광펜 · 마스킹테이프 · 텍스트)
const TOOL_ICON = { pen: 'pen', glass: 'pen', dashed: 'pen', highlighter: 'highlighter', tape: 'tape', text: 'text' };


// 견본 한 칸(원 30 · 보이는 칸 36 · 터치 48). active 면 2px primaryText 고리. role 은 고르는 줄(기본 속지 설정)이면 'radio'
export function Swatch({ label, bg, fg, active, onPress, cellRef, role = 'button' }) {
  return <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={role === 'radio' ? { checked: active, selected: active } : undefined}
    ref={cellRef} collapsable={false} hitSlop={6} onPress={onPress} style={local.cell}>
    <Dot bg={bg} fg={fg} active={active} />
  </Pressable>;
}

function Group({ group, compact, width }) {
  const { edited, reset } = usePalette(group.scope)
  const [failed,setFailed] = useState(false)
  const resetPalette = async () => {
    setFailed(false)
    try { await reset(); setFailed(false) }
    catch { setFailed(true) }
  }
  return <View style={[local.card,{width},compact&&local.cardCompact]}>
    <GroupHead icon={TOOL_ICON[group.scope]} title={group.label} full={compact} right={edited ? <DioButton variant="ghost" outline label={`${group.label} 기본 색으로`} text="기본 색으로" onPress={resetPalette} style={local.reset} /> : null} />
    <EditablePalette scope={group.scope} label={group.label} />
    {failed && <Text accessibilityRole="alert" style={local.error}>팔레트를 저장하지 못했어요.</Text>}
  </View>
}

/**
 * 내 프리셋 본문: 도구마다 한 묶음 — 위에 도구 미리보기 + 이름(+ 바꾼 도구만 '기본 색으로'), 아래에 색 견본 한 줄.
 * 카드 면 · 테두리 없이 여백으로 나누고, 이름과 색 사이에만 옅은 선을 둔다(사용자 지시). 태블릿은 3열, 폰은 1열.
 */
// 열 수는 묶음 폭이 색 한 줄(ROW_WIDTH)보다 좁아지지 않는 만큼: 태블릿 가로 3열, 세로 2열, 더 좁으면 1열
const ROW_WIDTH = 288;
const COLUMNS = [[3, '31%', '3.5%'], [2, '48%', '4%']];
export default function StudioPresets({ compact = false }) {
  return <GroupGrid compact={compact}>{width => GROUPS.map(group => <Group key={group.scope} group={group} compact={compact} width={width} />)}</GroupGrid>;
}

/** 묶음 격자(도구 탭 · 기본 속지 설정): children(width) 로 묶음을 그린다. 열 수는 위 COLUMNS */
export function GroupGrid({ compact = false, children }) {
  const [gridWidth, setGridWidth] = useState(0);
  const [, width, gap] = (gridWidth && COLUMNS.find(([count, share]) => gridWidth * parseFloat(share) / 100 >= ROW_WIDTH)) || [1, '100%', 0];
  return (
    <View onLayout={event => setGridWidth(Math.round(event.nativeEvent.layout.width))} style={[local.grid, { columnGap: gap }, compact && local.gridCompact]}>
      {children(width)}
    </View>
  );
}

/** 묶음 머리: 아이콘 22(28 칸) + 이름 17/800 (+ 오른쪽 동작), 그 아래 옅은 선 */
// icon: 없으면 제목만(공방 '내 속지'). section: 한 단계 위 제목(18/800, 속지 탭의 '기본 속지 설정'과 같은 급). wide: 줄 전체 폭(오른쪽 동작을 줄 끝에 붙인다). count: 제목 옆 개수(공방 구역 제목의 개수와 같은 14/700 흐린 글자)
// full(폰): 머리줄 · 구분선을 칸 전체 폭으로 둔다. 폰은 한 줄에 한 묶음이라 318 고정이면 오른쪽에 빈 칸이 남았다(지라 594)
export function GroupHead({ icon, title, right = null, line = true, wide = false, count = null, section = false, full = false }) {
  return <>
    <View style={[local.head, (wide || full) && local.headWide]}>
      {icon ? <View style={local.preview}><Icon name={icon} size={22} color={colors.text} /></View> : null}
      <Text accessibilityRole={section ? 'header' : undefined} style={[local.groupTitle, section && local.sectionTitle, count && local.groupTitleFit]}>{title}</Text>
      {count ? <Text style={local.groupCount}>{count}</Text> : null}
      {count ? <View style={local.grow} /> : null}
      {/* 오른쪽 버튼은 줄 폭을 넘지 않는다(폰 좁은 폭에서 `PDF 불러오는 중 n/m` 같은 긴 글자가 제목을 밀지 않게) */}
      {right ? <View style={local.headRight}>{right}</View> : null}
    </View>
    {line && <View style={[local.line, full && local.lineFull]} />}
  </>;
}

/** 묶음 한 칸의 폭 · 사이 여백(도구 탭과 같은 값) */
export const groupStyle = (width, compact) => [local.card, { width }, compact && local.cardCompact];
/** 견본 줄(폭 288, 7개씩 감김) */
export const swatchRowStyle = () => local.row;

const local = StyleSheet.create({
  // 태블릿 가로 3열(사용자 지시): 열 31% × 3 + 사이 3.5% × 2 = 100%. 세로는 48% × 2 + 4%(열 폭이 색 한 줄 288 보다 좁아지면 열을 줄인다, COLUMNS).
  // 남는 묶음은 다음 줄 첫 칸에 같은 폭으로 선다(늘어나지 않는다). 면 · 테두리 없이 여백으로 나눈다
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 24 }, // 묶음 사이는 선 없이 여백 24
  gridCompact: { flexDirection: 'column', rowGap: 24 },
  card: { gap: 8 },
  cardCompact: { width: '100%' }, // 폰은 한 줄에 한 묶음: 칸을 전체 폭으로 잡아 머리줄 · 선 · 팔레트 편집이 오른쪽 끝까지 온다(지라 594)
  // 제목 줄은 아래 구분선(318)과 같은 폭: 오른쪽 '기본 색으로' 버튼 끝이 선 끝에 맞는다(칸이 넓어도 선 밖으로 나가지 않게)
  head: { width: 318, maxWidth: '100%', minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  headWide: { width: '100%' },
  sectionTitle: { fontSize: 18 }, // StudioPaperStyle 의 '기본 속지 설정' 제목과 같은 크기
  groupTitleFit: { flex: 0, flexShrink: 1 },
  groupCount: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  grow: { flex: 1 },
  headRight: { flexShrink: 1, minWidth: 0, marginLeft: 8 },
  reset: { minHeight: 32, paddingHorizontal: 10 },
  error: { fontSize: 12.5, fontWeight: '600', lineHeight: 19, color: colors.dangerStrong },
  // 이름과 색 사이의 옅은 선(사용자 지시로 다시 넣음). 길이는 색 7개의 첫 원 왼쪽 끝부터 마지막 원 오른쪽 끝까지:
  // 칸 7×36 + 사이 6×12 − 칸 안 여백 3×2 = 318. 좁은 화면에서는 칸 폭을 넘지 않는다
  line: { width: 318, maxWidth: '100%', height: 1, backgroundColor: colors.cardBorder },
  lineFull: { width: '100%' },
  // 칸(36)이 원(30)보다 3씩 넓어, 첫 원의 왼쪽 끝이 제목 왼쪽 끝과 맞도록 줄을 3 당긴다
  row: { width: 324, maxWidth: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 12, marginLeft: -3 },
  cell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // 고리 자리(36)는 늘 두고 바꾸는 중일 때만 색을 칠해, 고리가 생겨도 원이 움직이지 않는다
  ring: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ringActive: { borderColor: colors.primaryText },
  dot: { width: 30, height: 30, borderRadius: 15 },
  dotEdge: { borderWidth: 1, borderColor: colors.cardBorder },
  inner: { position: 'absolute', right: 3, bottom: 3, width: 10, height: 10, borderRadius: 5 },
});
