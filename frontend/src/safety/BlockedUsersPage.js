import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import BackButton from '../diary/components/BackButton';
import EmptyState from '../diary/components/EmptyState';
import Header from '../diary/components/Header';
import { colors } from '../shared/theme';
import { useSafety } from './SafetyProvider';
import { Person, SafetyButton } from './SafetyScreen';
import { UNAVAILABLE } from './safetyModel';
import { safetyStyles as s } from './styles';

// 태블릿 마이페이지 › 차단한 사용자: 모달 대신 알림 설정 · 프로필 수정처럼 본문 자리에 여는 페이지(2026-11-09 사용자 결정, 지라 537).
// 목록 줄 · 해제 버튼 · 확인창 문구는 신고 · 차단 화면(SafetyScreen)의 차단 목록과 같다
export default function BlockedUsersPage({ onClose, backLabel = '마이페이지로 돌아가기' }) {
  const { store, state } = useSafety();
  const [question, setQuestion] = useState(null), [toast, setToast] = useState(''), [error, setError] = useState('');
  const alive = useRef(true);
  const unavailable = store.mode === 'unavailable', preview = store.mode === 'preview';
  const ready = !unavailable && state.status === 'ready', busy = Boolean(state.busy);
  useEffect(() => {
    alive.current = true;
    if (!unavailable) store.refresh();
    return () => { alive.current = false; };
  }, [store, unavailable]);
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2000);
    return () => clearTimeout(timer);
  }, [toast]);
  async function confirm() {
    const member = question.member;
    setQuestion(null); setError('');
    try {
      await store.unblock(member);
      if (alive.current) setToast(preview ? '미리보기 상태를 변경했어요. 실제 계정에는 적용되지 않아요.' : '차단을 해제했어요');
    } catch (failure) { if (alive.current) setError(failure.message); }
  }
  return <View style={page.root}>
    <ScrollView contentContainerStyle={page.scroll} showsVerticalScrollIndicator={false}>
      <View style={page.list}>
        <Header title="차단한 사용자" left={<BackButton label={backLabel} disabled={busy} onPress={onClose} />} />
        {unavailable && <Text style={s.muted}>{UNAVAILABLE}</Text>}
        {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {state.status === 'loading' && <ActivityIndicator accessibilityLabel="차단 목록 불러오는 중" color={colors.primaryStrong} />}
        {state.status === 'error' && <><Text style={s.error}>{state.error}</Text><SafetyButton secondary onPress={() => store.refresh()}>목록 다시 불러오기</SafetyButton></>}
        {ready && !!state.blocks.length && <Text accessibilityRole="header" style={s.sectionTitle}>전체 {state.blocks.length}명</Text>}
        {/* 빈 목록: 캐릭터와 문구를 제목 아래 남은 높이의 가운데에(내 다이어리 빈 화면과 같은 자리) */}
        {ready && !state.blocks.length && <View style={page.empty}><EmptyState title="차단한 사용자가 없어요" /></View>}
        <View>{state.blocks.map(member => <View key={member.id} style={[s.listRow, s.row]}>
          <View style={s.grow}><Person member={member}><Text style={s.muted}>{new Date(member.blockedAt).toLocaleDateString('ko-KR')} 차단</Text></Person></View>
          <Pressable accessibilityRole="button" accessibilityLabel={`${member.nickname} 차단 해제`} accessibilityState={{ disabled: busy || !ready }} disabled={busy || !ready}
            onPress={() => { setError(''); setQuestion({ member }); }} style={[s.tonal, (busy || !ready) && s.disabled]}><Text style={s.tonalText}>차단 해제</Text></Pressable>
        </View>)}</View>
      </View>
    </ScrollView>
    {!!toast && <View pointerEvents="none" style={[s.toast, { bottom: 32 }]}><Text accessibilityLiveRegion="polite" style={s.toastText}>{toast}</Text></View>}
    <ConfirmDialog open={Boolean(question)} danger={false} title={question ? `${question.member.nickname}님의 차단을 해제할까요?` : ''}
      message="서로 이메일 초대를 주고받거나 수락할 수 있게 돼요. 유효한 대기 초대도 다시 수락할 수 있어요."
      confirmLabel="차단 해제" onCancel={() => setQuestion(null)} onConfirm={confirm} />
  </View>;
}

// 알림 설정 페이지(NotificationSettingsScreen)와 같은 여백 · 최대 폭
const page = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, width: '100%', paddingHorizontal: 30, paddingTop: 38, paddingBottom: 44 },
  list: { flexGrow: 1, width: '100%', maxWidth: 1040, alignSelf: 'center' },
  empty: { flex: 1, justifyContent: 'center' },
});
