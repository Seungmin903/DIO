import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Icon from '../../editor/components/controls/Icon';
import DioButton from '../../shared/DioButton';
import { TAPE_PALETTES } from '../../editor/constants';
import { tapeColors, usePalette } from '../../editor/hooks/usePalettes';
import { MAX_PRESETS, useColorPresets } from '../../editor/components/controls/MyColorPresets';
import { colors } from '../../shared/theme';
import PresetColorEditor from './PresetColorEditor';

// 내 프리셋: 편집기 도구(펜 · 형광펜 · 마스킹 테이프 · 글자)가 한 줄로 보여 주는 색 목록을 여기서 고친다. 편집기 색 줄이 그대로 따른다.
// 색을 누르면 그 옆에 바꾸기 · 원래대로 말풍선이 뜬다. 바꾼 도구에만 '기본 색으로'가 생긴다.
// 프리셋 아래에 '내 색상'(도구에서 따로 저장한 색, 최대 14)을 완전히 나눠 둔다: 누르면 바꾸기 · 지우기 말풍선, 맨 끝 + 로 추가(코덱스 2026-11-01).
// 견본은 모두 원(30, 편집기 · 속지 견본과 같은 크기, 테두리 없음): 테이프는 바탕 원 안에 무늬색 작은 원을 겹친다(편집기 색 고르기와 같은 모양).
// 바꾸는 중인 견본만 primaryText 2px 고리를 두른다(앱 디자인 점검 원 페이저 10). 흰색에 가까운 색만 옅은 테두리를 남겨 흰 면에 묻히지 않게 한다.
const GROUPS = [
  { scope: 'pen', label: '펜' },
  { scope: 'highlighter', label: '형광펜' },
  { scope: 'tape', label: '마스킹 테이프' },
  { scope: 'text', label: '글자' },
];
const tapeName = entry => TAPE_PALETTES.find(item => item.id === entry)?.name ?? entry.split(':').slice(1).join('/');

const nearWhite = hex => /^#[0-9a-f]{6}$/i.test(hex) && [1, 3, 5].every(i => parseInt(hex.slice(i, i + 2), 16) >= 0xEE);

function Dot({ bg, fg, active }) {
  return <View style={[local.ring, active && local.ringActive]}>
    <View style={[local.dot, nearWhite(bg) && local.dotEdge, { backgroundColor: bg }]}>{fg ? <View style={[local.inner, { backgroundColor: fg }]} /> : null}</View>
  </View>;
}

// 도구 표시: 편집기 도구막대와 같은 앱 아이콘(펜 · 형광펜 · 마스킹테이프 · 텍스트)
const TOOL_ICON = { pen: 'pen', highlighter: 'highlighter', tape: 'tape', text: 'text' };

// 두 색 내 색상('#바탕/#무늬')과 말풍선 값('custom:#바탕:#무늬')을 오간다. 한 색만 저장한 테이프 색은 무늬도 같은 색으로 연다
const toEditor = (entry, tape) => { if (!tape) return entry; const [bg, fg = bg] = entry.split('/'); return `custom:${bg}:${fg}`; };
const fromEditor = (value, tape) => (tape ? value.split(':').slice(1).join('/') : value);

function Swatch({ label, bg, fg, active, onPress, cellRef }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} ref={cellRef} collapsable={false} onPress={onPress} style={local.cell}>
    <Dot bg={bg} fg={fg} active={active} />
  </Pressable>;
}

function Group({ group, compact, width }) {
  const tape = group.scope === 'tape';
  const { colors: list, defaults, edited, save, reset } = usePalette(group.scope);
  const mine = useColorPresets(group.scope);
  const cells = useRef({});
  // { kind: 'preset' | 'mine' | 'add', index, anchor }: 바꾸는 색과 그 견본의 창 안 자리(말풍선을 그 옆에 띄운다)
  const [editing, setEditing] = useState(null);
  const nameOf = entry => (tape ? tapeName(entry) : entry);
  const open = (kind, index) => () => {
    const node = cells.current[`${kind}${index}`];
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setEditing({ kind, index, anchor: { x, y, width, height } }));
    else setEditing({ kind, index, anchor: null });
  };
  const ref = (kind, index) => node => { cells.current[`${kind}${index}`] = node; };
  const mineEntry = editing?.kind === 'mine' ? mine.presets[editing.index] : null;
  let editor = null;
  if (editing?.kind === 'preset') editor = <PresetColorEditor title={`${group.label} 색 바꾸기`} tape={tape} value={list[editing.index]} anchor={editing.anchor}
    onClose={() => setEditing(null)} original={defaults[editing.index] ?? list[editing.index]}
    onDone={value => { save(list.map((entry, i) => (i === editing.index ? value : entry))); setEditing(null); }} />;
  else if (mineEntry) editor = <PresetColorEditor title={`내 ${group.label} 색 바꾸기`} tape={tape} value={toEditor(mineEntry, tape)} anchor={editing.anchor}
    onClose={() => setEditing(null)} onRemove={() => { mine.remove(mineEntry); setEditing(null); }}
    onDone={value => { mine.replace(mineEntry, fromEditor(value, tape)); setEditing(null); }} />;
  else if (editing?.kind === 'add') editor = <PresetColorEditor title={`내 ${group.label} 색 추가`} tape={tape} original={null} anchor={editing.anchor}
    value={toEditor(mine.presets[mine.presets.length - 1] ?? (tape ? '#F6D6DA/#E58FA0' : '#2E3A59'), tape)}
    onClose={() => setEditing(null)} onDone={value => { mine.add(fromEditor(value, tape)); setEditing(null); }} />;
  return (
    <View style={[local.card, { width }, compact && local.cardCompact]}>
      <View style={local.head}>
        <View style={local.preview}><Icon name={TOOL_ICON[group.scope]} size={22} color={colors.text} /></View>
        <Text style={local.groupTitle}>{group.label}</Text>
        {edited ? <DioButton variant="ghost" outline label={`${group.label} 기본 색으로`} text="기본 색으로" onPress={reset} style={local.reset} /> : null}
      </View>
      <View style={local.line} />
      <View style={local.row}>
        {list.map((entry, index) => {
          const { bg, fg } = tape ? tapeColors(entry) : { bg: entry, fg: null };
          return <Swatch key={`${entry}-${index}`} label={`${group.label} 색 ${nameOf(entry)} 바꾸기`} bg={bg} fg={fg} active={editing?.kind === 'preset' && editing.index === index}
            cellRef={ref('preset', index)} onPress={open('preset', index)} />;
        })}
      </View>
      <Text style={local.mineTitle}>내 색상</Text>
      <View style={local.row}>
        {mine.presets.map((entry, index) => {
          const [bg, fg = null] = entry.split('/');
          return <Swatch key={entry} label={`내 ${group.label} 색 ${entry} 바꾸기`} bg={bg} fg={fg} active={editing?.kind === 'mine' && editing.index === index}
            cellRef={ref('mine', index)} onPress={open('mine', index)} />;
        })}
        {mine.loaded && mine.presets.length < MAX_PRESETS && <Pressable accessibilityRole="button" accessibilityLabel={`내 ${group.label} 색 추가`} ref={ref('add', 0)} collapsable={false}
          onPress={open('add', 0)} style={local.cell}>
          <View style={[local.ring, editing?.kind === 'add' && local.ringActive]}><View style={[local.dot, local.add]}><Icon name="plus" size={14} color={colors.textMuted} strokeWidth={2.4} /></View></View>
        </Pressable>}
      </View>
      {editor}
    </View>
  );
}

