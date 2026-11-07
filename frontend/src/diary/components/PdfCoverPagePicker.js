import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorModal from '../../editor/components/controls/EditorModal';
import DioButton from '../../shared/DioButton';
import { MakerBar, MakerHeader } from '../../shared/MakerKit';
import { colors, DISABLED_OPACITY } from '../../shared/theme';
import { PdfPageThumb } from './PdfImport';
import SelectionMark from './SelectionMark';
import { pdfPageAspect } from '../utils/pdfImport';

const GAP = 16;
const RowGap = () => <View style={local.rowGap} />;

/**
 * 공방 '표지 추가 > PDF로 만들기'에서 표지로 쓸 쪽을 고른다(지라 601). 고른 쪽마다 내 표지를 하나씩 만든다.
 * 처음에는 첫 쪽만 골라 둔다. limit: 더 넣을 수 있는 내 표지 수(보관함 상한을 넘겨 예전 표지가 밀려나지 않게).
 * onDone(고른 쪽 번호 배열, 문서 순서) · onCancel()
 */
export default function PdfCoverPagePicker({ name, pages, limit, compact = false, onDone, onCancel }) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [picked, setPicked] = useState(() => new Set([0]));
  const [width, setWidth] = useState(0);
  const columns = compact ? 2 : window.width >= 900 ? 5 : 4;
  const pad = compact ? 16 : 24;
  const cell = width > 0 ? Math.floor((width - pad * 2 - GAP * (columns - 1)) / columns) : 0;
  const full = picked.size >= limit;
  const toggle = index => setPicked(current => {
    const next = new Set(current);
    if (next.has(index)) next.delete(index);
    else if (next.size < limit) next.add(index);
    return next;
  });
  const done = () => onDone([...picked].sort((a, b) => a - b));
  return (
    <EditorModal visible animationType="slide" onRequestClose={onCancel}>
      <View style={[local.screen, { paddingTop: Math.max(8, insets.top), paddingBottom: Math.max(12, insets.bottom), paddingLeft: insets.left, paddingRight: insets.right }]}>
        <MakerHeader title="표지로 쓸 쪽 고르기" onBack={onCancel} backLabel="닫기" compact={compact} />
        {/* 쪽이 많은 PDF(최대 60쪽)도 보이는 줄만 그린다 */}
        <View style={local.list} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
          {cell > 0 && <FlatList key={columns} data={pages} numColumns={columns} extraData={picked} initialNumToRender={columns * 4} windowSize={5}
            keyExtractor={(page, index) => `${page.mediaFileId}-${index}`}
            contentContainerStyle={[local.body, { paddingHorizontal: pad }]} columnWrapperStyle={local.row} ItemSeparatorComponent={RowGap}
            ListHeaderComponent={<Text numberOfLines={1} style={local.source}>{`${name} · ${pages.length}쪽`}</Text>}
            renderItem={({ item: page, index }) => {
              const on = picked.has(index), blocked = !on && full;
              return <Pressable accessibilityRole="checkbox" accessibilityLabel={`${index + 1}쪽`}
                accessibilityState={{ checked: on, disabled: blocked }} disabled={blocked} onPress={() => toggle(index)} style={[local.cell, { width: cell }]}>
                <View style={[local.frame, on && local.frameOn, blocked && local.blocked]}>
                  <PdfPageThumb page={page} width={cell - 4} ratio={pdfPageAspect(page)} maxHeight={cell * 1.5} raster={false} />
                  <SelectionMark selected={on} compact />
                </View>
                <Text style={[local.number, on && local.numberOn]}>{`${index + 1}쪽`}</Text>
              </Pressable>;
            }} />}
        </View>
        <MakerBar left={<Text accessibilityLiveRegion="polite" style={local.count}>{`${picked.size}장 고름 · 최대 ${limit}장`}</Text>}>
          <DioButton variant="filled" label={`표지 ${picked.size}개 만들기`} disabled={!picked.size} onPress={done} />
        </MakerBar>
      </View>
    </EditorModal>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  list: { flex: 1 },
  body: { paddingTop: 8, paddingBottom: 24 },
  source: { fontSize: 14, fontWeight: '700', color: colors.textMuted, marginBottom: 16 },
  row: { gap: GAP },
  rowGap: { height: GAP },
  cell: { alignItems: 'center', gap: 6 },
  // 고른 쪽: 2 primaryStrong 테두리(보관함 선택 표시와 같은 체크 원을 함께 둔다)
  frame: { padding: 2, borderRadius: 10, borderWidth: 2, borderColor: 'transparent', alignItems: 'center' },
  frameOn: { borderColor: colors.primaryStrong },
  blocked: { opacity: DISABLED_OPACITY },
  count: { color: colors.text, fontSize: 14, fontWeight: '700' },
  number: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  numberOn: { color: colors.primaryText, fontWeight: '700' },
});
