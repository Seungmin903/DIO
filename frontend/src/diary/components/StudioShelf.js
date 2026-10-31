import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors } from '../../shared/theme';
import CoverArt from './CoverArt';
import { PdfPageThumb } from './PdfImport';

// 견본 칸(모서리 14): 세로 116×154, 가로 154×116. 표지 · 속지 모두 저장한 방향대로 칸을 세우거나 눕힌다.
const SLOT = { width: 116, height: 154 };
const WIDE_SLOT = { width: 154, height: 116 };

/**
 * 내 표지 · 내 속지 진열: 가로로 미는 선반 한 줄. 칸 사이 14, 화면 끝에서 다음 칸이 잘려 보여 더 있다는 것을 알린다.
 * 이름 아래 줄 오른쪽에 지우기 버튼(48)을 둔다(견본 위에는 아무것도 띄우지 않는다).
 * kind: 'cover' | 'paper', items: useMyLibrary 의 covers / papers, onRemove(item): 지우기 확인을 여는 쪽이 정한다.
 */
export default function StudioShelf({ kind, items, onRemove }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={local.row}>
      {items.map(item => {
        const paper = kind === 'paper';
        const slot = item.orientation === 'landscape' ? WIDE_SLOT : SLOT;
        const label = paper ? `${item.name} · ${item.pages.length}장` : item.name;
        return (
          <View key={item.id} style={{ width: slot.width }}>
            <View accessible accessibilityRole="image" accessibilityLabel={paper ? `${label} 속지` : `${label} 표지`} style={[local.art, slot]}>
              {paper
                ? <PdfPageThumb page={item.pages[0]} width={slot.width - 16} ratio={slot.width / slot.height} />
                : <CoverArt cover={item.cover} name={item.name} width={slot.width} height={slot.height} />}
            </View>
            <View style={local.meta}>
              <View style={local.names}>
                <Text numberOfLines={1} style={local.name}>{item.name}</Text>
                {paper ? <Text style={local.sub}>{`${item.pages.length}장`}</Text> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={paper ? `나의 속지 ${item.name} 지우기` : `나의 표지 ${item.name} 지우기`}
                onPress={() => onRemove(item)} style={local.remove}>
                <AppIcon name="trash" size={18} color={colors.primaryText} />
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const local = StyleSheet.create({
  row: { gap: 14, paddingRight: 36, paddingVertical: 4 },
  art: { overflow: 'hidden', borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  meta: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  names: { flex: 1, minWidth: 0, paddingLeft: 2 },
  name: { fontSize: 14, fontWeight: '700', color: colors.text },
  sub: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  remove: { width: 48, height: 48, marginRight: -12, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
