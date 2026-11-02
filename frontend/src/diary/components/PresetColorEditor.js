import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ColorPicker from '../../editor/components/controls/ColorPicker';
import EyedropperOverlay from '../../editor/components/controls/EyedropperOverlay';
import EyedropperIcon from '../../editor/components/controls/EyedropperIcon';
import { tapeColors } from '../../editor/hooks/usePalettes';
import { eyedropperMode, openBrowserEyedropper } from '../../editor/utils/eyedropper';
import { bubble, colors, DISABLED_OPACITY } from '../../shared/theme';
import PopoverMenu from './PopoverMenu';

const WIDTH = 340;

/**
 * 색 하나를 고르는 창(말풍선). 누른 견본 옆(아래, 자리가 없으면 위)에 뜬다. 꾸미기 공방 프리셋 · 내 색상과 편집기 옵션의 내 색상 + 가 같이 쓴다.
 * 완료 버튼은 두지 않는다: 바깥을 누르거나 뒤로 가기로 닫으면 마지막에 고른 색으로 onDone 한다(사용자 결정 2026-11-02). 회전으로 닫히면 바꾸지 않는다.
 * tape 이면 바탕색 · 무늬색을 골라 바꾼다(결과는 'custom:#바탕:#무늬'). slots(예: ['위 색', '아래 색'])를 주면 value · 결과가 색 배열이다(그라데이션). 나머지는 '#RRGGBB' 하나.
 * anchor: 견본의 창 안 자리, value: 처음 값, original: 원래(기본) 색 — '원래대로'가 이 색으로 되돌린다, onDone(value), onClose()
 * onChange(value): 고르는 동안 바로 적용할 때(편집기 펜 · 글자 색). onRemove: 있으면 오른쪽에 '지우기'(내 색상).
 * original 이 null 이면(새 색 추가) '원래대로'가 없고, 닫을 때 늘 그 색을 넣는다.
 * 스포이드: 앱은 창을 잠깐 숨기고 화면에서 손가락을 대고 끈 자리의 색을, 웹은 브라우저 스포이드(지원할 때만)로 고른다.
 */
export default function PresetColorEditor({ title, tape = false, slots = null, anchor = null, value, original = value, onDone, onClose, onChange, onRemove = null }) {
  // 여러 색을 한 창에서 고르는 칸: 테이프(바탕 · 무늬) · 그라데이션(위 · 아래)
  const names = tape ? ['바탕색', '무늬색'] : slots;
  const toList = v => (tape ? (({ bg, fg }) => [bg, fg])(tapeColors(v)) : slots ? [...v] : [v]);
  const fromList = list => (tape ? `custom:${list[0]}:${list[1]}` : slots ? list : list[0]);
  const [colorsNow, setColors] = useState(() => toList(value));
  const [slot, setSlot] = useState(0);
  const [dropping, setDropping] = useState(false);
  const current = colorsNow[slot];
  const pick = hex => {
    const next = colorsNow.map((color, i) => (i === slot ? hex : color));
    setColors(next);
    onChange?.(fromList(next));
  };
  const base = original == null ? toList(value) : toList(original);
  const changed = colorsNow.some((color, i) => color !== base[i]);
  // 닫을 때 저장: 새 색(original null)은 늘 넣고, 고친 색은 바뀌었을 때만
  const close = () => { if (original == null || changed) onDone(fromList(colorsNow)); else onClose(); };
  const dropper = async () => {
    if (eyedropperMode === 'browser') { const hex = await openBrowserEyedropper(); if (hex) pick(hex); return; }
    setDropping(true);
  };
  // 스포이드: 창을 숨기고 덮개에서 손가락을 대고 끄는 동안 루페로 보여 주고, 떼면 그 색
  if (dropping) return <EyedropperOverlay original={current} onCancel={() => setDropping(false)} onPick={hex => { setDropping(false); pick(hex); }} />;
  // 말풍선 왼쪽 끝을 누른 견본 왼쪽에 맞춘다(PopoverMenu 는 기준의 오른쪽 끝에 맞추므로 기준 폭을 말풍선 폭으로 준다). 높이는 실제 크기에 맞춰 아래 자리를 먼저 쓴다
  return (
    <PopoverMenu open anchor={anchor ? { ...anchor, width: WIDTH } : null} width={WIDTH} height={names ? 400 : 340} label={title} style={local.bubble} onClose={close} onDismiss={onClose}>
      <View style={local.head}>
        <View style={[local.preview, { backgroundColor: colorsNow[0] }]}>{colorsNow[1] ? <View style={[local.previewInner, { backgroundColor: colorsNow[1] }]} /> : null}</View>
        <Text accessibilityRole="header" style={local.title} numberOfLines={1}>{title}</Text>
        {/* 머리 오른쪽: '원래대로'(새 색 추가에는 없음) · '지우기'(내 색상 고칠 때만). 스포이드 버튼과 같은 규격(사용자 2026-11-02: 아래 큰 버튼은 어색) */}
        {original != null && <Pressable accessibilityRole="button" accessibilityLabel="이 색 원래대로" accessibilityState={{ disabled: !changed }} disabled={!changed}
          onPress={() => { setColors(base); onChange?.(fromList(base)); }} style={[local.smallButton, !changed && local.smallOff]}>
          <Text style={local.smallText}>원래대로</Text>
        </Pressable>}
        {onRemove && <Pressable accessibilityRole="button" accessibilityLabel="이 색 지우기" onPress={onRemove} style={local.smallButton}>
          <Text style={local.smallText}>지우기</Text>
        </Pressable>}
      </View>
      {names && <View style={local.slots} accessibilityRole="radiogroup">
        {names.map((name, i) => (
          <Pressable key={name} accessibilityRole="radio" accessibilityLabel={`${name} 바꾸기`} accessibilityState={{ checked: slot === i }}
            onPress={() => setSlot(i)} style={[local.slot, slot === i && local.slotOn]}>
            <View style={[local.slotDot, { backgroundColor: colorsNow[i] }]} />
            <Text style={[local.slotText, slot === i && local.slotTextOn]}>{name}</Text>
          </Pressable>
        ))}
      </View>}
      {/* 스포이드: HEX 줄 끝의 회색 바탕 버튼(아이콘 + 글자). 머리 구석의 아이콘만으로는 누르는 기능인지 알기 어려웠다(사용자 2026-11-02) */}
      <ColorPicker value={current} label={names ? `${title} ${names[slot]}` : title} onChange={pick}
        trailing={eyedropperMode && <Pressable accessibilityRole="button" accessibilityLabel="스포이드로 화면에서 색 가져오기" hitSlop={{ top: 3, bottom: 3 }} onPress={dropper} style={local.dropper}>
          <EyedropperIcon size={18} color={colors.primaryText} />
          <Text style={local.dropperText}>스포이드</Text>
        </Pressable>} />
    </PopoverMenu>
  );
}

