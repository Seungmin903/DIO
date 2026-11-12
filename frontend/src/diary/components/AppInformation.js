import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import AppIcon from '../../shared/AppIcon';
import DioButton from '../../shared/DioButton';
import { notify } from '../../shared/dialogs';
import { C } from '../constants';
import { signupDocuments } from '../../shared/legalDocuments';
import { getSignupDocument } from '../../shared/legalContent';
import LegalDocumentScreen from '../../auth/LegalDocumentScreen';
import { colors } from '../../shared/theme';
import ContentLicenses from './ContentLicenses';
import { SettingSection } from './SettingRow';

// 배포 공개 주소가 있으면 브라우저로 열고, 없으면 가입 화면과 같은 내장 처리방침을 앱 안에서 연다
// (예전 대체 주소는 로그인이 필요한 구글 문서라 구글 계정 선택 창이 떴다).
const PRIVACY_POLICY_URL = signupDocuments.policy;
const SUPPORT_EMAIL = 'dioapp.official@gmail.com';
const APP_VERSION = '1.0.0'; // app.json 의 version 과 같다
const COPY_ERROR = '복사하지 못했어요. 이메일 주소를 길게 눌러 복사해 주세요.';

export default function AppInformation({ onCopyNotice }) {
  const [copyError, setCopyError] = useState(false);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const copyAttempt = useRef(0);
  useEffect(() => () => { copyAttempt.current++; }, []);

  const openPrivacyPolicy = async () => {
    if (!PRIVACY_POLICY_URL) { setPolicyOpen(true); return; }
    try {
      await Linking.openURL(PRIVACY_POLICY_URL);
    } catch {
      notify('처리방침을 열지 못했어요', '브라우저와 인터넷 연결을 확인한 뒤 다시 시도해 주세요.');
    }
  };

  const copyEmail = async () => {
    const attempt = ++copyAttempt.current;
    setCopyError(false);
    onCopyNotice?.(null);
    let copied;
    try {
      copied = await Clipboard.setStringAsync(SUPPORT_EMAIL);
    } catch {
      copied = false;
    }
    if (attempt !== copyAttempt.current) return;
    if (copied === false) setCopyError(true);
    else onCopyNotice?.('이메일 주소를 복사했어요.');
  };

  return (
    <SettingSection title="앱 정보">
      {/* 앱 버전: 이동하는 행이 아니라 화살표 없이 오른쪽 값만 둔다(지원 문의 때 가장 먼저 확인하는 정보라 첫 행) */}
      <View style={styles.version}>
        <Text style={styles.label}>앱 버전</Text>
        <Text style={styles.versionValue}>{APP_VERSION}</Text>
      </View>
      <Pressable accessibilityRole="link" accessibilityLabel="개인정보 처리방침 보기" onPress={openPrivacyPolicy}
        style={styles.policy}>
        <View style={styles.copy}>
          <Text style={styles.label}>개인정보 처리방침</Text>
        </View>
        <AppIcon name="chevron-right" size={18} forText={16} color={C.muted} />
      </Pressable>
      <View style={styles.contact}>
        <View style={styles.copy}>
          <Text style={styles.label}>문의 이메일</Text>
          <Text selectable style={styles.email}>{SUPPORT_EMAIL}</Text>
        </View>
        <DioButton variant="tonal" label="문의 이메일 주소 복사" text="복사" onPress={copyEmail} />
      </View>
      {copyError && <Text accessibilityLiveRegion="polite" role="status" style={styles.copyError}>{COPY_ERROR}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel="오픈소스 및 콘텐츠 라이선스" onPress={() => setLicensesOpen(true)}
        style={styles.licenses}>
        <Text style={[styles.label, { flex: 1 }]}>오픈소스 및 콘텐츠 라이선스</Text>
        <AppIcon name="chevron-right" size={18} forText={16} color={C.muted} />
      </Pressable>
      {policyOpen && <LegalDocumentScreen document={getSignupDocument('policy')} onClose={() => setPolicyOpen(false)} />}
      {/* 열 때만 마운트한다: 닫힌 채로 두면 설정 화면에 들어올 때마다 라이선스 목록(안드로이드 약 300개)을 정렬해 설정이 버벅였다 */}
      {licensesOpen && <ContentLicenses visible onClose={() => setLicensesOpen(false)} />}
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
  copyError: { marginBottom: 8, color: colors.dangerStrong, fontSize: 13, lineHeight: 20 },
});
