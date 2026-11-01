import DioButton from '../../shared/DioButton';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 보안 설정: 앱 잠금 켬 · 끔, 켜져 있으면 비밀번호 바꾸기 줄. 비밀번호 입력은 내 공간이 전체 화면(PinScreen)으로 연다.
 * locked: 잠금이 켜져 있는지(null 이면 아직 읽는 중), onTurnOn · onTurnOff · onChange: 각 흐름을 연다.
 */
export default function AppLockSetting({ locked, onTurnOn, onTurnOff, onChange, compact = false }) {
  return (
    <SettingSection title="보안" compact={compact}>
      <SettingRow label="앱 잠금" options={ON_OFF} value={locked ? 'on' : 'off'}
        onChange={id => { if (locked === null) return; if (id === 'on' && !locked) onTurnOn(); if (id === 'off' && locked) onTurnOff(); }} />
      {locked && (
        <SettingRow label="비밀번호">
          <DioButton variant="tonal" label="앱 잠금 비밀번호 바꾸기" text="바꾸기" onPress={onChange} />
        </SettingRow>
      )}
    </SettingSection>
  );
}
