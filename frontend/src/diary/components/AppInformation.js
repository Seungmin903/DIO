import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AppIcon from '../../shared/AppIcon';
import DioButton from '../../shared/DioButton';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import { signupDocuments } from '../../shared/legalDocuments';
import { colors } from '../../shared/theme';
import ContentLicenses from './ContentLicenses';
import { SettingSection } from './SettingRow';

// Use the same final policy as the bundled signup reader unless deployment supplies its public URL.
const PRIVACY_POLICY_URL = signupDocuments.policy || 'https://docs.google.com/document/d/1_eH0yCPmTWtclIvkExkjYwyxCmf5FhPtAN02LIax7uI/edit?usp=drivesdk';
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

// 카드로 감싸지 않는다: 구역(SettingSection) 안의 구분선으로 나눈 조용한 목록. 행은 다른 설정 줄(SettingRow)과 같은 48 · 위아래 8 · 이름 16/600 · cardBorder 구분선(2026-11-08 사용자 결정, 이메일 두 줄은 내용만큼).
const styles = StyleSheet.create({
  version: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  versionValue: { color: colors.primaryStrong, fontSize: 15, fontWeight: '600' },
  policy: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  licenses: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 16, borderTopWidth: 1, borderTopColor: colors.cardBorder },
  contact: { minHeight: 48, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 16, paddingVertical: 8 },
  copy: { flex: 1, minWidth: 180, gap: 2 },
  label: { color: C.ink, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 13 },
  email: { color: colors.primaryText, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  status: { marginTop: 10, color: C.inkSoft, fontSize: 13, lineHeight: 20 },
});
