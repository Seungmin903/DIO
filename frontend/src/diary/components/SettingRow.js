import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, DISABLED_OPACITY } from '../../shared/theme';

/**
 * 내 공간 설정 목록의 제목(18/800). 아래에 SettingRow 를 잇는다.
 * on · onToggle 을 주면 제목 오른쪽 끝에 묶음 전체를 켜고 끄는 스위치를 둔다(예: 알림 자체를 받을지).
 */
export function SettingTitle({ children, on, onToggle }) {
  if (!onToggle) return <Text accessibilityRole="header" style={local.title}>{children}</Text>;
  return (
    <View style={local.titleRow}>
      <Text accessibilityRole="header" style={[local.title, local.titleFlex]}>{children}</Text>
      <SettingSwitch label={`${children} 받기`} on={on} onToggle={onToggle} />
    </View>
  );
}

/**
 * 설정 묶음(앱 디자인 점검 원 페이저 12, 2026-11-01): 흰 카드 대신 화면 바탕 위에 구역(SettingSection)을 바로 쌓는다. 면 · 테두리 · 그림자 없음.
 * 구역은 제목(14/700)과 위 여백으로 나누고, 선은 행 아래 구분선(cardBorder)만 쓴다.
 */
export function SettingCard({ compact = false, children }) {
  return (
    <View style={[local.card, compact && local.cardCompact]}>
      <View style={local.cardInner}>{children}</View>
    </View>
  );
}

/**
 * 묶음 안의 구역: 제목(14/700)과 본문 행들. 구역 사이는 여백 24(위 8 + 제목 위 16).
 * on · onToggle 은 SettingTitle 과 같다(제목 줄의 마스터 스위치). compact 는 받기만 한다(폰 · 태블릿이 같은 모양).
 */
export function SettingSection({ title, on, onToggle, children }) {
  return (
    <View style={local.section}>
      <SettingTitle on={on} onToggle={onToggle}>{title}</SettingTitle>
      <View style={local.sectionBody}>{children}</View>
    </View>
  );
}

export function SettingSwitch({ label, on, onToggle, disabled = false, busy = false, accessibilityHint }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityHint={accessibilityHint} accessibilityState={{ checked: on, disabled, busy }} disabled={disabled}
      onPress={() => onToggle(!on)} hitSlop={8} style={[local.switch, on && local.switchOn, disabled && local.disabled]}>
      <View style={[local.knob, on && local.knobOn, on && local.knobMove]} />
    </Pressable>
  );
}

/** 켬 · 끔 값. 이 값을 주면 2분절 대신 스위치를 그린다 */
export const ON_OFF = [{ id: 'on', label: '켬' }, { id: 'off', label: '끔' }];

/**
 * 설정 한 줄(60, 앱 정보 행과 같은 높이 · 같은 아래 구분선): 왼쪽 이름, 오른쪽에 스위치(ON_OFF) · 테두리 칩 선택(options) · children.
 * disabled: 값은 그대로 보이되 누를 수 없다(알림을 끈 동안의 세부 설정처럼).
 * options: [{ id, label }], value: 고른 id, onChange(id). 눌림 효과는 없다(B안: 상태는 면 · 테두리 · 손잡이 자리로만 보인다).
 */
export default function SettingRow({ label, options, value, onChange, disabled = false, onPress, accessibilityLabel, accessibilityState, children }) {
  const toggle = options === ON_OFF;
  // onPress: 행 전체가 하나의 버튼(값 고르기 행 SettingDropdown). 눌림 효과는 없다
  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={accessibilityState} onPress={onPress} style={local.row}>
        <Text style={local.label}>{label}</Text>
        {children}
      </Pressable>
    );
  }
  // 이름은 왼쪽, 조작(스위치 · 칩 · 드롭다운 · 버튼)은 오른쪽 끝: 프로필 버튼 · 앱 정보 화살표와 같은 오른쪽 선에 맞춘다(라벨 열 240 고정은 실기기에서 오른쪽 선이 들쭉날쭉했다)
  return (
    <View style={local.row}>
      <Text style={local.label}>{label}</Text>
      {toggle ? (
        <SettingSwitch label={label} on={value === 'on'} disabled={disabled} onToggle={next => onChange(next ? 'on' : 'off')} />
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
  card: {},
  cardCompact: {},
  cardInner: {},
  section: { paddingTop: 8 },
  sectionBody: {},
  title: { fontSize: 14, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 4 },
  titleRow: { minHeight: 48, marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 14 },
  titleFlex: { flex: 1, marginTop: 0, marginBottom: 0 },
  // 행 48 바로 아래에 구분선(원 페이저 12). 이름과 오른쪽 조작은 높이 가운데에 맞춘다
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.cardBorder }, // 위아래 12: 스위치(32) 줄과 같은 여백을 칩(44) · 버튼(48) 줄에도 둔다
  label: { flex: 1, minWidth: 80, fontSize: 16, lineHeight: 22, fontWeight: '600', color: colors.text, textAlignVertical: 'center' },
  // 스위치 52×32(터치는 hitSlop 으로 48 이상): 끔은 옅은 판 + 왼쪽 손잡이, 켬은 primary(#818AC3, 흰 면 위 3.3:1) + 오른쪽 손잡이(원 페이저 12)
  switch: { width: 52, height: 32, borderRadius: 16, padding: 4, justifyContent: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.cardBorder }, // 끔: #F0F1F9 면 + #D9DCEF 테두리(코덱스 6 · 7번)
  disabled: { opacity: DISABLED_OPACITY },
  switchOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.secondary },
  knobOn: { backgroundColor: colors.surface },
  knobMove: { alignSelf: 'flex-end' },
  // 테두리 칩(B안): 흰 면 + cardBorder 테두리, 고르면 primaryStrong 테두리 · text 글자
  chips: { flexDirection: 'row', gap: 6 },
  chip: { minHeight: 48, minWidth: 84, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: colors.cardBorder, backgroundColor: colors.surface },
  chipSelected: { borderColor: colors.primaryStrong },
  chipText: { fontSize: 14, fontWeight: '600', color: colors.primaryText },
  chipTextSelected: { color: colors.text, fontWeight: '800' },
});
