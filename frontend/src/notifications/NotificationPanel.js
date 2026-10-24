import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors as C, radius, DISABLED_OPACITY } from '../shared/theme';

export function NotificationButton({ label, onPress, disabled = false, selected }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, selected && s.selected, (disabled || pressed) && { opacity: disabled ? DISABLED_OPACITY : 0.6 }]}>
    <Text style={s.text}>{label}</Text>
  </Pressable>;
}
// 224의 보관함/편집기 진입점에 이 props를 연결한다. 숨겨 둔 내보내기를 다시 켜지 않는다.
export function NotificationEntry({ count, onPress, label = '알림' }) {
  const value = count.data?.actionableUnreadCount;
  return <View style={s.row}>
    <NotificationButton label={`${label}${value > 0 ? ` · 새 초대 ${value}개` : ''}`} onPress={onPress} />
    {value > 0 && <View testID="notification-dot" style={s.dot} />}
    {count.status === 'loading' && <ActivityIndicator accessibilityLabel="알림 수 확인 중" color={C.primary} />}
    {count.status === 'error' && <Text style={s.text}>알림 수 확인 필요</Text>}
  </View>;
}
function QueryNotice({ state, retry, label }) {
  return <View accessibilityLiveRegion="polite">
    {(state.status === 'idle' || state.status === 'loading') && <View style={s.row}><ActivityIndicator color={C.primary} /><Text style={s.text}>{label} 불러오는 중이에요.</Text></View>}
    {state.status === 'error' && <>
      <Text style={s.text}>{state.error.message}</Text>
      {state.data && <Text style={s.text}>이전 조회 결과를 표시하고 있어요.</Text>}
      <NotificationButton label={`${label} 다시 시도`} onPress={retry} />
    </>}
  </View>;
}
export const invitationStatusLabel = status => ({ PENDING: '응답 대기', EXPIRED: '만료된 초대', REVOKED: '취소된 초대', ACCEPTED: '이미 수락한 초대', DECLINED: '거절한 초대', EXHAUSTED: '사용 횟수가 끝난 초대', UNAVAILABLE: '사용할 수 없는 초대' }[status] || '사용할 수 없는 초대');

// 최종 224 디자인이 아닌 재사용 가능한 연결 검증 패널. 상태/동작은 hook에서 전달한다.
export default function NotificationPanel({ model, onInvitationReady }) {
  const { store, list, count, items, mutation, invitation, more, nextCursor } = model;
  const locked = mutation.status === 'saving' || mutation.canRetry;
  const detail = invitation.data;
  return <ScrollView contentContainerStyle={s.content}>
    <Text style={s.title}>받은 알림</Text>
    <View style={s.row}>
      <NotificationButton label="알림 새로고침" onPress={store.refresh} disabled={mutation.status === 'saving'} />
      <NotificationButton label="모두 읽음" onPress={store.readAll} disabled={locked || list.status !== 'success' || !items.length} />
    </View>
    <QueryNotice state={count} retry={store.refreshCount} label="알림 수" />
    <QueryNotice state={list} retry={store.refreshList} label="알림 목록" />
    {mutation.status === 'saving' && <Text accessibilityLiveRegion="polite" style={s.text}>알림을 처리하고 있어요.</Text>}
    {mutation.status === 'success' && <Text accessibilityLiveRegion="polite" style={s.text}>알림 처리를 완료했어요.</Text>}
    {mutation.status === 'error' && <View accessibilityLiveRegion="polite" style={s.card}>
      <Text style={s.text}>{mutation.error.message}</Text>
      {mutation.canRetry ? <NotificationButton label="알림 처리 다시 시도" onPress={store.retryMutation} /> : <NotificationButton label="처리 안내 닫기" onPress={store.dismissMutation} />}
    </View>}
    {list.status === 'success' && items.length === 0 && <Text style={s.text}>받은 알림이 없어요.</Text>}
    {items.map(row => <View key={row.id} style={s.card}>
      <Text style={s.title}>{row.title}</Text>
      <Text style={s.text}>{row.actor}님의 초대 · {row.readAt ? '읽음' : '안 읽음'} · {invitationStatusLabel(row.status)}</Text>
      <View style={s.row}>
        <NotificationButton label={`초대 확인 ${row.id}`} disabled={locked} onPress={() => store.open(row)} />
        <NotificationButton label={`알림 삭제 ${row.id}`} disabled={locked} onPress={() => store.remove(row.id)} />
      </View>
    </View>)}
    {nextCursor && <NotificationButton label={more.status === 'error' ? '알림 더 보기 다시 시도' : '알림 더 보기'} onPress={store.loadMore} disabled={locked || more.status === 'loading' || list.status === 'loading'} />}
    {more.status === 'error' && <Text style={s.text}>{more.error.message}</Text>}
    {invitation.status !== 'idle' && <View style={s.card}>
      <Text style={s.title}>초대 상세</Text>
      <NotificationButton label="초대 상세 닫기" onPress={store.closeInvitation} />
      <QueryNotice state={invitation} retry={store.retryInvitation} label="초대 상세" />
      {invitation.status === 'success' && detail && <>
        <Text style={s.text}>{invitationStatusLabel(detail.status)}</Text>
        {detail.status === 'PENDING' ? <>
          <Text style={s.text}>{detail.diary?.title}</Text>
          {onInvitationReady ? <NotificationButton label="초대 화면으로 이동" onPress={() => store.proceedToInvitation(onInvitationReady)} /> : <Text style={s.text}>공유 담당의 수락·거절 화면 연결을 기다리고 있어요.</Text>}
        </> : <Text style={s.text}>현재 상태에서는 새로 참여할 수 없어요. 필요한 경우 다시 초대를 요청해 주세요.</Text>}
      </>}
    </View>}
  </ScrollView>;
}
const s = StyleSheet.create({
  content: { padding: 16, gap: 12 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  card: { padding: 16, gap: 8, borderRadius: radius.lg, backgroundColor: C.surface },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: C.surfaceMuted },
  selected: { borderWidth: 2, borderColor: C.primary },
  text: { color: C.text, fontSize: 14 }, title: { color: C.text, fontSize: 18, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.danger },
});
