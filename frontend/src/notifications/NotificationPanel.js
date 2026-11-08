import { useEffect } from 'react';
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors as C, radius, DISABLED_OPACITY } from '../shared/theme';
import { notificationCountLabel } from './notificationCount.js';
import { canOpenInvitation } from './invitationAccess.js';
import { notificationPresentation } from './notificationPresentation.js';
import { notificationErrorNotice } from './notificationErrorNotice.js';
import { showNotificationDetail } from './notificationDetailView.js';
import AppIcon from '../shared/AppIcon';
import AuthenticationRecovery from '../auth/AuthenticationRecovery';
import { notify } from '../shared/dialogs';
import Cover from '../diary/components/Cover';
import EmptyState from '../diary/components/EmptyState';
import { FALLBACK_COVER_COLOR } from '../diary/constants';
import { sharingStyles as shared } from '../sharing/styles';

// trailing: 줄 오른쪽 끝 버튼. 터치 영역은 그대로 두고 보이는 글자 · 아이콘 끝을 본문 오른쪽 여백(24)에 맞춘다(지라 609: 오른쪽 여백이 왼쪽의 2배로 보였다)
export function NotificationButton({ label, text = label, icon, iconLeading = false, quiet = false, trailing = false, onPress, disabled = false, selected, style }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, ...(selected === undefined ? {} : { selected }) }}
    disabled={disabled} onPress={onPress} style={({ pressed }) => [s.button, quiet && s.quiet, iconLeading && s.leadingButton, trailing && (text === null ? (icon === 'close' ? s.trailingClose : s.trailingIcon) : s.trailingText), style, selected && s.selected, (disabled || pressed) && { opacity: disabled ? DISABLED_OPACITY : 0.6 }]}>
    {iconLeading && icon && <View accessible={false} aria-hidden importantForAccessibility="no-hide-descendants"><AppIcon name={icon} size={18} /></View>}
    {text !== null && <Text style={s.buttonText}>{text}</Text>}
    {!iconLeading && icon && <View accessible={false} aria-hidden importantForAccessibility="no-hide-descendants"><AppIcon name={icon} size={18} /></View>}
  </Pressable>;
}
// 224의 보관함/편집기 진입점에 이 props를 연결한다. 숨겨 둔 내보내기를 다시 켜지 않는다.
export function NotificationEntry({ count, onPress, label = '알림' }) {
  const { value, label: countLabel, showDot } = notificationCountLabel(count.data);
  return <View style={s.row}>
    <NotificationButton label={`${label}${value !== null ? ` · ${countLabel} ${value}개` : ''}`} onPress={onPress} />
    {showDot && <View testID="notification-dot" style={s.dot} />}
    {count.status === 'loading' && <View accessible accessibilityRole="progressbar" accessibilityLabel="알림 수 확인 중" aria-label="알림 수 확인 중" aria-busy={true} accessibilityState={{ busy: true }}>
      <View aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ActivityIndicator accessible={false} color={C.primary} /></View>
    </View>}
    {count.status === 'error' && <Text style={s.text}>알림 수 확인 필요</Text>}
  </View>;
}
// quietLoading: 불러오는 중 줄을 띄우지 않는다(알림 수 · 목록). 줄이 생겼다 사라지며 아래 목록이 튀었다(사용자 지적 2026-11-07). 오류는 그대로 보인다
function QueryNotice({ state, retry, label, refreshList, quietLoading = false }) {
  const notice = notificationErrorNotice(state.error, label === '초대 상세' ? '초대' : '알림');
  if (state.status === 'success') return null;
  if (quietLoading && state.status !== 'error') return null;
  return <View>
    {(state.status === 'idle' || state.status === 'loading') && <View accessible accessibilityRole="progressbar" accessibilityLabel={`${label} 불러오는 중이에요.`} aria-label={`${label} 불러오는 중이에요.`} accessibilityState={{ busy: true }} aria-busy={true} accessibilityLiveRegion="polite" aria-live="polite" style={s.row}>
      <View aria-hidden={true} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><ActivityIndicator accessible={false} color={C.primary} /></View><Text style={s.text}>{label} 불러오는 중이에요.</Text>
    </View>}
    {state.status === 'error' && <>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" aria-live="polite" style={s.text}>{notice.message}</Text>
      <AuthenticationRecovery error={state.error} />
      {state.data && <Text style={s.text}>이전 조회 결과를 표시하고 있어요.</Text>}
      {notice.canRetry && <NotificationButton label={`${label} 다시 시도`} onPress={retry} />}
      {notice.refreshList && refreshList && <NotificationButton label={`${label} 오류 후 목록 새로고침`} onPress={refreshList} />}
    </>}
  </View>;
}
export const invitationStatusLabel = status => ({ PENDING: '응답 대기', EXPIRED: '만료된 초대', REVOKED: '취소된 초대', ACCEPTED: '이미 수락한 초대', DECLINED: '거절한 초대', EXHAUSTED: '사용 횟수가 끝난 초대', UNAVAILABLE: '사용할 수 없는 초대' }[status] || '사용할 수 없는 초대');

