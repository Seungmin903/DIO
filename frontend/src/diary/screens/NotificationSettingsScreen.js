import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppIcon from '../../shared/AppIcon';
import { colors, radius } from '../../shared/theme';
import Header from '../components/Header';
import { SettingSwitch } from '../components/SettingRow';
import TermsConsentSection from '../components/TermsConsentSection';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '../services/notificationPreferences';

export default function NotificationSettingsScreen({ compact = false, onClose, userId, accountService }) {
  const [settings, setSettings] = useState(DEFAULT_NOTIFICATION_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [termsReady, setTermsReady] = useState(false);
  const termsSave = useRef(null);
  const savePending = useRef(false);

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setStatus('');
    loadNotificationPreferences(AsyncStorage, userId)
      .then(({ settings: saved, error }) => {
        if (!active) return;
        setSettings(saved);
        if (error) setStatus(error);
      })
      .finally(() => active && setLoaded(true));
    return () => { active = false; };
  }, [userId]);

  const set = (key, value) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
    setStatus('');
  };
  const save = async () => {
    if (savePending.current || !loaded) return;
    savePending.current = true;
    setSaving(true);
    setStatus('');
    try {
      const saveTerms = termsReady ? termsSave.current : null;
      const [local, terms] = await Promise.allSettled([
        saveNotificationPreferences(AsyncStorage, userId, settings),
        saveTerms ? Promise.resolve().then(() => saveTerms()) : Promise.resolve(),
      ]);
      if (local.status === 'rejected') {
        setStatus(saveTerms && terms.status === 'fulfilled'
          ? '선택 동의는 저장했지만 서비스 알림을 저장하지 못했어요. 다시 시도해 주세요.'
          : '서비스 알림을 저장하지 못했어요. 다시 시도해 주세요.');
      } else if (!saveTerms) {
        setStatus('서비스 알림을 저장했어요. 선택 동의는 상태 조회 후 저장해 주세요.');
      } else if (terms.status === 'rejected') {
        setStatus('서비스 알림은 저장했어요. 선택 동의는 오류를 확인하고 다시 저장해 주세요.');
      } else {
        setStatus('알림 설정을 저장했어요.');
      }
    } finally {
      savePending.current = false;
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
          disabled={!loaded || saving}
          onChange={(value) => set('service', value)}
        />
        <View style={styles.divider} />
        <Text style={styles.section}>마케팅 정보 수신</Text>
        <TermsConsentSection auth={accountService} userId={userId} saveRef={termsSave} onReadyChange={setTermsReady} />
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
      <SettingSwitch label={label} on={value} disabled={disabled} onToggle={onChange} />
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
  save: { minHeight: 52, marginTop: 24, borderRadius: radius.md, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  status: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
});
