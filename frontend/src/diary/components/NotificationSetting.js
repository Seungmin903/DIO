import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { bubble, colors } from '../../shared/theme';
import { REMINDER_TIMES, reminderTimeLabel, setNotificationSettings, useNotificationSettings } from '../../shared/notificationSettings';
import PopoverMenu from './PopoverMenu';
import SettingRow, { ON_OFF, SettingTitle } from './SettingRow';

const WIDTH = 180, ROW = 48;
const onOff = value => (value ? 'on' : 'off');

// 기록 알림 시각 드롭다운(속지 글꼴 드롭다운과 같은 모양): 칸 + ⌄, 누르면 아래에 목록 말풍선.
function TimeDropdown({ value, onChange }) {
  const button = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const [open, setOpen] = useState(false);
  const show = () => {
    const node = button.current;
    // 말풍선 오른쪽 끝을 칸 오른쪽에 맞춘다(PopoverMenu 는 기준의 오른쪽 끝에 맞춘다)
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setAnchor({ x, y, width, height }); setOpen(true); });
    else setOpen(true);
  };
  return (
    <View>
      <Pressable ref={button} collapsable={false} accessibilityRole="button" accessibilityLabel={`기록 알림 시각 ${reminderTimeLabel(value)}, 바꾸기`} accessibilityState={{ expanded: open }}
        onPress={show} style={local.field}>
        <Text style={local.value}>{reminderTimeLabel(value)}</Text>
        <View style={{ transform: [{ rotate: open ? '-90deg' : '90deg' }] }}><AppIcon name="chevron-right" size={18} color={colors.primaryText} /></View>
      </Pressable>
      <PopoverMenu open={open} anchor={anchor} width={WIDTH} height={REMINDER_TIMES.length * ROW + 12} label="기록 알림 시각 목록" style={local.menu} onClose={() => setOpen(false)}>
        {REMINDER_TIMES.map(time => {
          const on = time === value;
          return (
            <Pressable key={time} accessibilityRole="radio" accessibilityLabel={reminderTimeLabel(time)} accessibilityState={{ checked: on }}
              onPress={() => { onChange(time); setOpen(false); }} style={[local.row, on && local.rowOn]}>
              <Text style={local.rowText}>{reminderTimeLabel(time)}</Text>
              {on ? <AppIcon name="check" size={16} color={colors.primaryStrong} /> : null}
            </Pressable>
          );
        })}
      </PopoverMenu>
    </View>
  );
}

/**
 * 내 공간 알림 설정: 초대 · 친구 소식 · 매일 기록 알림(켜면 시각 줄이 생긴다). 기기에 저장된다(shared/notificationSettings).
 */
export default function NotificationSetting() {
  const settings = useNotificationSettings();
  return (
    <View>
      <SettingTitle on={settings.enabled} onToggle={enabled => setNotificationSettings({ enabled })}>알림</SettingTitle>
      {settings.enabled && <>
      <SettingRow label="다이어리 초대" options={ON_OFF} value={onOff(settings.invite)} onChange={id => setNotificationSettings({ invite: id === 'on' })} />
      <SettingRow label="함께 쓰는 다이어리 소식" options={ON_OFF} value={onOff(settings.activity)} onChange={id => setNotificationSettings({ activity: id === 'on' })} />
      <SettingRow label="매일 기록 알림" options={ON_OFF} value={onOff(settings.reminder)} onChange={id => setNotificationSettings({ reminder: id === 'on' })} />
      {settings.reminder && (
        <SettingRow label="기록 알림 시각">
          <TimeDropdown value={settings.reminderTime} onChange={reminderTime => setNotificationSettings({ reminderTime })} />
        </SettingRow>
      )}
      </>}
    </View>
  );
}

const local = StyleSheet.create({
  field: { minHeight: 48, minWidth: 140, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface },
  value: { fontSize: 15, fontWeight: '700', color: colors.text },
  menu: { ...bubble, padding: 6 },
  row: { minHeight: ROW, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 12 },
  rowOn: { backgroundColor: colors.primarySoft },
  rowText: { fontSize: 15, fontWeight: '700', color: colors.text },
});
