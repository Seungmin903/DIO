import { StyleSheet, Text } from 'react-native';
import { colors } from '../../shared/theme';
import SettingRow, { SettingSection } from './SettingRow';

// 이 설정은 아직 실제 발송에 연결되지 않아 기존 기기 저장값을 적용 상태로 표시하지 않는다.
export default function NotificationSetting({ children }) {
  return (
    <SettingSection title="알림">
      <SettingRow label="다이어리 초대"><Text style={styles.pending}>준비 중</Text></SettingRow>
      <SettingRow label="공유된 다이어리 소식"><Text style={styles.pending}>준비 중</Text></SettingRow>
      <SettingRow label="매일 기록 알림"><Text style={styles.pending}>준비 중</Text></SettingRow>
      {children}
    </SettingSection>
  );
}

const styles = StyleSheet.create({ pending: { color: colors.textMuted, fontSize: 13 } });
