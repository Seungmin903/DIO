import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../../editor/components/controls/Icon';
import DioButton from '../../shared/DioButton';
import { TAPE_PALETTES } from '../../editor/constants';
import { tapeColors, usePalette } from '../../editor/hooks/usePalettes';
import { colors } from '../../shared/theme';
import PresetColorEditor from './PresetColorEditor';

// 내 프리셋: 편집기 도구(펜 · 형광펜 · 마스킹 테이프 · 글자)가 한 줄로 보여 주는 색 목록을 여기서 고친다. 편집기 색 줄이 그대로 따른다.
// 색을 누르면 그 옆에 바꾸기 · 지우기 말풍선이 뜬다. 바꾼 도구에만 '기본 색으로'가 생긴다. '내 색상'(도구에서 따로 저장한 색)은 여기 보이지 않는다.
// 견본은 모두 원(30): 테이프는 바탕 원 안에 무늬색 작은 원을 겹친다(편집기 색 고르기와 같은 모양).
const GROUPS = [
  { scope: 'pen', label: '펜' },
  { scope: 'highlighter', label: '형광펜' },
  { scope: 'tape', label: '마스킹 테이프' },
  { scope: 'text', label: '글자' },
];
const tapeName = entry => TAPE_PALETTES.find(item => item.id === entry)?.name ?? entry.split(':').slice(1).join('/');

function Dot({ bg, fg }) {
  return <View style={[local.dot, { backgroundColor: bg }]}>{fg ? <View style={[local.inner, { backgroundColor: fg }]} /> : null}</View>;
}

// 도구 표시: 편집기 도구막대와 같은 앱 아이콘(펜 · 형광펜 · 마스킹테이프 · 텍스트)
const TOOL_ICON = { pen: 'pen', highlighter: 'highlighter', tape: 'tape', text: 'text' };

function Group({ group, compact }) {
  const tape = group.scope === 'tape';
  const { colors: list, edited, save, reset } = usePalette(group.scope);
  const cells = useRef({});
  const [editing, setEditing] = useState(null); // { index, anchor }: 바꾸는 색과 그 견본의 창 안 자리(말풍선을 그 옆에 띄운다)
  const nameOf = entry => (tape ? tapeName(entry) : entry);
  return (
    <View style={[local.card, compact && local.cardCompact]}>
      <View style={local.head}>
        <View style={local.preview}><Icon name={TOOL_ICON[group.scope]} size={22} color={colors.text} /></View>
        <Text style={local.groupTitle}>{group.label}</Text>
        {edited ? <DioButton variant="ghost" outline label={`${group.label} 기본 색으로`} text="기본 색으로" onPress={reset} style={local.reset} /> : null}
      </View>
      <View style={local.line} />
      <View style={[local.row, compact && local.rowCompact]}>
        {list.map((entry, index) => {
          const { bg, fg } = tape ? tapeColors(entry) : { bg: entry, fg: null };
          return (
            <Pressable key={`${entry}-${index}`} accessibilityRole="button" accessibilityLabel={`${group.label} 색 ${nameOf(entry)} 바꾸기`}
              ref={node => { cells.current[index] = node; }} collapsable={false}
              onPress={() => {
                const node = cells.current[index];
                if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setEditing({ index, anchor: { x, y, width, height } }));
                else setEditing({ index, anchor: null });
              }} style={local.cell}>
              <Dot bg={bg} fg={fg} />
            </Pressable>
          );
        })}
      </View>
      {editing && <PresetColorEditor title={`${group.label} 색 바꾸기`} tape={tape} value={editing ? list[editing.index] : null} anchor={editing?.anchor}
        onClose={() => setEditing(null)}
        onRemove={list.length > 1 ? () => { save(list.filter((_, i) => i !== editing.index)); setEditing(null); } : null}
        onDone={value => { save(list.map((entry, i) => (i === editing.index ? value : entry))); setEditing(null); }} />}
    </View>
  );
}

/**
 * 내 프리셋 본문: 도구마다 한 묶음 — 위에 도구 미리보기 + 이름(+ 바꾼 도구만 '기본 색으로'), 아래에 색 견본 한 줄.
 * 카드 면 · 테두리 없이 여백으로 나누고, 이름과 색 사이에만 옅은 선을 둔다(사용자 지시). 태블릿은 2×2(두 열이 화면 폭을 반씩), 폰은 1열.
 */
export default function StudioPresets({ compact = false }) {
  return (
    <View style={[local.grid, compact && local.gridCompact]}>
      {GROUPS.map(group => <Group key={group.scope} group={group} compact={compact} />)}
    </View>
  );
}

const local = StyleSheet.create({
  // 2×2: 두 열(사이 32), 두 줄(사이 32). 면 · 테두리 없이 묶음끼리 여백으로 나눈다
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 32, rowGap: 32 },
  gridCompact: { flexDirection: 'column', rowGap: 24 },
  card: { flexGrow: 1, flexBasis: '40%', gap: 8 },
  cardCompact: { flexBasis: 'auto' },
  head: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  reset: { minHeight: 32, paddingHorizontal: 10 },
  // 이름과 색 사이의 옅은 선(사용자 지시로 다시 넣음)
  line: { height: 1, backgroundColor: colors.cardBorder },
  // 터치 칸(44)이 원(30)보다 7씩 넓어, 첫 원의 왼쪽 끝이 제목 왼쪽 끝과 맞도록 줄을 7 당긴다
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginLeft: -7 },
  rowCompact: { gap: 5 },
  cell: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.cardBorder },
  inner: { position: 'absolute', right: 3, bottom: 3, width: 10, height: 10, borderRadius: 5 },
});
