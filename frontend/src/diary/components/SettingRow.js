import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';

/**
 * 내 공간 설정 목록의 제목(18/800). 아래에 SettingRow 를 잇는다.
 * on · onToggle 을 주면 제목 오른쪽 끝에 묶음 전체를 켜고 끄는 스위치를 둔다(예: 알림 자체를 받을지).
 */
export function SettingTitle({ children, on, onToggle }) {
  if (!onToggle) return <Text accessibilityRole="header" style={local.title}>{children}</Text>;
  return (
    <View style={local.titleRow}>
      <Text accessibilityRole="header" style={[local.title, local.titleFlex]}>{children}</Text>
      <Switch label={`${children} 받기`} on={on} onToggle={onToggle} />
    </View>
  );
}

function Switch({ label, on, onToggle }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: on }}
      onPress={() => onToggle(!on)} hitSlop={8} style={[local.switch, on && local.switchOn]}>
      <View style={[local.knob, on && local.knobOn, on && local.knobMove]} />
    </Pressable>
  );
}

/** 켬 · 끔 값. 이 값을 주면 2분절 대신 스위치를 그린다 */
export const ON_OFF = [{ id: 'on', label: '켬' }, { id: 'off', label: '끔' }];

/**
 * 설정 한 줄(60, 앱 정보 행과 같은 높이 · 같은 아래 구분선): 왼쪽 이름, 오른쪽에 스위치(ON_OFF) · 테두리 칩 선택(options) · children.
 * options: [{ id, label }], value: 고른 id, onChange(id). 눌림 효과는 없다(B안: 상태는 면 · 테두리 · 손잡이 자리로만 보인다).
 */
export default function SettingRow({ label, options, value, onChange, children }) {
  const toggle = options === ON_OFF;
  // 이름은 왼쪽, 조작(스위치 · 칩 · 드롭다운 · 버튼)은 오른쪽 끝: 프로필 버튼 · 앱 정보 화살표와 같은 오른쪽 선에 맞춘다(라벨 열 240 고정은 실기기에서 오른쪽 선이 들쭉날쭉했다)
  return (
    <View style={local.row}>
      <Text style={local.label}>{label}</Text>
      {toggle ? (
        <Switch label={label} on={value === 'on'} onToggle={next => onChange(next ? 'on' : 'off')} />
      ) : options ? (
        <View style={local.chips} accessibilityRole="radiogroup" accessibilityLabel={label}>
          {options.map(option => {
            const selected = value === option.id;
            return (
              <Pressable key={option.id} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: selected }}
                onPress={() => onChange(option.id)}
                style={[local.chip, selected && local.chipSelected]}>
                <Text style={[local.chipText, selected && local.chipTextSelected]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : children}
    </View>
  );
}

const local = StyleSheet.create({
  title: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  titleRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 4 },
  titleFlex: { flex: 1, marginBottom: 0 },
  // 앱 정보 목록의 행과 같게: 행(60) 바로 아래에 구분선. 이름과 오른쪽 조작은 높이 가운데에 맞춘다
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  label: { flex: 1, minWidth: 80, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.text, textAlignVertical: 'center' },
  // 스위치 52×32(터치는 hitSlop 으로 48 이상): 끔은 옅은 판 + 왼쪽 손잡이, 켬은 primaryStrong + 오른쪽 손잡이
  switch: { width: 52, height: 32, borderRadius: 16, padding: 4, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder }, // 끔: #F0F1F9 면 + #D9DCEF 테두리(코덱스 6 · 7번)
  switchOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.secondary },
  knobOn: { backgroundColor: colors.surface },
  knobMove: { alignSelf: 'flex-end' },
  // 테두리 칩(B안): 흰 면 + cardBorder 테두리, 고르면 primaryStrong 테두리 · text 글자
  chips: { flexDirection: 'row', gap: 6 },
  chip: { minHeight: 44, minWidth: 84, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.primaryStrong },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
  chipTextSelected: { color: colors.text, fontWeight: '800' },
});
