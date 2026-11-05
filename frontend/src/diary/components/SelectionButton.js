import { Pressable, Text } from 'react-native';
import { C } from '../constants';
import { styles as s } from '../styles';
import AppIcon from '../../shared/AppIcon';

// 선택 바의 버튼. tone 이 면과 글자색을 정한다.
//   plain   흰 면 + 윤곽(전체 선택 · 보조 동작)
//   primary 그 화면의 주 동작(휴지통으로 · 복원): primaryStrong 채움 + 흰 글자
//   danger  영구 삭제: 위험색은 글자 · 아이콘 · 윤곽에만 쓰고 채우지 않는다(채운 위험 버튼은 확인 창 한 곳)
// ghost(폰 띠의 `완료`): 면 · 윤곽 없이 글자만. 띠 윗줄 높이를 줄인다
// label 은 접근성 이름, text 는 보이는 글자다. 보이는 높이 48(폰 띠의 ghost 는 32 + hitSlop 8 로 48).
const TONES = {
  plain: { button: null, text: null, icon: C.ink },
  primary: { button: s.selectButtonPrimary, text: s.selectButtonTextPrimary, icon: C.white },
  danger: { button: s.selectButtonDanger, text: s.selectButtonTextDanger, icon: C.dangerStrong },
};

export default function SelectionButton({ label, text, icon, tone = 'plain', disabled = false, onPress, hint, compact = false, fill = false, ghost = false }) {
  const look = TONES[tone] ?? TONES.plain;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={ghost && compact ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
      onPress={onPress}
      style={[s.selectButton, compact && s.selectButtonBand, fill && s.selectButtonFill, ghost && compact && s.selectButtonGhost, look.button, disabled && s.selectButtonDisabled]}
    >
      {icon ? <AppIcon name={icon} size={16} forText={12} color={look.icon} /> : null}
      <Text style={[s.selectButtonText, compact && s.selectButtonTextBand, look.text]}>{text ?? label}</Text>
    </Pressable>
  );
}
