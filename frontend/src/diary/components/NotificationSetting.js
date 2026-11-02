import { REMINDER_TIMES, reminderTimeLabel, setNotificationSettings, useNotificationSettings } from '../../shared/notificationSettings';
import SettingDropdown from './SettingDropdown';
import SettingRow, { ON_OFF, SettingSection } from './SettingRow';

const onOff = value => (value ? 'on' : 'off');
const TIMES = REMINDER_TIMES.map(time => ({ id: time, label: reminderTimeLabel(time) }));

/**
 * 내 공간 알림 설정: 초대 · 친구 소식 · 매일 기록 알림(켜면 시각 줄이 생긴다). 기기에 저장된다(shared/notificationSettings).
 */
export default function NotificationSetting({ compact = false, children }) {
  const settings = useNotificationSettings();
  return (
    <SettingSection title="알림" on={settings.enabled} onToggle={enabled => setNotificationSettings({ enabled })} compact={compact}>
      {/* 알림을 끄면 세부 설정도 모두 꺼진 채로 보이고, 눌러서 바꿀 수 없다. 다시 켜면 끄기 직전 설정이 돌아온다 */}
      <SettingRow label="다이어리 초대" options={ON_OFF} value={onOff(settings.invite)} disabled={!settings.enabled} onChange={id => setNotificationSettings({ invite: id === 'on' })} />
      <SettingRow label="공유된 다이어리 소식" options={ON_OFF} value={onOff(settings.activity)} disabled={!settings.enabled} onChange={id => setNotificationSettings({ activity: id === 'on' })} />
      <SettingRow label="매일 기록 알림" options={ON_OFF} value={onOff(settings.reminder)} disabled={!settings.enabled} onChange={id => setNotificationSettings({ reminder: id === 'on' })} />
      {settings.reminder && (
        <SettingDropdown label="기록 알림 시각" options={TIMES} value={settings.reminderTime} onChange={reminderTime => setNotificationSettings({ reminderTime })} />
      )}
      {children}
    </SettingSection>
  );
}