const local = StyleSheet.create({
  bubble: { ...bubble, gap: 14, padding: 20 },
  // 머리 한 줄: [지금 색 32] 10 [제목] (코덱스 2026-11-02, 색 창 통일)
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  preview: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  previewInner: { position: 'absolute', right: 4, bottom: 4, width: 10, height: 10, borderRadius: 5 },
  title: { flex: 1, fontSize: 17, fontWeight: '800', color: colors.text },
  // HEX 입력칸과 같은 높이 38
  // 스포이드는 회색 바탕 버튼(막대 ± 와 같은 면)으로 따로 둔다(사용자 2026-11-02)
  dropper: { height: 38, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 9, backgroundColor: colors.surfaceMuted },
  dropperText: { fontSize: 12.5, fontWeight: '700', color: colors.primaryText },
  // 머리 오른쪽 작은 버튼(원래대로 · 지우기): 스포이드와 같은 높이 · 둥글기 · 글자, 면은 예전 '원래대로'(DioButton ghost outline)처럼 투명 + primary 1px 테두리(사용자 2026-11-02)
  smallButton: { height: 38, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 9, borderWidth: 1, borderColor: colors.primary },
  smallOff: { opacity: DISABLED_OPACITY },
  smallText: { fontSize: 12.5, fontWeight: '700', color: colors.primaryText },
  slots: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  slot: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12 },
  slotOn: { backgroundColor: colors.surface },
  slotDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: colors.border },
  slotText: { fontSize: 14, fontWeight: '700', color: colors.primaryText },
  slotTextOn: { color: colors.text },
});

/** 색 창 제목: '{대상} 색' 하나로(코덱스 2026-11-02). '테두리 색상' → '테두리 색', '채우기' → '채우기 색' */
export function colorTitle(label) {
  const name = String(label ?? '').trim().replace(/색상$/, '색');
  return /색$/.test(name) ? name : `${name} 색`;
}

/**
 * 견본 · 줄을 누르면 그 자리 옆에 색 창을 띄우는 훅. open(ref, props) 로 열고, element 를 화면에 둔다.
 * props 는 PresetColorEditor 와 같다(title 은 colorTitle 로 맞춘다). 닫히면 onDone/onClose 뒤에 스스로 닫힌다.
 */
export function useColorWindow() {
  const [state, setState] = useState(null);
  const open = (ref, props) => ref?.current?.measureInWindow?.((x, y, width, height) => setState({ ...props, anchor: { x, y, width, height } }));
  const element = state && <PresetColorEditor {...state} title={colorTitle(state.title)}
    onDone={value => { state.onDone?.(value); setState(null); }}
    onClose={() => { state.onClose?.(); setState(null); }} />;
  return { open, element, isOpen: Boolean(state) };
}