// 서버·목이 같은 목록과 접근성 동작을 사용한다. 상태/동작은 hook에서 전달한다.
// 화면에는 아무것도 그리지 않고 문장이 바뀔 때 화면 읽기 프로그램에만 읽어 준다
function Announce({ text }) {
  useEffect(() => { if (text) AccessibilityInfo.announceForAccessibility?.(text); }, [text]);
  return null;
}

export default function NotificationPanel({ model, onInvitationReady }) {
  const { store, list, count, items, mutation, invitation, more, nextCursor } = model;
  const accessBlocked = [list, count].some(query => query.status === 'error' && [401, 403].includes(query.error?.status));
  const checkingInvitation = invitation.status === 'loading';
  const locked = mutation.status === 'saving' || mutation.canRetry || accessBlocked || checkingInvitation;
  // 처리 중 · 초대 확인 중은 화면에 줄을 끼우지 않고(튀지 않게) 화면 읽기 프로그램에만 읽어 준다(아래 Announce)
  const working = mutation.status === 'saving' ? '알림을 처리하고 있어요.' : checkingInvitation ? '초대를 확인하고 있어요.' : null;
  const mutationNotice = notificationErrorNotice(mutation.error);
  const detail = invitation.data;
  // 참여 가능한 초대는 기존 공유 화면으로 이동하고, 나머지 상세는 목록을 대체한다.
  const inspect = async row => {
    const work = store.open(row);
    if (!work) return;
    try { await work; } catch { return; } // 조회 오류는 store의 오류 화면으로 표시한다.
    if (!onInvitationReady) return;
    try {
      await store.proceedToInvitation(value => {
        if (value.inviteId !== row.inviteId) return;
        store.closeInvitation();
        return onInvitationReady(value);
      });
    } catch (error) {
      if (error?.name === 'AbortError') return;
      notify('초대 화면을 열지 못했어요', '잠시 후 초대 확인을 다시 눌러 주세요.');
    }
  };
  if (showNotificationDetail(invitation, Boolean(onInvitationReady))) return <ScrollView testID="notification-detail" style={s.scroller} contentContainerStyle={[s.content, s.detail]}>
    <NotificationButton label="초대 상세 닫기" text="알림 목록" icon="chevron-left" iconLeading quiet onPress={store.closeInvitation} />
    <QueryNotice state={invitation} retry={store.retryInvitation} label="초대 상세" refreshList={store.refreshNotifications} />
    {invitation.status === 'success' && detail && <>
      {detail.diary?.title && <Text style={s.detailTitle}>{detail.diary.title}</Text>}
      <Text style={s.muted}>{invitationStatusLabel(detail.status)}</Text>
      {!canOpenInvitation(detail) && <View style={s.detailNotice}><Text style={s.text}>이 초대로는 참여할 수 없어요.</Text><NotificationButton label="초대 상태 다시 확인" text="다시 확인" onPress={store.retryInvitation} /></View>}
    </>}
  </ScrollView>;
  return <ScrollView testID="notification-panel" style={s.scroller} contentContainerStyle={s.content} accessibilityState={{ busy: list.status === 'loading' || mutation.status === 'saving' || checkingInvitation }} aria-busy={list.status === 'loading' || mutation.status === 'saving' || checkingInvitation}>
    <View style={s.toolbar}>
      <Text style={s.muted}>{notificationCountLabel(count.data).value === null ? '받은 알림' : `${notificationCountLabel(count.data).label} ${notificationCountLabel(count.data).value}개`}</Text>
      {/* 새로고침 · 모두 읽음은 오른쪽 한 묶음: 겹치는 터치 영역 없이 보이는 사이만 좁힌다(아이콘 칸 여백 13만 남는다) */}
      <View style={s.toolActions}>
        <NotificationButton label="알림 새로고침" text={null} icon="reset" quiet trailing={!model.canReadAll} onPress={store.refresh} disabled={mutation.status === 'saving'} />
        {model.canReadAll && <NotificationButton label="모두 읽음" quiet trailing style={s.snug} onPress={store.readAll} disabled={locked || list.status !== 'success' || !items.length} />}
      </View>
    </View>
    {!(count.status === 'error' && list.status === 'error' && count.error?.status === 401 && list.error?.status === 401) &&
      <QueryNotice state={count} retry={store.refreshCount} label="알림 수" refreshList={store.refreshNotifications} quietLoading />}
    <QueryNotice state={list} retry={store.refreshList} label="알림 목록" refreshList={store.refreshNotifications} quietLoading />
    {/* 처리 중 · 초대 확인 중에는 줄을 끼워 넣지 않는다(버튼이 잠겨 알 수 있다). 화면 읽기 프로그램에는 working 을 읽어 준다 */}
    <Announce text={working} />
    {mutation.status === 'error' && <View style={s.card}>
      <Text accessibilityRole="alert" accessibilityLiveRegion="polite" aria-live="polite" style={s.text}>{mutationNotice.message}</Text>
      <AuthenticationRecovery error={mutation.error} />
      {mutation.canRetry ? <NotificationButton label="알림 처리 다시 시도" onPress={store.retryMutation} /> : <NotificationButton label="처리 안내 닫기" onPress={store.dismissMutation} />}
      {mutationNotice.refreshList && <NotificationButton label="처리 오류 후 목록 새로고침" onPress={store.refreshNotifications} />}
    </View>}
    {/* 처음 불러오는 동안은 빈 화면과 같은 자리 가운데에 스피너만 둔다(다시 받을 때는 지금 목록을 그대로 둔다) */}
    {(list.status === 'idle' || list.status === 'loading') && items.length === 0 && <View style={s.empty} accessible accessibilityRole="progressbar" accessibilityLabel="알림 목록 불러오는 중이에요." accessibilityState={{ busy: true }}><ActivityIndicator accessible={false} color={C.primary} /></View>}
    {list.status === 'success' && items.length === 0 && <View testID="notification-empty" style={s.emptyBox} accessibilityLiveRegion="polite" aria-live="polite"><EmptyState compact art="dio" title="받은 알림이 없어요" /></View>}
    {items.map(row => { const presentation = notificationPresentation(row);
      const pending = row.status === 'PENDING', joined = row.status === 'ACCEPTED';
      const EntryContent = presentation.canInspectInvitation ? Pressable : View;
      return <View key={row.id} style={[shared.invitation, s.entry, presentation.invitation && !pending && !joined && shared.invitationPast]}>
        <EntryContent style={s.entryTop} {...(presentation.canInspectInvitation ? {
          accessibilityRole: 'button', accessibilityLabel: `${presentation.title}, ${row.readAt ? '읽음' : '안 읽음'}, ${invitationStatusLabel(row.status)}, 초대 확인`,
          accessibilityState: { disabled: locked }, disabled: locked, onPress: () => inspect(row),
        } : {})}>
          <View style={shared.invitationCover} accessible={false}>{presentation.invitation ? <Cover diary={row.diary || { title: row.title, color: FALLBACK_COVER_COLOR }} thumbnailWidth={42} centered /> : <AppIcon name="bell" size={26} color={C.primaryText} />}</View>
          <View style={s.entryBody}>
            <View style={s.entryHeading}><Text accessible accessibilityLabel={`${presentation.title}, ${row.readAt ? '읽음' : '안 읽음'}`} numberOfLines={1} style={shared.invitationTitle}>{presentation.title}</Text>{!row.readAt && <View accessible={false} style={s.dot} />}{presentation.invitation && <View style={[shared.statusChip, pending && shared.statusChipPending, joined && shared.statusChipJoined]}><Text style={[shared.statusChipText, (pending || joined) && shared.statusChipTextPending]}>{invitationStatusLabel(row.status)}</Text></View>}</View>
            {presentation.invitation
              ? Boolean(presentation.sender) && <Text style={s.text}>{presentation.message}</Text>
              : <Text style={s.text}>{presentation.message}</Text>}
          </View>
        </EntryContent>
        <View style={s.entryFooter}>
          <View style={s.actions}>
            {presentation.canInspectInvitation ? <NotificationButton label={`초대 확인 ${row.id}`} text="초대 확인" icon="chevron-right" quiet disabled={locked} onPress={() => inspect(row)} />
              : !row.readAt && <NotificationButton label={`알림 읽음 ${row.id}`} text="읽음으로 표시" quiet disabled={locked} onPress={() => store.open(row)} />}
            <NotificationButton label={`알림 삭제 ${row.id}`} text={null} icon="close" quiet trailing disabled={locked} onPress={() => store.remove(row.id)} />
          </View>
        </View>
      </View>; })}
    {nextCursor && more.status !== 'error' && <NotificationButton label="알림 더 보기" onPress={store.loadMore} disabled={locked || more.status === 'loading' || list.status === 'loading'} />}
    {more.status === 'error' && <QueryNotice state={more} retry={store.loadMore} label="알림 더 보기" refreshList={store.refreshNotifications} />}

  </ScrollView>;
}
const s = StyleSheet.create({
  scroller: { flexGrow: 0, flexShrink: 1, minHeight: 0 },
  detail: { paddingTop: 12, paddingBottom: 24, gap: 12 },
  detailTitle: { color: C.text, fontSize: 16, lineHeight: 24, fontWeight: '700' },
  detailNotice: { padding: 16, gap: 12, borderRadius: radius.lg, backgroundColor: C.surfaceSoft },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 12, flexGrow: 1 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  toolbar: { paddingVertical: 12, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  card: { padding: 16, gap: 10, borderWidth: 1, borderColor: C.cardBorder, borderRadius: radius.lg, backgroundColor: C.surface },
  entry: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 0, paddingVertical: 14 },
  entryTop: { flexGrow: 1, flexBasis: 260, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  entryBody: { flex: 1, minWidth: 0, gap: 5 },
  entryFooter: { marginLeft: 'auto', alignSelf: 'center' },
  entryHeading: { minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  muted: { color: C.textMuted, fontSize: 12.5, lineHeight: 19, fontWeight: '600' },
  emptyBox: { flex: 1 }, // 다른 빈 화면과 같은 EmptyState(디오 — 공유 · 소식은 디오 담당, 사용자 결정 2026-11-08 · 알림 창은 좁아 compact)
  empty: { flex: 1, minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: 16 },
  button: { minHeight: 48, minWidth: 44, maxWidth: '100%', flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center', paddingHorizontal: 12, borderRadius: radius.md, backgroundColor: C.surfaceMuted },
  quiet: { backgroundColor: 'transparent' },
  leadingButton: { alignSelf: 'flex-start', paddingLeft: 0 },
  toolActions: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' },
  snug: { paddingLeft: 0 }, // 왼쪽 여백만 뺀다: 새로고침 칸(44)과 겹치지 않고, 이 버튼도 글자 + 오른쪽 12로 터치 폭 44 이상
  trailingText: { marginRight: -12 }, // 안쪽 여백 12만큼
  trailingIcon: { marginRight: -13 }, // 칸 44 안의 아이콘 18: (44 − 18) / 2
  trailingClose: { marginRight: -17 }, // 닫기 X 는 선이 아이콘 칸(18) 안쪽 4.5 에서 끝나 보이는 끝이 글자보다 안쪽이었다: 13 + 4 만큼 더 내민다
  buttonText: { color: C.text, fontSize: 13, fontWeight: '700' },
  selected: { borderWidth: 2, borderColor: C.primary },
  text: { color: C.text, fontSize: 12.5, lineHeight: 19, fontWeight: '600' }, title: { color: C.text, fontSize: 16, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.notifyPink }, // 읽지 않음 점은 쿨톤 핑크(사용자 지시, 색 규칙의 유일한 예외)
});