/**
 * 내 프리셋 본문: 도구마다 한 묶음 — 위에 도구 미리보기 + 이름(+ 바꾼 도구만 '기본 색으로'), 아래에 색 견본 한 줄.
 * 카드 면 · 테두리 없이 여백으로 나누고, 이름과 색 사이에만 옅은 선을 둔다(사용자 지시). 태블릿은 3열, 폰은 1열.
 */
// 열 수는 묶음 폭이 색 한 줄(ROW_WIDTH)보다 좁아지지 않는 만큼: 태블릿 가로 3열, 세로 2열, 더 좁으면 1열
const ROW_WIDTH = 288;
const COLUMNS = [[3, '31%', '3.5%'], [2, '48%', '4%']];
export default function StudioPresets({ compact = false }) {
  const [gridWidth, setGridWidth] = useState(0);
  const [, width, gap] = (gridWidth && COLUMNS.find(([count, share]) => gridWidth * parseFloat(share) / 100 >= ROW_WIDTH)) || [1, '100%', 0];
  return (
    <View onLayout={event => setGridWidth(Math.round(event.nativeEvent.layout.width))} style={[local.grid, { columnGap: gap }, compact && local.gridCompact]}>
      {GROUPS.map(group => <Group key={group.scope} group={group} compact={compact} width={width} />)}
    </View>
  );
}

const local = StyleSheet.create({
  // 태블릿 가로 3열(사용자 지시): 열 31% × 3 + 사이 3.5% × 2 = 100%. 세로는 48% × 2 + 4%(열 폭이 색 한 줄 288 보다 좁아지면 열을 줄인다, COLUMNS).
  // 남는 묶음은 다음 줄 첫 칸에 같은 폭으로 선다(늘어나지 않는다). 면 · 테두리 없이 여백으로 나눈다
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 24 }, // 묶음 사이는 선 없이 여백 24
  gridCompact: { flexDirection: 'column', rowGap: 24 },
  card: { gap: 8 },
  cardCompact: { width: 'auto' },
  head: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  reset: { minHeight: 32, paddingHorizontal: 10 },
  // 이름과 색 사이의 옅은 선(사용자 지시로 다시 넣음). 길이는 색 7개의 첫 원 왼쪽 끝부터 마지막 원 오른쪽 끝까지:
  // 칸 7×36 + 사이 6×6 − 칸 안 여백 3×2 = 282. 좁은 화면에서는 칸 폭을 넘지 않는다
  line: { width: 282, maxWidth: '100%', height: 1, backgroundColor: colors.cardBorder },
  // 원 30 · 터치 칸 36 · 사이 6(코덱스 2026-11-01): 7개 = 288 이라 폰(약 300)에서도 한 줄. 내 색상 14개는 7개씩 두 줄로 감긴다
  // 칸(36)이 원(30)보다 3씩 넓어, 첫 원의 왼쪽 끝이 제목 왼쪽 끝과 맞도록 줄을 3 당긴다
  row: { width: 288, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 8, marginLeft: -3 },
  mineTitle: { marginTop: 16, fontSize: 13, fontWeight: '800', color: colors.textMuted }, // 프리셋 줄 터치 칸 아래 24(묶음 gap 8 + 16)
  cell: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  // 고리 자리(36)는 늘 두고 바꾸는 중일 때만 색을 칠해, 고리가 생겨도 원이 움직이지 않는다
  ring: { width: 36, height: 36, borderRadius: 18, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  ringActive: { borderColor: colors.primaryText },
  dot: { width: 30, height: 30, borderRadius: 15 },
  dotEdge: { borderWidth: 1, borderColor: colors.cardBorder },
  add: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, backgroundColor: colors.surface },
  inner: { position: 'absolute', right: 3, bottom: 3, width: 10, height: 10, borderRadius: 5 },
});
