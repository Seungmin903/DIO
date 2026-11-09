import { StyleSheet, Text } from 'react-native';
import DioButton from '../../shared/DioButton';
import { colors } from '../../shared/theme';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

/**
 * 내 공간 보안 설정: 앱 잠금 켬 · 끔, 켜져 있으면 비밀번호 바꾸기 줄. 비밀번호 입력은 내 공간이 전체 화면(PinScreen)으로 연다.
 * locked: 잠금이 켜져 있는지(null이면 확인 중 또는 조회 실패).
 */
export default function AppLockSetting({ locked, readFailed = false, onRetry, onTurnOn, onTurnOff, onChange, compact = false, canEnable = true }) {
  return (
    <SettingSection title="보안" compact={compact}>
      {locked === null ? (
        <SettingRow label="앱 잠금">
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {readFailed ? '확인하지 못했어요' : '확인 중'}
          </Text>
          {readFailed && <DioButton label="앱 잠금 다시 확인" text="다시 확인" onPress={onRetry} />}
        </SettingRow>
      ) : (
        <SettingRow label="앱 잠금" options={ON_OFF} value={locked ? 'on' : 'off'}
          onChange={id => { if (id === 'on' && !locked && canEnable) onTurnOn(); if (id === 'off' && locked) onTurnOff(); }} />
      )}
      {locked && canEnable && (
        <SettingRow label="비밀번호">
          <DioButton variant="tonal" label="앱 잠금 비밀번호 바꾸기" text="바꾸기" onPress={onChange} />
        </SettingRow>
      )}
    </SettingSection>
  );
}

const styles = StyleSheet.create({
  status: { flexShrink: 1, textAlign: 'right', color: colors.textMuted, fontSize: 13, lineHeight: 19 },
});
