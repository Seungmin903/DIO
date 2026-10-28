import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AppIcon from '../../shared/AppIcon';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import ContentLicenses from './ContentLicenses';

const PRIVACY_POLICY_URL = 'https://docs.google.com/document/d/1JxZvkpKiEl7GXpVThQYxck0l_bwzg33FxGShE6rpqd0/edit?usp=sharing';
const SUPPORT_EMAIL = 'dioapp.official@gmail.com';

export default function AppInformation() {
  const [copyMessage, setCopyMessage] = useState('');
  const [licensesOpen, setLicensesOpen] = useState(false);

  const openPrivacyPolicy = async () => {
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      notify('처리방침을 열지 못했어요', '브라우저와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    }
  };

  const copyEmail = async () => {
    try {
      const copied = await Clipboard.setStringAsync(SUPPORT_EMAIL);
      setCopyMessage(copied === false ? '복사하지 못했어요. 이메일 주소를 길게 눌러 복사해 주세요.' : '이메일 주소를 복사했어요.');
    } catch {
      setCopyMessage('복사하지 못했어요. 이메일 주소를 길게 눌러 복사해 주세요.');
    }
  };

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.title}>앱 정보</Text>
      <Pressable accessibilityRole="link" accessibilityLabel="개인정보 처리방침, 브라우저로 열기" onPress={openPrivacyPolicy}
        style={({ pressed }) => [styles.policy, pressed && styles.pressed]}>
        <View style={styles.copy}>
          <Text style={styles.label}>개인정보 처리방침</Text>
        </View>
        <AppIcon name="chevron-right" size={18} color={C.muted} />
      </Pressable>
      <View style={styles.contact}>
        <View style={styles.copy}>
          <Text style={styles.label}>문의 이메일</Text>
          <Text selectable style={styles.email}>{SUPPORT_EMAIL}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="문의 이메일 주소 복사" onPress={copyEmail}
          style={({ pressed }) => [styles.copyButton, pressed && styles.pressed]}>
          <Text style={styles.copyLabel}>복사</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="오픈소스 및 콘텐츠 라이선스" onPress={() => setLicensesOpen(true)}
        style={({ pressed }) => [styles.licenses, pressed && styles.pressed]}>
        <Text style={[styles.label, { flex: 1 }]}>오픈소스 및 콘텐츠 라이선스</Text>
        <AppIcon name="chevron-right" size={18} color={C.muted} />
      </Pressable>
      <ContentLicenses visible={licensesOpen} onClose={() => setLicensesOpen(false)} />
      {!!copyMessage && <Text accessibilityLiveRegion="polite" role="status" style={styles.status}>{copyMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 20, padding: 25, borderRadius: 20, backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  title: { color: C.ink, fontSize: 18, fontWeight: '800', marginBottom: 8 },
  policy: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.line },
  licenses: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: C.line },
  contact: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, paddingTop: 18 },
  copy: { flex: 1, minWidth: 180, gap: 6 },
  label: { color: C.ink, fontSize: 15, fontWeight: '700' },
  hint: { color: C.muted, fontSize: 13 },
  email: { color: C.inkSoft, fontSize: 14, lineHeight: 21 },
  copyButton: { minWidth: 64, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, borderRadius: 12, backgroundColor: C.pale },
  copyLabel: { color: C.ink, fontSize: 14, fontWeight: '700' },
  status: { marginTop: 14, color: C.inkSoft, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.65 },
});
