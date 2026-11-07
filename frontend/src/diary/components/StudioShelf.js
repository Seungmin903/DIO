import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors } from '../../shared/theme';
import FadeScroll, { CANVAS_FADE_RGB } from '../../editor/components/controls/FadeScroll';
import CoverArt from './CoverArt';
import { PdfPageThumb } from './PdfImport';

// 표지는 기존 크기를 쓰고, PDF 속지는 본문을 더 쉽게 읽도록 더 큰 견본을 쓴다.
const SLOT = { width: 116, height: 154 };
const WIDE_SLOT = { width: 154, height: 116 };
const PAPER_SLOT = { portrait: { width: 148, height: 208 }, landscape: { width: 208, height: 148 } };

/**
 * 내 표지 · 내 속지 진열: 가로로 미는 선반 한 줄. 칸 사이 14, 화면 끝에서 다음 칸이 잘려 보여 더 있다는 것을 알린다.
 * 이름 아래 줄 오른쪽에 지우기 버튼(48)을 둔다(견본 위에는 아무것도 띄우지 않는다).
 * 이름을 누르면 그 자리에서 고친다(저장은 확인 · 포커스를 옮길 때, 비우면 원래 이름).
 * onOpen(item): 있으면 견본을 눌러 그 안을 펼친다(속지: 전체 쪽 목록).
 * kind: 'cover' | 'paper', items: useMyLibrary 의 covers / papers, onRemove(item): 지우기 확인을 여는 쪽이 정한다, onRename(item, name): 이름 저장.
 */
export default function StudioShelf({ kind, items, onRemove, onRename, onOpen }) {
  const [editing, setEditing] = useState(null); // { id, draft }
  // 한 줄 입력은 완료를 누르면 blur 도 따라와 두 번 불린다. 같은 편집은 한 번만 저장한다
  const finished = useRef(null);
  const finish = item => {
    if (!editing || finished.current === editing) return;
    finished.current = editing;
    const name = editing.draft.trim();
    setEditing(null);
    if (name && name !== item.name) onRename?.(item, name);
  };
  return (
    <FadeScroll horizontal fadeRgb={CANVAS_FADE_RGB} contentContainerStyle={local.row}>
      {items.map(item => {
        const paper = kind === 'paper';
        const slot = paper ? PAPER_SLOT[item.orientation] : item.orientation === 'landscape' ? WIDE_SLOT : SLOT;
        const label = paper ? `${item.name} · ${item.pages.length}장` : item.name;
        return (
          <View key={item.id} style={{ width: slot.width }}>
            {(() => {
              const art = paper
                ? <PdfPageThumb page={item.pages[0]} width={slot.width - 2} ratio={slot.width / slot.height} maxHeight={slot.height - 2} />
                : <CoverArt cover={item.cover} name={item.name} width={slot.width} height={slot.height} />;
              return onOpen
                ? <Pressable accessibilityRole="button" accessibilityLabel={`${label} ${paper ? '속지' : '표지'} 펼치기`} onPress={() => onOpen(item)} style={[local.art, slot]}>{art}</Pressable>
                : <View accessible accessibilityRole="image" accessibilityLabel={paper ? `${label} 속지` : `${label} 표지`} style={[local.art, slot]}>{art}</View>;
            })()}
            <View style={local.meta}>
              <View style={local.names}>
                {editing?.id === item.id
                  ? <TextInput autoFocus selectTextOnFocus maxLength={40} value={editing.draft} accessibilityLabel={paper ? '내 속지 이름' : '내 표지 이름'}
                    onChangeText={draft => setEditing({ id: item.id, draft })} onSubmitEditing={() => finish(item)} onBlur={() => finish(item)}
                    returnKeyType="done" style={[local.name, local.nameInput]} />
                  : <Pressable accessibilityRole="button" accessibilityLabel={paper ? `내 속지 ${item.name} 이름 고치기` : `내 표지 ${item.name} 이름 고치기`}
                    onPress={() => setEditing({ id: item.id, draft: item.name })} style={local.nameRow}>
                    <Text numberOfLines={1} style={[local.name, local.nameText]}>{item.name}</Text>
                    <AppIcon name="edit" size={12} forText={14} color={colors.textMuted} />
                  </Pressable>}
                {paper ? <Text style={local.sub}>{`${item.pages.length}장`}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={paper ? `내 속지 ${item.name} 지우기` : `내 표지 ${item.name} 지우기`}
                onPress={() => onRemove(item)} style={local.remove}>
                <AppIcon name="trash" size={18} color={colors.primaryText} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </FadeScroll>
  );
}

const local = StyleSheet.create({
  row: { gap: 14, paddingRight: 36, paddingVertical: 4 },
  art: { overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  names: { flex: 1, minWidth: 0, paddingLeft: 2 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  nameRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameText: { flexShrink: 1 },
  nameInput: { minHeight: 32, paddingVertical: 0, paddingHorizontal: 6, marginLeft: -6, borderRadius: 8, borderWidth: 1, borderColor: colors.primary },
  sub: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  remove: { width: 48, height: 48, marginRight: -12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
