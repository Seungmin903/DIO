import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors, radius, DISABLED_OPACITY } from '../../shared/theme';
import BackButton from '../components/BackButton';
import Header from '../components/Header';
import { SettingTitle } from '../components/SettingRow';
import TermsConsentSection from '../components/TermsConsentSection';
import { SERVICE_SECTION_ENABLED } from '../../shared/featureFlags';
import { notificationsBlocked } from '../../notifications/notificationPermission';

export default function NotificationSettingsScreen({ compact = false, onClose, userId, accountService, backLabel = '마이페이지로 돌아가기'}) {
  const [termsReady, setTermsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [hasError, setHasError] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);
  const termsSave = useRef(null);
  const savePending = useRef(false);
  // OS 알림 권한: 이 화면에 들어올 때와 설정 앱에서 돌아올 때 다시 읽는다
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    let active = true;
    const read = () => notificationsBlocked().then(value => { if (active) setBlocked(value); });
    read();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') read(); });
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (Platform.OS !== 'android' || !(saving || termsSaving)) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => subscription.remove();
  }, [saving, termsSaving]);

  const retry = async () => {
    if (savePending.current || !termsReady || !termsSave.current) return;
    savePending.current = true;
    setSaving(true);
    setStatus('');
    try { await termsSave.current(); setStatus('동의 설정을 저장했어요.'); }
    catch { setStatus('동의 설정을 저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { savePending.current = false; setSaving(false); }
  };

  return (
    <ScrollView contentContainerStyle={[styles.scroll, compact && styles.phoneScroll]} showsVerticalScrollIndicator={false}>
      <Header title="알림 설정" compact={compact} left={<BackButton label={backLabel} disabled={saving || termsSaving} onPress={onClose} />} />
      <View style={styles.list}>
        {blocked && <>
          <View style={styles.blockedRow}>
            <Text style={styles.rowLabel}>알림이 꺼져 있어요</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="기기 설정에서 알림 켜기" onPress={() => Linking.openSettings()} hitSlop={4} style={styles.openSettings}>
              <Text style={styles.openSettingsText}>설정 열기</Text>
            </Pressable>
          </View>
          <View style={styles.divider} />
        </>}
        {SERVICE_SECTION_ENABLED && <>
          <SettingTitle>서비스 알림</SettingTitle>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>서비스 알림 받기</Text>
              <Text style={styles.description}>서비스 알림 설정을 준비하고 있어요.</Text>
            </View>
            <Text style={styles.description}>준비 중</Text>
          </View>
          <View style={styles.divider} />
        </>}
        {/* 구역 제목은 마이페이지와 같은 SettingTitle(14/700), 아래 행은 16/600 + 구분선: 제목이 행과 같은 굵기로 묻히지 않게 */}
        <SettingTitle>마케팅 정보 수신</SettingTitle>
        <TermsConsentSection auth={accountService} userId={userId} saveRef={termsSave} onReadyChange={setTermsReady} onSaveError={setHasError} onSavingChange={setTermsSaving} />
        {hasError && (
        <Pressable accessibilityRole="button" accessibilityLabel="동의 설정 다시 저장" accessibilityState={{ disabled: saving || termsSaving || !termsReady, busy: saving || termsSaving }}
          disabled={saving || termsSaving || !termsReady} onPress={retry} style={[styles.save, (saving || termsSaving || !termsReady) && styles.disabled]}>
          {saving && <ActivityIndicator color={colors.surface} />}
          <Text style={styles.saveText}>동의 설정 다시 저장</Text>
        </Pressable>
        )}
        {!!status && <Text accessibilityLiveRegion="polite" style={styles.status}>{status}</Text>}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, width: '100%', paddingHorizontal: 30, paddingTop: 38, paddingBottom: 44 },
  phoneScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  list: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  blockedRow: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  openSettings: { minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  openSettingsText: { color: colors.primaryText, fontSize: 13, fontWeight: '700' },
  rowCopy: { flex: 1, minWidth: 0, gap: 6 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  divider: { height: 1, marginVertical: 20, backgroundColor: colors.border },
  save: { minHeight: 52, marginTop: 24, borderRadius: radius.md, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  status: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  disabled: { opacity: DISABLED_OPACITY },
});
