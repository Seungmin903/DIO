import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View, Pressable } from 'react-native';
import { fetch as memberFetch } from 'expo/fetch';
import { apiBaseUrl, accessTokenHeader } from '../../auth/authService';
import { createTermsConsentApi, createTermsConsentRuntime, optionalTerms } from '../../auth/termsConsent';
import { signupDocuments } from '../../shared/legalDocuments';
import { getSignupDocument } from '../../shared/legalContent';
import LegalDocumentScreen from '../../auth/LegalDocumentScreen';
import { createAuthenticatedMemberTransport } from '../services/memberTransport';
import { SettingSwitch } from './SettingRow';
import { colors } from '../../shared/theme';

export default function TermsConsentSection({ auth, userId, saveRef, onReadyChange, onSaveError, onSavingChange }) {
  const [rows, setRows] = useState({});
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [documentError, setDocumentError] = useState('');
  const [readingId, setReadingId] = useState(null);
  const current = useRef(null);
  const confirmed = useRef({});
  const draft = useRef({});
  const saving = useRef(null);
  const [submitting, setSubmitting] = useState(false);
  const sessionKey = auth?.getSessionKey?.();
  useEffect(() => {
    setRows({}); confirmed.current = {}; draft.current = {}; onReadyChange?.(false);
    setProblem(''); setDocumentError(''); setLoading(true);
    let runtime;
    try {
      runtime = createTermsConsentRuntime({ auth, accountId: userId, api: createTermsConsentApi(
        createAuthenticatedMemberTransport({ auth, accountId: userId, baseUrl: apiBaseUrl, accessTokenHeader, fetchImpl: memberFetch })) });
      current.current = runtime;
      runtime.load()
        .then(items => {
          if (current.current !== runtime || auth.getSessionKey() !== sessionKey) return;
          confirmed.current = items; draft.current = items;
          setRows(items); onReadyChange?.(true);
        }).catch(() => {
          if (current.current === runtime) setProblem('동의 상태를 불러오지 못했어요. 다시 시도해 주세요.');
        }).finally(() => { if (current.current === runtime) setLoading(false); });
    } catch { setLoading(false); setProblem('로그인 상태를 확인한 뒤 다시 열어 주세요.'); }
    return () => { runtime?.dispose(); if (current.current === runtime) current.current = null; onSavingChange?.(false); onSaveError?.(false); };
  }, [auth, userId, sessionKey, attempt, onReadyChange]);

  useEffect(() => {
    if (!saveRef) return;
    const save = () => {
      if (saving.current) return saving.current;
      const runtime = current.current;
      if (!runtime || Object.keys(confirmed.current).length !== optionalTerms.length)
        return Promise.reject(new Error('동의 상태를 먼저 확인해 주세요.'));
      const changes = optionalTerms.filter(item => draft.current[item.termsType]?.agreed !== confirmed.current[item.termsType]?.agreed);
      setSubmitting(true); onSavingChange?.(true); onSaveError?.(false);
      const task = Promise.allSettled(changes.map(async item => {
        const type = item.termsType, agreed = draft.current[type].agreed;
        try {
          const result = await runtime.update(type, agreed);
          if (current.current !== runtime) throw new Error('로그인 상태가 바뀌었어요.');
          confirmed.current = { ...confirmed.current, [type]: result };
          draft.current = { ...draft.current, [type]: { ...result, error: '' } };
          setRows(previous => ({ ...previous, [type]: { ...result, error: '' } }));
          return result;
        } catch (error) {
          if (current.current === runtime) setRows(previous => ({ ...previous, [type]: { ...previous[type], error: '저장하지 못했어요. 다시 시도해 주세요.' } }));
          throw error;
        }
      })).then(results => {
        if (current.current !== runtime || results.some(result => result.status === 'rejected')) {
          if (current.current === runtime) onSaveError?.(true);
          throw new Error('일부 설정을 저장하지 못했어요. 다시 시도해 주세요.');
        }
      }).finally(() => {
        if (saving.current === task) saving.current = null;
        if (current.current === runtime) { setSubmitting(false); onSavingChange?.(false); }
      });
      saving.current = task;
      return task;
    };
    saveRef.current = save;
    return () => { if (saveRef.current === save) saveRef.current = null; };
  }, [saveRef, auth, userId, sessionKey]);

  const change = (type, agreed) => {
    if (saving.current || !current.current || typeof draft.current[type]?.agreed !== 'boolean') return;
    const next = { ...draft.current, [type]: { ...draft.current[type], agreed, error: '' } };
    draft.current = next;
    setRows(next);
    // 선택 즉시 서버에 반영한다. 실패하면 선택과 오류를 남겨 다시 저장할 수 있다.
    saveRef?.current?.().catch(() => {});
  };
  // 내장 약관이 있으면 앱 안에서 연다(배포 주소 환경변수가 없는 빌드에서도 눌러지게). 없을 때만 주소로 연다.
  const open = async item => {
    if (getSignupDocument(item.id)) { setReadingId(item.id); return; }
    try { await Linking.openURL(signupDocuments[item.id]); }
    catch { setDocumentError('동의 내용을 열지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  };
  const hasDocument = item => !!getSignupDocument(item.id) || !!signupDocuments[item.id];
  // 맨 아래 줄 밑 구분선은 감춘다(설정 구역 SettingSection 과 같다)
  return <View style={styles.list}><View style={styles.rows}>
    {optionalTerms.map(item => {
      const row = rows[item.termsType];
      return <View key={item.termsType} style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.label}>
            {item.label}
          </Text>
          <Pressable accessibilityRole="link" accessibilityLabel={`${item.label} 내용 보기`}
            accessibilityState={{ disabled: !hasDocument(item) }} disabled={!hasDocument(item)}
            hitSlop={{ top: 14, bottom: 14, right: 14 }} onPress={() => open(item)} style={styles.viewPress}>
            <Text style={[styles.viewLink, !hasDocument(item) && styles.linkDisabled]}>보기</Text>
          </Pressable>
          {!!row?.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{row.error}</Text>}
        </View>
        <View style={styles.control}>
          <Text style={styles.state}>{row?.error ? '미저장' : submitting ? '저장 중' : typeof row?.agreed === 'boolean' ? (row.agreed ? '동의' : '미동의') : '—'}</Text>
          <SettingSwitch label={item.label} on={row?.agreed === true} busy={submitting}
            accessibilityHint={typeof row?.agreed === 'boolean' ? '변경하면 바로 저장해요' : '현재 동의 상태를 확인하기 전에는 변경할 수 없어요'}
            disabled={typeof row?.agreed !== 'boolean' || submitting || !!problem || !sessionKey}
            onToggle={value => change(item.termsType, value)} />
        </View>
      </View>;
    })}</View>
    {loading && <Text accessibilityLiveRegion="polite" style={styles.note}>동의 상태를 불러오고 있어요…</Text>}
    {!!problem && <Text accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.viewLink}>다시 시도</Text>}
    {!!problem && <Text accessibilityLiveRegion="polite" style={styles.error}>{problem}</Text>}
    {readingId && <LegalDocumentScreen key={readingId} document={getSignupDocument(readingId)} onClose={() => setReadingId(null)} />}
    {!!documentError && <Text accessibilityLiveRegion="polite" style={styles.error}>{documentError}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  // 마이페이지 설정 행과 같은 이름 16/600 + 아래 구분선(구역 제목 SettingTitle 14/700 과 구분된다)
  list: { overflow: 'hidden' },
  rows: { marginBottom: -2 },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  state: { color: colors.textMuted, fontSize: 13, lineHeight: 20, minWidth: 36, textAlign: 'right' },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  label: { color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  viewLink: { color: colors.primaryText, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  viewPress: { alignSelf: 'flex-start' },
  linkDisabled: { color: colors.textMuted },
  error: { color: colors.dangerStrong, fontSize: 13, lineHeight: 20 },
});
