import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors } from '../../shared/theme';
import PopoverMenu from './PopoverMenu';
import SettingRow from './SettingRow';

const ROW = 48, INSET = 4;

/**
 * 값을 고르는 설정 행(코덱스 2026-11-02): 오른쪽에 면 · 테두리 없이 지금 값 + 아래 꺾쇠만 둔다(앱 버전 값과 같은 문법).
 * 행 전체를 누르면 값 아래에 목록 말풍선이 뜬다. 칩이 폰 폭에 다 들어가지 않는 고르기에 쓴다.
 * options: [{ id, label }], value: 고른 id, onChange(id).
 */
export default function SettingDropdown({ label, options, value, onChange, width = 180 }) {
  const anchorRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  const current = options.find(option => option.id === value) ?? options[0];
  const show = () => {
    const node = anchorRef.current;
    // 말풍선 오른쪽 끝을 값 오른쪽에 맞춘다(PopoverMenu 는 기준의 오른쪽 끝에 맞춘다)
    if (node?.measureInWindow) node.measureInWindow((x, y, w, height) => { setAnchor({ x, y, width: w, height }); setOpen(true); });
    else setOpen(true);
  };
  return (
    <>
      <SettingRow label={label} onPress={show} accessibilityLabel={`${label} ${current.label}, 바꾸기`} accessibilityState={{ expanded: open }}>
        <View ref={anchorRef} collapsable={false} style={local.value}>
          <Text style={local.valueText}>{current.label}</Text>
          {/* 아이콘 세트에 아래 꺾쇠가 없어 오른쪽 꺾쇠를 돌린다. 열리면 위로 */}
          <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={16} forText={15} color={colors.primaryStrong} /></View>
        </View>
      </SettingRow>
      <PopoverMenu open={open} anchor={anchor} width={width} height={options.length * (ROW + INSET) + 12} label={`${label} 목록`} style={local.menu} onClose={() => setOpen(false)}>
        {options.map(option => {
          const on = option.id === current.id;
          return (
            <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: on }}
              onPress={() => { onChange(option.id); setOpen(false); }} style={[local.row, on && local.rowOn]}>
              <Text style={local.rowText}>{option.label}</Text>
              {on ? <AppIcon name="check" size={16} forText={15} color={colors.primaryStrong} /> : null}
            </Pressable>
          );
        })}
      </PopoverMenu>
    </>
  );
}

const local = StyleSheet.create({
  // 값 + 꺾쇠(사이 6): 터치는 행 전체(48)가 받아 값 자리는 높이를 따로 두지 않는다(행이 다른 행과 같은 48)
  value: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  valueText: { fontSize: 15, fontWeight: '600', color: colors.primaryStrong },
  // 목록: 흰 면 + cardBorder 1, 그림자 없음(카드 없는 설정 화면에 맞춘다)
  menu: { padding: INSET, borderRadius: 12, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  row: { minHeight: ROW, margin: INSET / 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, borderRadius: 8 },
  rowOn: { backgroundColor: colors.primarySoft },
  rowText: { fontSize: 15, fontWeight: '600', color: colors.text },
});
