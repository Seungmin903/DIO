import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { bubble, colors } from '../../shared/theme';
import { paperFontChips } from '../../editor/components/PaperFontChips';
import PopoverMenu from './PopoverMenu';

// 칸 폭은 도구 탭 묶음의 옅은 선(282)과 같고, 목록 말풍선도 칸과 같은 폭으로 뜬다(코덱스 2026-11-02)
const WIDTH = 282, ROW = 48;

/**
 * 속지 글꼴 드롭다운(꾸미기 공방 기본 속지 설정): 지금 글꼴 이름(그 글꼴로 씀) + ⌄ 를 누르면 아래에 목록 말풍선이 뜨고, 고르면 닫힌다.
 * 바깥을 누르거나 뒤로 가기 · 회전이면 닫힌다(PopoverMenu). value: 고른 글꼴 ID, onChange(id)
 */
export default function PaperFontDropdown({ value, onChange }) {
  const fonts = paperFontChips();
  const current = fonts.find(font => font.id === value) ?? fonts[0];
  const button = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    const node = button.current;
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width: WIDTH, height }) /* 말풍선 왼쪽 끝을 칸 왼쪽에 맞춘다 */; setOpen(true); });
    else setOpen(true);
  };
  return (
    <View>
      <Pressable ref={button} collapsable={false} accessibilityRole="button" accessibilityLabel={`속지 글꼴 ${current.label}, 바꾸기`} accessibilityState={{ expanded: open }}
        onPress={show} style={local.field}>
        <Text numberOfLines={1} style={[local.value, current.textStyle, { fontSize: (current.textStyle?.fontSize ?? 12.5) * 1.2 }]}>{current.label}</Text>
        {/* 드롭다운 표시: 아래로 꺾인 화살촉(⌄). 열리면 위로 뒤집는다 */}
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={18} forText={15} color={colors.primaryText} /></View>
      </Pressable>
      <PopoverMenu open={open} anchor={anchor} width={WIDTH} height={fonts.length * ROW + 12} label="속지 글꼴 목록" style={local.menu} onClose={() => setOpen(false)}>
        {fonts.map(font => {
          const on = font.id === current.id;
          return (
            <Pressable key={font.id} accessibilityRole="radio" accessibilityLabel={font.a11y} accessibilityState={{ checked: on }}
              onPress={() => { onChange(font.id); setOpen(false); }} style={[local.row, on && local.rowOn]}>
              <Text numberOfLines={1} style={[local.rowText, font.textStyle, { fontSize: (font.textStyle?.fontSize ?? 12.5) * 1.2 }]}>{font.label}</Text>
              {on ? <AppIcon name="check" size={16} forText={15} color={colors.primaryStrong} /> : null}
            </Pressable>
          );
        })}
      </PopoverMenu>
    </View>
  );
}

const local = StyleSheet.create({
  field: { minHeight: 48, width: WIDTH, maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 16, paddingRight: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  value: { color: colors.text },
  menu: { ...bubble, padding: 6 },
  row: { minHeight: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: colors.primarySoft },
  rowText: { color: colors.text },
});
