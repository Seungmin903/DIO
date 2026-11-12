import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { bubble, colors } from '../../shared/theme';
import { paperFontChips } from '../../editor/components/PaperFontChips';
import { PAPER_FONTS } from '../../editor/templates/paperFont.js';
import { downloadTextFont, subscribeTextFonts, textFontStateSnapshot } from '../../editor/utils/text';
import FontStatusMark, { FONT_PENDING_TEXT, fontNeedsDownload, fontStatusA11y } from '../../editor/components/controls/FontStatusMark';
import PopoverMenu from './PopoverMenu';

// 칸 폭은 도구 탭 묶음의 옅은 선(282)과 같고, 목록 말풍선도 칸과 같은 폭으로 뜬다(코덱스 2026-11-02)
const WIDTH = 282, ROW = 48;

/**
 * 속지 글꼴 드롭다운(꾸미기 공방 기본 속지 설정): 지금 글꼴 이름(그 글꼴로 씀) + ⌄ 를 누르면 아래에 목록 말풍선이 뜨고, 고르면 닫힌다.
 * 바깥을 누르거나 뒤로 가기 · 회전이면 닫힌다(PopoverMenu). value: 고른 글꼴 ID, onChange(id)
 * autoDownload: 고른 글꼴을 아직 받지 않았으면 칸이 보일 때 바로 받는다(꾸미기 공방만 켠다, 실기 피드백 2026-11-11).
 *   받지 못한 글꼴(error)은 다시 자동으로 받지 않는다(오프라인에서 끝없이 받지 않게) — 목록에서 받기를 누르면 다시 받는다.
 */
export default function PaperFontDropdown({ value, onChange, disabled = false, autoDownload = false }) {
  const button = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  // 글꼴을 늦게 불러와도 칸의 글자가 그 글꼴로 바뀌게 다시 그린다
  useSyncExternalStore(subscribeTextFonts, textFontStateSnapshot, textFontStateSnapshot);
  // 칩을 만드는 순간 그 글꼴 파일을 읽으므로, 목록이 닫혀 있을 때는 지금 글꼴만 만든다
  const currentId = PAPER_FONTS.some(font => font.id === value) ? value : PAPER_FONTS[0].id;
  const fonts = paperFontChips(open ? undefined : [currentId]);
  const current = fonts.find(font => font.id === currentId);
  const currentPending = fontNeedsDownload(current.status);
  useEffect(() => { if (autoDownload && current.status === 'download') downloadTextFont(currentId); }, [autoDownload, current.status, currentId]);
  const show = () => {
    const node = button.current;
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width: WIDTH, height }) /* 말풍선 왼쪽 끝을 칸 왼쪽에 맞춘다 */; setOpen(true); });
    else setOpen(true);
  };
  return (
    <View>
      <Pressable ref={button} collapsable={false} disabled={disabled} accessibilityRole="button" accessibilityLabel={`속지 글꼴 ${current.label}${fontStatusA11y(current.status)}, 바꾸기`} accessibilityState={{ expanded: open, disabled, busy: current.status === 'downloading' }}
        onPress={show} style={local.field}>
        {/* 고른 글꼴을 받기 전 · 받는 중이면 칸에서도 연한 이름 + 받기 표시 · 진행 막대로 보인다 */}
        <View style={local.valueRow}>
          <Text numberOfLines={1} style={[local.value, current.textStyle, { fontSize: (current.textStyle?.fontSize ?? 12.5) * 1.2 }, currentPending && FONT_PENDING_TEXT]}>{current.label}</Text>
          <FontStatusMark status={current.status} id={current.id} />
        </View>
        {/* 드롭다운 표시: 아래로 꺾인 화살촉(⌄). 열리면 위로 뒤집는다 */}
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={18} forText={15} color={colors.primaryText} /></View>
      </Pressable>
      <PopoverMenu open={open} anchor={anchor} width={WIDTH} height={fonts.length * ROW + 12} label="속지 글꼴 목록" style={local.menu} onClose={() => setOpen(false)}>
        {fonts.map(font => {
          const on = font.id === current.id;
          // 받지 않은 원격 글꼴: 흐린 이름 + 받기 표시. 누르면 받기만 하고 목록은 열어 둔다(받은 뒤 다시 눌러 고른다)
          const pending = fontNeedsDownload(font.status);
          return (
            <Pressable key={font.id} accessibilityRole="radio" accessibilityLabel={font.a11y + fontStatusA11y(font.status)} accessibilityState={{ checked: on, busy: font.status === 'downloading' }}
              onPress={() => { if (font.status === 'downloading') return; if (pending) { downloadTextFont(font.id); return; } onChange(font.id); setOpen(false); }} style={[local.row, on && local.rowOn]}>
              <Text numberOfLines={1} style={[local.rowText, font.textStyle, { fontSize: (font.textStyle?.fontSize ?? 12.5) * 1.2 }, pending && FONT_PENDING_TEXT]}>{font.label}</Text>
              {on ? <AppIcon name="check" size={16} forText={15} color={colors.primaryStrong} /> : <FontStatusMark status={font.status} id={font.id} />}
            </Pressable>
          );
        })}
      </PopoverMenu>
    </View>
  );
}

const local = StyleSheet.create({
  field: { minHeight: 48, width: WIDTH, maxWidth: '100%', alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingLeft: 16, paddingRight: 14, borderRadius: 10, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  valueRow: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { flexShrink: 1, color: colors.text },
  menu: { ...bubble, padding: 6 },
  row: { minHeight: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: colors.primarySoft },
  rowText: { flexShrink: 1, color: colors.text },
});
