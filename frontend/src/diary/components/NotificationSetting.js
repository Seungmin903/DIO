import { StyleSheet, Text } from 'react-native';
import { colors } from '../../shared/theme';
import SettingRow, { SettingSection } from './SettingRow';
import { DEVICE_TOGGLES_ENABLED } from '../../shared/featureFlags';

// 서버 알림 설정 진입 행(children)만 남는다. 진입 행이 없는 게스트에게는 구역을 그리지 않는다.
export default function NotificationSetting({ children }) {
  if (!DEVICE_TOGGLES_ENABLED && !children) return null;
  return (
    <SettingSection title="알림">
      {DEVICE_TOGGLES_ENABLED && <>
        <SettingRow label="다이어리 초대"><Text style={styles.pending}>준비 중</Text></SettingRow>
        <SettingRow label="공유된 다이어리 소식"><Text style={styles.pending}>준비 중</Text></SettingRow>
        <SettingRow label="매일 기록 알림"><Text style={styles.pending}>준비 중</Text></SettingRow>
      </>}
      {children}
    </SettingSection>
  );
}

const styles = StyleSheet.create({ pending: { color: colors.textMuted, fontSize: 13 } });
