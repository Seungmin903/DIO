import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { fetch as memberFetch } from 'expo/fetch';
import { apiBaseUrl, accessTokenHeader } from '../../auth/authService';
import { createTermsConsentApi, createTermsConsentRuntime, optionalTerms } from '../../auth/termsConsent';
import { signupDocuments } from '../../shared/legalDocuments';
import { createAuthenticatedMemberTransport } from '../services/memberTransport';
import { SettingSwitch } from './SettingRow';
import { colors } from '../../shared/theme';

export default function TermsConsentSection({ auth, userId, saveRef, onReadyChange }) {
  const [rows, setRows] = useState({});
  const [problem, setProblem] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [documentError, setDocumentError] = useState('');
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
    return () => { runtime?.dispose(); if (current.current === runtime) current.current = null; };
  }, [auth, userId, sessionKey, attempt, onReadyChange]);

  useEffect(() => {
    if (!saveRef) return;
    const save = () => {
      if (saving.current) return saving.current;
      const runtime = current.current;
      if (!runtime || Object.keys(confirmed.current).length !== optionalTerms.length)
        return Promise.reject(new Error('동의 상태를 먼저 확인해 주세요.'));
      const changes = optionalTerms.filter(item => draft.current[item.termsType]?.agreed !== confirmed.current[item.termsType]?.agreed);
      setSubmitting(true);
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
        if (current.current !== runtime || results.some(result => result.status === 'rejected'))
          throw new Error('일부 설정을 저장하지 못했어요. 다시 시도해 주세요.');
      }).finally(() => {
        if (saving.current === task) saving.current = null;
        if (current.current === runtime) setSubmitting(false);
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
  };
  const open = async item => {
    try { await Linking.openURL(signupDocuments[item.id]); }
    catch { setDocumentError('동의 내용을 열지 못했어요. 인터넷 연결을 확인해 주세요.'); }
  };
  return <View>
    {optionalTerms.map(item => {
      const row = rows[item.termsType];
      return <View key={item.termsType} style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.label}>
            {item.label}{'  '}
            <Text accessibilityRole="link" accessibilityLabel={`${item.label} 내용 보기`}
              accessibilityState={{ disabled: !signupDocuments[item.id] }}
              onPress={signupDocuments[item.id] ? () => open(item) : undefined}
              style={[styles.viewLink, !signupDocuments[item.id] && styles.linkDisabled]}>보기</Text>
          </Text>
          {!!row?.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{row.error}</Text>}
        </View>
        <View style={styles.control}>
          <Text style={styles.state}>{typeof row?.agreed === 'boolean' ? (row.agreed ? '동의' : '미동의') : '—'}</Text>
          <SettingSwitch label={item.label} on={row?.agreed === true} busy={submitting}
            accessibilityHint={typeof row?.agreed === 'boolean' ? '아래 저장 버튼을 누르면 저장돼요' : '현재 동의 상태를 확인하기 전에는 변경할 수 없어요'}
            disabled={typeof row?.agreed !== 'boolean' || submitting || !!problem || !sessionKey}
            onToggle={value => change(item.termsType, value)} />
        </View>
      </View>;
    })}
    {loading && <Text accessibilityLiveRegion="polite" style={styles.note}>동의 상태를 불러오고 있어요…</Text>}
    {!!problem && <Text accessibilityRole="button" onPress={() => setAttempt(value => value + 1)} style={styles.viewLink}>다시 시도</Text>}
    {!!problem && <Text accessibilityLiveRegion="polite" style={styles.error}>{problem}</Text>}
    {!!documentError && <Text accessibilityLiveRegion="polite" style={styles.error}>{documentError}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 8 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  state: { color: colors.textMuted, fontSize: 13, lineHeight: 20, minWidth: 36, textAlign: 'right' },
  copy: { flex: 1, minWidth: 0, gap: 6 },
  label: { color: colors.text, fontSize: 15, lineHeight: 22, fontWeight: '700' },
  note: { color: colors.textMuted, fontSize: 13, lineHeight: 20 },
  viewLink: { color: colors.primaryText, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  linkDisabled: { color: colors.textMuted },
  error: { color: colors.dangerStrong, fontSize: 13, lineHeight: 20 },
});
