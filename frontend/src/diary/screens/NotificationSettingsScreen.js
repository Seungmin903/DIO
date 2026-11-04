import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AppIcon from '../../shared/AppIcon';
import { colors, radius, DISABLED_OPACITY } from '../../shared/theme';
import Header from '../components/Header';
import TermsConsentSection from '../components/TermsConsentSection';
import { SERVICE_SECTION_ENABLED } from '../../shared/featureFlags';

export default function NotificationSettingsScreen({ compact = false, onClose, userId, accountService }) {
  const [termsReady, setTermsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [hasError, setHasError] = useState(false);
  const [termsSaving, setTermsSaving] = useState(false);
  const termsSave = useRef(null);
  const savePending = useRef(false);
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
      <Header title="알림 설정" compact={compact} left={(
        <Pressable accessibilityRole="button" accessibilityLabel="마이페이지로 돌아가기" accessibilityState={{ disabled: saving || termsSaving }} disabled={saving || termsSaving} onPress={onClose} style={[styles.headerBack, compact && styles.headerBackCompact]}>
          <AppIcon name="chevron-left" size={22} color={colors.text} />
        </Pressable>
      )} />
      <View style={[styles.card, compact && styles.phoneCard]}>
        {SERVICE_SECTION_ENABLED && <>
          <Text style={styles.section}>서비스 알림</Text>
          <View style={styles.row}>
            <View style={styles.rowCopy}>
              <Text style={styles.rowLabel}>서비스 알림 받기</Text>
              <Text style={styles.description}>서비스 알림 설정을 준비하고 있어요.</Text>
            </View>
            <Text style={styles.description}>준비 중</Text>
          </View>
          <View style={styles.divider} />
        </>}
        <Text style={styles.section}>마케팅 정보 수신</Text>
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
  headerBack: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  headerBackCompact: { borderRadius: 10, borderWidth: 0, backgroundColor: 'transparent' },
  card: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 28, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl },
  phoneCard: { padding: 20, borderRadius: radius.lg },
  section: { color: colors.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 16 },
  rowCopy: { flex: 1, minWidth: 0, gap: 6 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  divider: { height: 1, marginVertical: 20, backgroundColor: colors.border },
  save: { minHeight: 52, marginTop: 24, borderRadius: radius.md, backgroundColor: colors.primaryStrong, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { color: colors.surface, fontSize: 15, fontWeight: '700' },
  status: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  disabled: { opacity: DISABLED_OPACITY },
});
