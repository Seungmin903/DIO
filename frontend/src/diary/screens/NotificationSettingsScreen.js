import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppIcon from '../../shared/AppIcon';
import { colors, radius } from '../../shared/theme';
import Header from '../components/Header';

const STORAGE_KEY = 'dio:preferences:notifications:v1';
const DEFAULTS = { service: true, marketing: false };

export default function NotificationSettingsScreen({ compact = false, onClose }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw);
        setSettings({
          service: typeof saved.service === 'boolean' ? saved.service : DEFAULTS.service,
          marketing: typeof saved.marketing === 'boolean' ? saved.marketing : DEFAULTS.marketing,
        });
      })
      .catch(() => active && setStatus('이 기기의 알림 설정을 불러오지 못했어요.'))
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, []);

  const set = (key, value) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setStatus('');
  };
  const save = async () => {
    if (saving) return;
    setSaving(true);
    setStatus('');
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      setStatus('알림 설정을 이 기기에 저장했어요.');
    } catch {
      setStatus('알림 설정을 저장하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.scroll, compact && styles.phoneScroll]} showsVerticalScrollIndicator={false}>
      <Header
        title="알림 설정"
        compact={compact}
        left={(
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="마이페이지로 돌아가기"
            onPress={onClose}
            style={({ pressed }) => [styles.headerBack, compact && styles.headerBackCompact, pressed && styles.pressed]}
          >
            <AppIcon name="chevron-left" size={22} color={colors.text} />
          </Pressable>
        )}
      />
      <View style={[styles.card, compact && styles.phoneCard]}>
        <Text style={styles.section}>서비스 알림</Text>
        <SettingRow
          label="서비스 알림 받기"
          description="계정, 보안, 공유 다이어리 관련 안내를 알려드려요."
          value={settings.service}
          disabled={!loaded}
          onChange={(value) => set('service', value)}
        />
        <View style={styles.divider} />
        <Text style={styles.section}>마케팅 정보 수신</Text>
        <SettingRow
          label="마케팅 정보 받기"
          description="새 기능과 이벤트 소식을 알려드려요."
          value={settings.marketing}
          disabled={!loaded}
          onChange={(value) => set('marketing', value)}
        />
        <Text style={styles.note}>현재 설정은 이 기기에만 저장돼요.</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="알림 설정 저장"
          accessibilityState={{ disabled: saving || !loaded, busy: saving }}
          disabled={saving || !loaded}
          onPress={save}
          style={({ pressed }) => [styles.save, (saving || !loaded) && styles.disabled, pressed && styles.pressed]}
        >
          {saving && <ActivityIndicator color={colors.surface} />}
          <Text style={styles.saveText}>저장</Text>
        </Pressable>
        {!!status && <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}
      </View>
    </ScrollView>
  );
}

function SettingRow({ label, description, value, disabled, onChange }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <Switch
        accessibilityLabel={label}
        accessibilityState={{ checked: value, disabled }}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceMuted, true: colors.primary }}
        thumbColor={colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, width: '100%', paddingHorizontal: 30, paddingTop: 38, paddingBottom: 44 },
  phoneScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  headerBack: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  headerBackCompact: { width: 38, height: 38, borderRadius: 10, borderWidth: 0, backgroundColor: 'transparent' },
  card: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl },
  phoneCard: { padding: 20, borderRadius: radius.lg },
  section: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  rowCopy: { flex: 1, minWidth: 0, gap: 6 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  divider: { height: 1, marginVertical: 20, backgroundColor: colors.border },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 12 },
  save: { minHeight: 52, marginTop: 24, borderRadius: radius.md, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  status: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
});
