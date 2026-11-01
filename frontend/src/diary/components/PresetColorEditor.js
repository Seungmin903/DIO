import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker from '../../editor/components/controls/ColorPicker';
import { tapeColors } from '../../editor/hooks/usePalettes';
import { bubble, colors } from '../../shared/theme';
import DioButton from '../../shared/DioButton';
import PopoverMenu from './PopoverMenu';

const WIDTH = 340;

/**
 * 내 프리셋 색 하나를 바꾸는 말풍선. 누른 견본 옆(아래, 자리가 없으면 위)에 뜨고, 바깥을 누르거나 뒤로 가기 · 회전이면 바꾸지 않고 닫힌다.
 * tape 이면 바탕색 · 무늬색을 골라 바꾼다(결과는 'custom:#바탕:#무늬'). 나머지는 '#RRGGBB' 하나.
 * anchor: 견본의 창 안 자리, value: 처음 값, onDone(value), onRemove(): 지우기(없으면 버튼을 두지 않는다), onClose()
 */
export default function PresetColorEditor({ title, tape = false, anchor = null, value, onDone, onRemove, onClose }) {
  const start = tape ? tapeColors(value) : { bg: value, fg: null };
  const [bg, setBg] = useState(start.bg), [fg, setFg] = useState(start.fg);
  const [slot, setSlot] = useState('bg');
  const current = slot === 'fg' ? fg : bg;
  const pick = hex => (slot === 'fg' ? setFg(hex) : setBg(hex));
  // 말풍선 왼쪽 끝을 누른 견본 왼쪽에 맞춘다(PopoverMenu 는 기준의 오른쪽 끝에 맞추므로 기준 폭을 말풍선 폭으로 준다). 높이는 실제 크기에 맞춰 아래 자리를 먼저 쓴다
  return (
    <PopoverMenu open anchor={anchor ? { ...anchor, width: WIDTH } : null} width={WIDTH} height={tape ? 400 : 340} label={title} style={local.bubble} onClose={onClose}>
      <View style={local.head}>
        <View style={[local.preview, { backgroundColor: bg }]}>{tape ? <View style={[local.previewInner, { backgroundColor: fg }]} /> : null}</View>
        <Text accessibilityRole="header" style={local.title}>{title}</Text>
      </View>
      {tape && <View style={local.slots} accessibilityRole="radiogroup">
        {[{ id: 'bg', name: '바탕색', color: bg }, { id: 'fg', name: '무늬색', color: fg }].map(item => (
          <Pressable key={item.id} accessibilityRole="radio" accessibilityLabel={`${item.name} 바꾸기`} accessibilityState={{ checked: slot === item.id }}
            onPress={() => setSlot(item.id)} style={[local.slot, slot === item.id && local.slotOn]}>
            <View style={[local.slotDot, { backgroundColor: item.color }]} />
            <Text style={[local.slotText, slot === item.id && local.slotTextOn]}>{item.name}</Text>
          </Pressable>
        ))}
      </View>}
      <ColorPicker value={current} label={title} onChange={pick} />
      <View style={local.actions}>
        {onRemove ? <DioButton variant="danger" label="이 색 지우기" text="지우기" onPress={onRemove} /> : <View />}
        <DioButton variant="filled" label="완료" onPress={() => onDone(tape ? `custom:${bg}:${fg}` : bg)} />
      </View>
    </PopoverMenu>
  );
}

const local = StyleSheet.create({
  bubble: { ...bubble, gap: 14, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  preview: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  previewInner: { position: 'absolute', right: 4, bottom: 4, width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  slots: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  slot: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  slotOn: { backgroundColor: colors.surface },
  slotDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  slotText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  slotTextOn: { color: colors.text },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
});
