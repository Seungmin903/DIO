import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AppIcon from '../../shared/AppIcon';
import DioButton from '../../shared/DioButton';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import { colors } from '../../shared/theme';
import ContentLicenses from './ContentLicenses';
import { SettingSection } from './SettingRow';

const PRIVACY_POLICY_URL = 'https://docs.google.com/document/d/1JxZvkpKiEl7GXpVThQYxck0l_bwzg33FxGShE6rpqd0/edit?usp=sharing';
const SUPPORT_EMAIL = 'dioapp.official@gmail.com';
const APP_VERSION = '1.0.0'; // app.json 의 version 과 같다

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
    <SettingSection title="앱 정보">
      {/* 앱 버전: 이동하는 행이 아니라 화살표 없이 오른쪽 값만 둔다(지원 문의 때 가장 먼저 확인하는 정보라 첫 행) */}
      <View style={styles.version}>
        <Text style={styles.label}>앱 버전</Text>
        <Text style={styles.versionValue}>{APP_VERSION}</Text>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="개인정보 처리방침, 브라우저로 열기" onPress={openPrivacyPolicy}
        style={styles.policy}>
        <View style={styles.copy}>
          <Text style={styles.label}>개인정보 처리방침</Text>
        </View>
        <AppIcon name="chevron-right" size={18} forText={15} color={C.muted} />
      </Pressable>
      <View style={styles.contact}>
        <View style={styles.copy}>
          <Text style={styles.label}>문의 이메일</Text>
          <Text selectable style={styles.email}>{SUPPORT_EMAIL}</Text>
        </View>
        <DioButton variant="tonal" label="문의 이메일 주소 복사" text="복사" onPress={copyEmail} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="오픈소스 및 콘텐츠 라이선스" onPress={() => setLicensesOpen(true)}
        style={styles.licenses}>
        <Text style={[styles.label, { flex: 1 }]}>오픈소스 및 콘텐츠 라이선스</Text>
        <AppIcon name="chevron-right" size={18} forText={15} color={C.muted} />
      </Pressable>
      <ContentLicenses visible={licensesOpen} onClose={() => setLicensesOpen(false)} />
      {!!copyMessage && <Text accessibilityLiveRegion="polite" role="status" style={styles.status}>{copyMessage}</Text>}
    </SettingSection>
  );
}

// 카드로 감싸지 않는다: 구역(SettingSection) 안의 구분선으로 나눈 조용한 목록(행 64, 이메일 행 72).
const styles = StyleSheet.create({
  version: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  versionValue: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  policy: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  licenses: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 1, borderTopColor: colors.border },
  contact: { minHeight: 72, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, paddingVertical: 10 },
  copy: { flex: 1, minWidth: 180, gap: 2 },
  label: { color: C.ink, fontSize: 15, fontWeight: '700' },
  hint: { color: C.muted, fontSize: 13 },
  email: { color: colors.primaryText, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  status: { marginTop: 10, color: C.inkSoft, fontSize: 13, lineHeight: 20 },
});
