import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import EditorModal from '../editor/components/controls/EditorModal';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import Icon from '../editor/components/controls/Icon';
import Cover from '../diary/components/Cover';
import { FALLBACK_COVER_COLOR } from '../diary/constants';
import { pickProfilePhoto } from '../auth/profilePhoto';
import MemberAvatar from './MemberAvatar';
import AuthenticationRecovery from '../auth/AuthenticationRecovery';
import { invitationStatusLabel } from '../notifications/NotificationPanel';
import { notificationSender } from '../notifications/notificationPresentation';
import { colors } from '../shared/theme';
import { useFormFactor } from '../shared/useFormFactor';
import { normalizeSharingNickname, sharingNicknameError, inviteEmailError, MAX_SHARING_MEMBERS, COPY_TITLE_LIMIT, copyTitleError, defaultCopyTitle } from './sharingContracts';
import { sharingStyles as s } from './styles';

// 미리보기 초대는 full 을 채우고, 서버 초대는 참여 인원(memberCount)만 준다
function isInviteFull(invite) {
  return invite.full ?? (Number.isInteger(invite.memberCount) && invite.memberCount >= MAX_SHARING_MEMBERS);
}

function Button({
  label,
  text = label,
  onPress,
  disabled = false,
  secondary = false,
  danger = false,
  style,
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && s.disabled,
        style,
      ]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText, danger && s.dangerText]}>
        {text}
      </Text>
    </Pressable>
  );
}
// 받은 초대 목록의 상태 칩 글자(취소 · 만료는 짧은 명사로, 나머지는 기존 상태 이름 그대로)
// 상태 묶음: 응답 대기 · 참여 완료 · 그 밖의 끝난 초대(거절 · 취소 · 만료 · 사용 횟수 끝 · 사용 불가)
const chipTone = status => (status === 'PENDING' ? 'Pending' : status === 'ACCEPTED' ? 'Joined' : null);
const chipLabel = status =>
  ({ EXPIRED: '초대 만료', REVOKED: '초대 취소' })[status] || invitationStatusLabel(status);
function DiarySummary({ diary }) {
  return (
    <View style={s.summary}>
      <Icon name="book" size={20} forText={14} />
      <Text style={[s.bold, s.grow]}>{diary?.title}</Text>
    </View>
  );
}

export default function SharingHub({
  request,
  runtime,
  model,
  onClose,
  onOpenDiary,
  onOpenCopy,
  onOpenParticipants,
  onReturnToNotifications,
  embedded = false,
  onBackReady,
  photoPicker = pickProfilePhoto,
}) {
  const { isPhone } = useFormFactor();
  const [screen, setScreen] = useState(request?.inviteId ? 'detail' : 'invitations');
  const [diary, setDiary] = useState(null);
  const [invite, setInvite] = useState(null);
  const [blockedAcknowledged, setBlockedAcknowledged] = useState(false);
  const [nickname, setNickname] = useState('');
  const [draftPhoto, setDraftPhoto] = useState(null);
  const [photoMenu, setPhotoMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState('');
  const [requestError, setRequestError] = useState(null);
  const setError = value => { setErrorText(value); setRequestError(null); };
  const showFailure = failure => { setError(failure.message || '처리하지 못했어요. 다시 시도해 주세요.'); setRequestError(failure); };
  const [question, setQuestion] = useState(null);
  const [toast, setToast] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [capacityInfo, setCapacityInfo] = useState(false);
  const [linkExpired, setLinkExpired] = useState(false);
  const [copyTitle, setCopyTitle] = useState('');
  const [createdCopy, setCreatedCopy] = useState(null);
  const job = useRef(0),
    running = useRef(false);
  const alive = useRef(true);
  const nicknameField = useRef(null);
  const linkField = useRef(null);
  const emailField = useRef(null);
  const copyField = useRef(null);
  const formScroll = useRef(null);
  const focusedInput = useRef(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef(Infinity);
  const focusTimer = useRef(null);
  const dismissInput = () => {
    focusedInput.current = null;
    clearTimeout(focusTimer.current);
    Keyboard.dismiss();
  };
  const revealInput = () => {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const input = focusedInput.current;
      if (!alive.current || !input || Platform.OS === 'web') return;
      formScroll.current?.measureInWindow((sx, sy, sw, sh) => {
        input.measureInWindow?.((x, y, w, h) => {
          if (!alive.current || input !== focusedInput.current || !h) return;
          const top = sy + 16,
            bottom = Math.min(sy + sh, keyboardTop.current) - 16;
          if (bottom <= top) return;
          const delta = y + h > bottom ? y + h - bottom : y < top ? y - top : 0;
          if (delta)
            formScroll.current?.scrollTo({
              y: Math.max(0, scrollOffset.current + delta),
              animated: true,
            });
        });
      });
    }, 80);
  };
  const focusInput = (input) => {
    focusedInput.current = input;
    revealInput();
  };
  const blurInput = (input) => {
    if (focusedInput.current === input) focusedInput.current = null;
  };
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      revealInput();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Infinity;
    });
    return () => {
      show.remove();
      hide.remove();
      clearTimeout(focusTimer.current);
    };
  }, []);
  const { store, list, count, items, more, nextCursor, mutation } = model;
  const countValue = count.data?.actionableUnreadCount || 0;
  // 공유 창 맨 위 알림 행의 상태 글자 (100개 이상은 99개 이상)
  const noticeState = countValue ? `새 초대 ${countValue > 99 ? '99개 이상' : `${countValue}개`}` : '새 초대 없음';
  const mutationLocked = mutation.status === 'saving' || mutation.canRetry;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      job.current++;
    };
  }, []);
  useEffect(() => {
    job.current++;
    running.current = false;
    setBusy(false);
    setError('');
    setToast('');
    setQuestion(null);
    setPhotoMenu(null);
    setDraftPhoto(null);
    setInvite(null);
    setBlockedAcknowledged(false);
    setLinkInput('');
    setInviteEmail('');
    setCapacityInfo(false);
    setCreatedCopy(null);
    setCopyTitle('');
    focusedInput.current = null;
    clearTimeout(focusTimer.current);
    if (!request) return;
    dismissInput();
    if (request.inviteId) {
      const pending = job.current;
      setScreen('detail'); setBusy(true);
      runtime.invitationGateway.get(request.inviteId).then(value => {
        if (!alive.current || pending !== job.current) return;
        if (value.inviteId !== request.inviteId || value.status !== 'PENDING' || value.canOpen !== true)
          throw new Error('사용할 수 없는 초대예요. 최신 상태를 확인해 주세요.');
        setInvite(value); setScreen('detail');
      }).catch(error => {
        if (alive.current && pending === job.current) showFailure(error);
      }).finally(() => { if (alive.current && pending === job.current) setBusy(false); });
    } else if (request.diary) {
      try {
        const registered = runtime.registerDiary(request.diary);
        setDiary(registered);
        setScreen('sharing');
        if (runtime.server) {
          const pending = job.current;
          setBusy(true);
          runtime.getSharing(registered.id).then(value => {
            if (alive.current && pending === job.current) setDiary(value);
          }).catch(error => {
            if (alive.current && pending === job.current) { showFailure(error); setScreen('invitations'); }
          }).finally(() => { if (alive.current && pending === job.current) setBusy(false); });
        }
      } catch (error) {
        showFailure(error);
        setScreen('invitations');
      }
    } else setScreen('invitations');
    store.refresh();
  }, [request, runtime, store]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const remaining = Date.parse(diary?.linkExpiresAt) - Date.now();
    setLinkExpired(Number.isFinite(remaining) && remaining <= 0);
    if (!request || !Number.isFinite(remaining) || remaining <= 0) return;
    const timer = setTimeout(() => setLinkExpired(true), Math.min(remaining, 2147483647));
    return () => clearTimeout(timer);
  }, [request, diary?.link, diary?.linkExpiresAt]);
  useEffect(() => {
    dismissInput();
    formScroll.current?.scrollTo({ y: 0, animated: false });
    scrollOffset.current = 0;
  }, [screen, request]);
  const run = async (action, done = () => {}) => {
    if (running.current) return;
    const id = ++job.current;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (alive.current && id === job.current) done(result);
    } catch (error) {
      if (alive.current && id === job.current) {
        showFailure(error);
        if (error.code === 'BLOCKED_MEMBER_CONFIRMATION_REQUIRED' && screen === 'nickname') {
          setBlockedAcknowledged(false);
          setQuestion({ kind: 'blocked-members', stage: 'retry' });
        }
      }
    } finally {
      if (alive.current && id === job.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  const close = () => {
    if (!running.current) {
      dismissInput();
      onClose();
    }
  };
  const back = () => {
    if (running.current) return;
    dismissInput();
    if (photoMenu) {
      setPhotoMenu(null);
      return;
    }
    if (question) {
      setQuestion(null);
      return;
    }
    if (screen === 'email' || screen === 'members' || screen === 'copy') {
      setScreen('sharing'); setError(''); setToast('');
    } else if (request?.returnToNotifications && screen === 'nickname') {
      setScreen('detail'); setError('');
    } else if (request?.returnToNotifications && onReturnToNotifications && (screen === 'detail' || screen === 'invitations')) {
      onReturnToNotifications();
    } else if (screen === 'detail') {
      setScreen('invitations'); setInvite(null); setError('');
    } else if (screen === 'nickname' || screen === 'profile') {
      setScreen(screen === 'profile' ? 'sharing' : 'invitations');
      setError('');
    } else if (request?.diary && screen === 'invitations') {
      if (
        request.diary.sharedDiaryId &&
        !runtime.getSnapshot().joined.some((value) => value.id === request.diary.sharedDiaryId)
      ) {
        close();
        return;
      }
      run(
        () => runtime.getSharing(request.diary.sharedDiaryId || request.diary.id),
        (value) => {
          setDiary(value);
          setScreen('sharing');
        },
      );
    } else close();
  };
  const prepareNickname = (value) => {
    if (value.status !== 'PENDING')
      throw new Error('사용할 수 없는 초대예요. 새 초대를 요청해 주세요.');
    if (isInviteFull(value)) {
      setInvite(value); setScreen('detail'); return;
    }
    dismissInput();
    setInvite(value);
    setNickname(runtime.self.nickname);
    setDraftPhoto(runtime.self.photoUri || null);
    setBlockedAcknowledged(false);
    setScreen('nickname');
    if (value.requiresBlockedMemberConfirmation === true) setQuestion({ kind: 'blocked-members', stage: 'prepare' });
  };
  const prepareProfile = () => {
    const current = diary.members.find((member) => member.id === runtime.self.id);
    dismissInput();
    setNickname(current.nickname);
    setDraftPhoto(current.photoUri || null);
    setError('');
    setScreen('profile');
  };
  const openInvite = (row) =>
    run(
      async () => {
        await store.open(row);
        return runtime.invitationGateway.get(row.inviteId);
      },
      (value) => {
        try {
          prepareNickname(value);
        } catch (error) {
          showFailure(error);
        }
      },
    );
  // 먼저 초대 상세 화면으로 넘어가고(가운데에 불러오는 표시), 불러오지 못하면 목록으로 돌아온다
  const openInviteDetail = (row) => {
    if (running.current) return;
    setInvite(null);
    setScreen('detail');
    run(async () => {
      try {
        await store.open(row);
        return await runtime.invitationGateway.get(row.inviteId);
      } catch (error) {
        setScreen('invitations');
        throw error;
      }
    }, value => setInvite(value));
  };
  const changeNickname = (value) => {
    setNickname(value);
    setError('');
  };
  const confirmQuestion = () => {
    const current = question;
    setQuestion(null);
    if (current.kind === 'blocked-members') {
      setBlockedAcknowledged(true);
      if (current.stage === 'retry') submitParticipation(true);
      return;
    }
    if (current.kind === 'cancel-email')
      run(
        () => runtime.cancelEmailInvite(diary.id, current.inviteId),
        (result) => { setDiary(result); setToast('초대를 취소했어요.'); },
      );
    else if (current.kind === 'decline')
      run(
        () => runtime.decline(current.inviteId),
        () => {
          // 거절은 곧 삭제: 알림 목록에서도 지운다(지울 수 없는 환경은 목록만 새로 고친다)
          const row = items.find((value) => value.inviteId === current.inviteId);
          if (row && runtime.supportsReadState !== false) store.remove(row.id);
          else store.refresh();
          setInvite(null);
          if (screen === 'detail' && request?.returnToNotifications && onReturnToNotifications) { onReturnToNotifications(); return; }
          if (screen === 'detail') setScreen('invitations');
          setToast('초대를 삭제했어요.');
        },
      );
    else if (current.kind === 'transfer')
      run(
        () => runtime.transferOwner(diary.id, current.member.id),
        result => { setDiary(result); setScreen('sharing'); setToast('소유권을 양도했어요.'); },
      );
    else if (current.kind === 'remove')
      run(
        () => runtime.removeMember(diary.id, current.member.id),
        (result) => {
          setDiary(result);
          setToast('참여자를 내보냈어요.');
        },
      );
    else
      run(
        () => runtime.leave(diary.id),
        () => {
          setDiary(null);
          store.refresh();
          setScreen('invitations');
          setToast('참여를 해제했어요.');
        },
      );
  };
  const choosePhoto = (reset = false) => {
    setPhotoMenu(null);
    dismissInput();
    run(
      async () => {
        const uri = reset ? null : await photoPicker();
        if (!reset && !uri) return null;
        return { photoUri: uri };
      },
      (result) => {
        if (!result) return;
        setDraftPhoto(result.photoUri);
      },
    );
  };
  // 새로고침하는 동안에는 새로고침이 꺼지고, 이미 받은 목록이 있으면 '모두 읽음'은 그대로 둔다. 모두 읽은 목록이면 꺼진다
  const refreshing = list.status === 'loading' || count.status === 'loading';
  const readAllDisabled =
    busy || mutationLocked || !items.length || ['idle', 'error'].includes(list.status) || items.every((row) => row.readAt);
  // 버튼 줄 맨 끝의 '더보기 ›'(초대 상세). 카드 위쪽을 눌러도 같은 화면이 열린다
  const moreLink = (row) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title} 초대 더보기`}
      disabled={busy || mutationLocked}
      onPress={() => openInviteDetail(row)}
      style={[s.moreLink, (busy || mutationLocked) && s.disabled]}
    >
      <Text style={s.moreLinkText}>더보기</Text>
      <Icon name="chevronRight" size={16} forText={14} color={colors.primaryText} />
    </Pressable>
  );
  // 카드 아래(폰) · 오른쪽(태블릿) 버튼 줄: 삭제 · 수락 · 더보기. 끝난 초대는 수락 없이 삭제(알림 삭제) · 더보기
  const invitationActions = (row) => {
    const size = isPhone ? s.phoneInvitationButton : s.invitationButton;
    return (
      <View style={s.invitationActionsRow}>
        {row.actionable ? (
          <>
            <Button
              label={`${row.title} 초대 삭제`}
              text="삭제"
              style={size}
              secondary
              disabled={busy || mutationLocked}
              onPress={() => setQuestion({ kind: 'decline', inviteId: row.inviteId, title: row.title })}
            />
            <Button
              label={`${row.title} 초대 수락`}
              text="수락"
              style={size}
              disabled={busy || mutationLocked}
              onPress={() => openInvite(row)}
            />
          </>
        ) : (
          // 알림을 지울 수 없는 계정에는 삭제가 없다
          runtime.supportsReadState !== false && (
            <Button
              label={`${row.title} 알림 삭제`}
              text="삭제"
              style={size}
              secondary
              disabled={busy || mutationLocked}
              onPress={() => store.remove(row.id)}
            />
          )
        )}
        {moreLink(row)}
      </View>
    );
  };
  useEffect(() => {
    if (!embedded || !onBackReady) return;
    onBackReady(back);
    return () => onBackReady(null);
  }, [embedded, onBackReady, back]);
  if (!request) return null;
  const mine = diary?.members.find((member) => member.id === runtime.self.id);
  const isOwner = mine?.role === 'OWNER';
  const isFull = (diary?.members.length || 0) >= MAX_SHARING_MEMBERS;
  const emailAvailable = typeof runtime.sendEmailInvite === 'function' && (isOwner || (runtime.server && mine?.role === 'EDITOR'));
  const nicknameReady = !sharingNicknameError(nickname);
  const editingProfile = screen === 'profile';
  const profileDiary = editingProfile ? diary : invite?.diary;
  const profileChanged =
    !editingProfile ||
    normalizeSharingNickname(nickname) !== mine?.nickname ||
    draftPhoto !== (mine?.photoUri || null);
  const submitParticipation = (acknowledge = blockedAcknowledged) => {
    if (!nicknameReady) return;
    run(() => editingProfile
      ? runtime.updateProfile(diary.id, { nickname, photoUri: draftPhoto })
      : runtime.accept(invite.inviteId, nickname, { photoUri: draftPhoto, ...(acknowledge === true ? { acknowledgeBlockedMembers: true } : {}) }),
      result => {
        dismissInput(); setDiary(result); setScreen('sharing'); store.refresh();
        setToast(result.profileWarning || (editingProfile ? '다이어리 프로필을 변경했어요.' : '다이어리에 참여했어요.'));
      });
  };
  const content = (
      <SafeAreaView style={s.backdrop}>
        <Pressable testID="sharing-outside" accessible={false} style={s.keyboard} onPress={close}>
          <KeyboardAvoidingView
            style={s.keyboard}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <ScrollView
              ref={formScroll}
              onScroll={(event) => {
                scrollOffset.current = event.nativeEvent.contentOffset.y;
              }}
              scrollEventThrottle={16}
              style={s.viewport}
              contentContainerStyle={[s.center, isPhone && { padding: 16 }]}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                accessible={false}
                style={[s.card, isPhone && s.phoneCard]}
                onPress={(event) => event.stopPropagation()}
              >
                <View style={s.header}>
                  {screen !== 'sharing' && screen !== 'invitations' && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="이전 공유 화면"
                      onPress={back}
                      disabled={busy}
                      style={s.iconButton}
                    >
                      <Icon name="chevronLeft" size={20} />
                    </Pressable>
                  )}
                  <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
                    {screen === 'sharing'
                      ? '다이어리 공유'
                      : screen === 'email' ? '이메일로 초대'
                      : screen === 'members' ? '참여자 관리'
                      : screen === 'copy' ? '개인 사본 만들기'
                      : screen === 'detail' ? '다이어리 초대'
                      : screen === 'profile'
                        ? isPhone
                          ? '프로필 수정'
                          : '다이어리 프로필 수정'
                        : screen === 'nickname'
                          ? isPhone
                            ? '프로필 설정'
                            : '다이어리 프로필 설정'
                          : '알림'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="공유 창 닫기"
                    onPress={close}
                    disabled={busy}
                    style={s.iconButton}
                  >
                    <Icon name="close" size={20} />
                  </Pressable>
                </View>
                <View style={s.body}>
                  {screen === 'sharing' && diary && (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`알림, ${noticeState}`}
                        disabled={busy}
                        onPress={() => {
                          setScreen('invitations');
                          setError('');
                          store.refresh();
                        }}
                        style={[s.banner, countValue > 0 ? s.bannerNew : s.bannerIdle]}
                      >
                        {/* 새 초대가 있으면 종 위에 앱 공용 안 읽음 점. 수는 아래 상태 글자가 말한다 */}
                        <View accessible={false}>
                          <Icon name="bell" size={20} color={colors.primaryText} />
                          {countValue > 0 && <View style={s.bannerDot} />}
                        </View>
                        <View style={s.grow}>
                          <Text style={countValue > 0 ? s.bannerTitleNew : s.bannerTitle}>알림</Text>
                          <Text style={s.bannerState}>{noticeState}</Text>
                        </View>
                        <Icon name="chevronRight" size={20} color={colors.primaryText} />
                      </Pressable>
                      <DiarySummary diary={diary} />
                      {!!diary.refreshWarning && <View style={s.notice}><Text style={s.muted}>{diary.refreshWarning}</Text>
                        <Button label="공유 정보 새로고침" text="새로고침" secondary disabled={busy}
                          onPress={() => run(() => runtime.getSharing(diary.id), setDiary)} /></View>}
                      <View style={s.row}>
                        <Text style={[s.label, s.grow]}>함께 편집하는 사람</Text>
                        <Text style={s.muted}>{diary.members.length}/{MAX_SHARING_MEMBERS}명</Text>
                      </View>
                      {diary.members.map((member) => (
                        <View key={member.id} style={s.participant}>
                          {member.id === runtime.self.id ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="이 다이어리 프로필 수정"
                              disabled={busy}
                              onPress={prepareProfile}
                              style={s.profileControl}
                            >
                              <MemberAvatar member={member} />
                              <View style={s.profileEdit}>
                                <Icon name="edit" size={10} />
                              </View>
                            </Pressable>
                          ) : (
                            <View style={s.avatar}>
                              <MemberAvatar member={member} />
                            </View>
                          )}
                          <View style={s.grow}>
                            <Text style={s.bold}>
                              {member.nickname}
                              {member.id === runtime.self.id ? ' · 나' : ''}
                            </Text>
                            <Text style={s.muted}>
                              {member.role === 'OWNER' ? '소유자' : '편집자'}
                              {member.presence && !['소유자', '편집자'].includes(member.presence) ? ` · ${member.presence}` : ''}
                            </Text>
                          </View>
                          {member.id !== runtime.self.id && onOpenParticipants && (
                            <Pressable accessibilityRole="button" accessibilityLabel={`${member.nickname} 메뉴`} style={s.iconButton}
                              disabled={busy} onPress={() => onOpenParticipants(diary, member)}>
                              <Text style={s.bold}>⋯</Text>
                            </Pressable>
                          )}
                        </View>
                      ))}
                      {onOpenParticipants && <Button label="전체 참여자 보기" secondary disabled={busy}
                        onPress={() => onOpenParticipants(diary)} />}
                      {isOwner && diary.members.length > 1 && <Button label="참여자 관리" secondary disabled={busy}
                        onPress={() => { setScreen('members'); setError(''); setToast(''); }} />}
                      {isFull && (
                        <View style={s.notice}>
                          <Text style={s.bold}>소유자 포함 4명이 함께하고 있어요.</Text>
                          <Button label="추가 인원 안내" secondary disabled={busy}
                            onPress={() => setCapacityInfo(value => !value)} />
                          {capacityInfo && <Text style={s.text}>더 많은 인원이 함께하는 유료 이용은 준비 중이에요.</Text>}
                        </View>
                      )}
                      {emailAvailable && <Button label="이메일로 초대" secondary disabled={busy}
                        onPress={() => { setScreen('email'); setError(''); setToast(''); }} />}
                      {(isOwner || mine?.role === 'EDITOR') && (
                        <View style={s.section}>
                          <Text style={s.label}>초대 링크</Text>
                          <View style={s.linkRow}>
                            <View style={s.link}>
                              <View style={s.linkTextContainer}>
                                <Text numberOfLines={1} ellipsizeMode="tail" style={s.linkText}>
                                  {linkExpired ? '만료된 초대 링크예요.' : diary.link || '초대 링크를 만들어 주세요.'}
                                </Text>
                              </View>
                              {diary.link && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="초대 링크 복사"
                                  disabled={busy || linkExpired}
                                  style={s.iconButton}
                                  onPress={() =>
                                    run(
                                      async () => {
                                        if (diary.linkExpiresAt && Date.parse(diary.linkExpiresAt) <= Date.now())
                                          throw new Error('만료된 링크예요. 초대 링크를 다시 만들어 주세요.');
                                        const copied = await Clipboard.setStringAsync(diary.link);
                                        if (copied === false)
                                          throw new Error(
                                            '복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.',
                                          );
                                      },
                                      () => setToast('초대 링크를 복사했어요.'),
                                    )
                                  }
                                >
                                  <Icon name="copy" size={20} />
                                </Pressable>
                              )}
                            </View>
                            <View style={[s.linkActions, diary.link && s.linkActionsCreated]}>
                              {diary.link ? (
                                <>
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="초대 링크 다시 만들기"
                                    disabled={busy || isFull}
                                    style={s.iconButton}
                                    onPress={() =>
                                      run(
                                        () => runtime.createLink(diary.id),
                                        (result) => {
                                          setDiary(result);
                                          setToast(
                                            '이전 링크를 사용할 수 없어요. 새 링크를 복사해 주세요.',
                                          );
                                        },
                                      )
                                    }
                                  >
                                    <Icon name="rotate" size={20} />
                                  </Pressable>
                                </>
                              ) : (
                                <Button
                                  label="초대 링크 만들기"
                                  text="만들기"
                                  disabled={busy || isFull}
                                  onPress={() =>
                                    run(
                                      () => runtime.createLink(diary.id),
                                      (result) => {
                                        setDiary(result);
                                        setToast('초대 링크를 만들었어요.');
                                      },
                                    )
                                  }
                                />
                              )}
                            </View>
                          </View>
                          {!runtime.server && <Text style={s.muted}>
                            {diary.linkExpiresAt
                              ? `만료 ${new Date(diary.linkExpiresAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
                              : '1시간 유효'} · 5분에 최대 3회
                          </Text>}
                        </View>
                      )}
                      {!runtime.server && !diary.localSource && typeof runtime.createPersonalCopy === 'function' &&
                        <Button label="개인 사본 만들기" secondary disabled={busy}
                          onPress={() => { setCopyTitle(defaultCopyTitle(diary.title)); setCreatedCopy(null);
                            setScreen('copy'); setError(''); setToast(''); }} />}
                      {!isOwner && (
                        <Button
                          label="다이어리 참여 해제"
                          secondary
                          danger
                          disabled={busy}
                          onPress={() => setQuestion({ kind: 'leave' })}
                        />
                      )}
                      <Button
                        label={!isOwner && onOpenDiary && runtime.canOpenDiary !== false ? '다이어리 열기' : '완료'}
                        onPress={() => {
                          if (!isOwner && onOpenDiary && runtime.canOpenDiary !== false) onOpenDiary(diary.id);
                          else close();
                        }}
                        disabled={busy}
                      />
                    </>
                  )}
                  {screen === 'copy' && diary && <>
                    <DiarySummary diary={diary} />
                    <Text style={s.muted}>미리보기예요. 사본은 이번 실행에서만 유지돼요.</Text>
                    <Text style={s.label}>사본 이름</Text>
                    <TextInput ref={copyField} accessibilityLabel="개인 사본 이름" value={copyTitle}
                      placeholder="사본 이름" placeholderTextColor={colors.textMuted} maxLength={COPY_TITLE_LIMIT}
                      editable={!busy && !createdCopy} style={s.field}
                      onFocus={() => focusInput(copyField.current)} onBlur={() => blurInput(copyField.current)}
                      onChangeText={value => { setCopyTitle(value); setError(''); }} />
                    {!!copyTitle && !!copyTitleError(copyTitle) && <Text style={s.error}>{copyTitleError(copyTitle)}</Text>}
                    <Text style={s.muted}>원본과 공유 참여는 유지돼요. 사본의 수정 내용은 원본에 반영되지 않아요.</Text>
                    {createdCopy ? <>
                      <Text accessibilityLiveRegion="polite" style={s.text}>개인 사본을 만들었어요.</Text>
                      {onOpenCopy && <Button label="개인 사본 열기" text="사본 열기" disabled={busy}
                        onPress={() => onOpenCopy(createdCopy)} />}
                      <Button label="사본 만들기 완료" text="완료" secondary onPress={back} />
                    </> : <>
                      <Button label="개인 사본 생성" text={busy ? '만드는 중…' : '사본 만들기'}
                        disabled={busy || !!copyTitleError(copyTitle)}
                        onPress={() => { dismissInput(); run(() => runtime.createPersonalCopy(diary.id, copyTitle), setCreatedCopy); }} />
                      <Button label="사본 만들기 취소" text="취소" secondary disabled={busy} onPress={back} />
                    </>}
                  </>}
                  {screen === 'members' && diary && isOwner && <>
                    <DiarySummary diary={diary} />
                    {diary.members.filter(member => member.id !== runtime.self.id).map(member => (
                      <View key={member.id} style={s.notice}>
                        <View style={s.row}>
                          <View style={s.avatar}><MemberAvatar member={member} /></View>
                          <View style={s.grow}>
                            <Text style={s.bold}>{member.nickname}</Text>
                            <Text style={s.muted}>편집자</Text>
                          </View>
                        </View>
                        <View style={s.memberActions}>
                          {typeof runtime.transferOwner === 'function' &&
                            <Button label={`${member.nickname} 소유권 양도`} text="소유권 양도" secondary disabled={busy}
                              style={s.memberActionButton}
                              onPress={() => setQuestion({ kind: 'transfer', member })} />}
                          <Button label={`${member.nickname} 참여 해제`} text="내보내기" secondary danger disabled={busy}
                            style={s.memberActionButton}
                            onPress={() => setQuestion({ kind: 'remove', member })} />
                        </View>
                      </View>
                    ))}
                    <Button label="참여자 관리 완료" text="완료" disabled={busy} onPress={back} />
                  </>}
                  {screen === 'email' && diary && emailAvailable && (
                    <View style={s.body}>
                      {!runtime.server && <Text style={s.muted}>미리보기예요. 실제 이메일은 발송되지 않아요.</Text>}
                      <TextInput ref={emailField} accessibilityLabel="초대할 이메일"
                        placeholder="이메일 주소" placeholderTextColor={colors.textMuted}
                        keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
                        maxLength={254} value={inviteEmail} editable={!busy && emailAvailable && !isFull}
                        onFocus={() => focusInput(emailField.current)} onBlur={() => blurInput(emailField.current)}
                        onChangeText={value => { setInviteEmail(value); setError(''); }}
                        style={s.field} />
                      {!!inviteEmail && !!inviteEmailError(inviteEmail) &&
                        <Text accessibilityLiveRegion="polite" style={s.error}>{inviteEmailError(inviteEmail)}</Text>}
                      <Button label="이메일 초대 보내기" text={busy ? '처리 중…' : '초대 보내기'}
                        disabled={busy || !emailAvailable || isFull || !!inviteEmailError(inviteEmail)}
                        onPress={() => {
                          dismissInput();
                          run(() => runtime.sendEmailInvite(diary.id, inviteEmail), result => {
                            setDiary(result);
                            setInviteEmail('');
                            setToast('가입된 이메일이라면 초대가 전달됩니다.');
                          });
                        }} />
                      {emailAvailable && <>
                        <Text style={s.label}>보낸 초대</Text>
                        {runtime.server && <Button label="보낸 초대 새로고침" text="새로고침" secondary disabled={busy}
                          onPress={() => run(() => runtime.getSharing(diary.id), setDiary)} />}
                        {!!diary.refreshWarning && <Text style={s.muted}>{diary.refreshWarning}</Text>}
                        {!diary.emailInvites?.length && <Text style={s.muted}>보낸 초대가 없어요.</Text>}
                        {diary.emailInvites?.map(row => (
                          <View key={row.id} style={s.sentInvite}>
                            <View style={s.grow}>
                              <Text style={s.bold}>{row.email}</Text>
                              <Text style={s.muted}>{({ PENDING: '수락 대기', CANCELLED: '취소됨', ACCEPTED: '수락됨', DECLINED: '거절됨', DELIVERY_FAILED: '전송 실패' })[row.status] || '처리됨'}</Text>
                            </View>
                            {row.status === 'PENDING' && <Button label={`${row.email} 초대 취소`} text="취소"
                              secondary disabled={busy} onPress={() => setQuestion({ kind: 'cancel-email', inviteId: row.id })} />}
                          </View>
                        ))}
                      </>}
                      {runtime.server && diary.emailNextPage != null && <Button label="보낸 초대 더 보기" text="더 보기" secondary disabled={busy}
                        onPress={() => run(() => runtime.loadMoreEmailInvites(diary.id), setDiary)} />}
                      <Button label="공유 화면으로 돌아가기" text="완료" onPress={back} disabled={busy} />
                    </View>
                  )}

                  {screen === 'invitations' && (
                    <>
                      <View style={s.notificationToolbar}>
                        <Text style={s.invitationsLabel}>받은 초대</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="새로고침"
                          disabled={busy || mutation.status === 'saving' || refreshing}
                          onPress={store.refresh}
                          hitSlop={4}
                          style={[s.toolbarButton, (busy || mutation.status === 'saving' || refreshing) && s.disabled]}
                        >
                          <Icon name="rotate" size={15} color={colors.primaryText} />
                        </Pressable>
                        <View style={s.grow} />
                        {runtime.supportsReadState !== false && <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="모두 읽음"
                          disabled={readAllDisabled}
                          onPress={store.readAll}
                          hitSlop={4}
                          style={[s.toolbarButton, readAllDisabled && s.disabled]}
                        >
                          <Icon name="check" size={18} forText={14} color={colors.primaryText} />
                          <Text style={s.notificationActionText}>모두 읽음</Text>
                        </Pressable>}
                      </View>
                      {/* 처음 불러올 때만 자리표시를 둔다. 새로고침 · 모두 읽음 뒤 다시 불러올 때는 있는 목록을 그대로 둔다 */}
                      {(list.status === 'loading' || list.status === 'idle') && items.length === 0 && (
                        <View accessibilityLabel="받은 초대 불러오는 중" style={s.invitationList}>
                          <View style={s.skeleton} />
                          <View style={s.skeleton} />
                        </View>
                      )}
                      {(list.status === 'error' || count.status === 'error') && (
                        <View>
                          <Text style={s.error}>{list.error?.message || count.error?.message}</Text>
                          <AuthenticationRecovery error={list.error?.status === 401 ? list.error : count.error} />
                          <Button label="받은 초대 다시 시도" secondary onPress={store.refresh} />
                        </View>
                      )}
                      {mutation.status === 'error' && (
                        <View>
                          <Text style={s.error}>{mutation.error.message}</Text>
                          <AuthenticationRecovery error={mutation.error} />
                          <Button
                            label={mutation.canRetry ? '알림 처리 다시 시도' : '알림 오류 닫기'}
                            secondary
                            onPress={
                              mutation.canRetry ? store.retryMutation : store.dismissMutation
                            }
                          />
                        </View>
                      )}
                      {list.status === 'success' && items.length === 0 && (
                        <View style={s.empty}>
                          <Icon name="bell" size={24} color={colors.primary} />
                          <Text style={s.emptyText}>받은 초대가 없어요.</Text>
                        </View>
                      )}
                      {items.length > 0 && <View style={s.invitationList}>
                      {items.map((row) => { const sender = notificationSender(row.actor); return (
                        <View key={row.id} style={[s.invitation, !chipTone(row.status) && s.invitationPast]}>
                          <View style={s.invitationBody}>
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${row.title} 초대 상세`}
                              accessibilityHint={runtime.supportsReadState !== false && !row.readAt ? '안 읽음' : undefined}
                              disabled={busy || mutationLocked}
                              onPress={() => openInviteDetail(row)}
                              style={[s.invitationInfo, s.grow]}
                            >
                              <View
                                style={s.invitationCover}
                                accessibilityLabel={`${row.title} 다이어리 표지`}
                              >
                                <Cover
                                  diary={row.diary || { title: row.title, color: FALLBACK_COVER_COLOR }}
                                  thumbnailWidth={42}
                                  centered
                                />
                              </View>
                              <View style={s.grow}>
                                <View style={s.invitationHead}>
                                  <View style={s.invitationTitleRow}>
                                    <Text style={s.invitationTitle} numberOfLines={1}>
                                      {row.title}
                                    </Text>
                                  </View>
                                  {runtime.supportsReadState !== false && !row.readAt && <View style={s.unreadDot} />}
                                  <View style={[s.statusChip, chipTone(row.status) && s[`statusChip${chipTone(row.status)}`]]}>
                                    <Text style={[s.statusChipText, chipTone(row.status) && s[`statusChipText${chipTone(row.status)}`]]}>{chipLabel(row.status)}</Text>
                                  </View>
                                </View>
                                {Boolean(sender) && <Text style={s.invitationActor} numberOfLines={1}>{`${sender}님의 초대`}</Text>}
                              </View>
                            </Pressable>
                            {!isPhone && invitationActions(row)}
                          </View>
                          {isPhone && invitationActions(row)}
                          {row.status === 'ACCEPTED' && runtime.hasMembership(row.inviteId) && (
                            <Button
                              label={`${row.title} 공유 설정`}
                              secondary
                              disabled={busy}
                              onPress={() =>
                                run(
                                  async () => {
                                    const value = await runtime.invitationGateway.get(row.inviteId);
                                    return runtime.getSharing(value.diary.diaryId);
                                  },
                                  (result) => {
                                    setDiary(result);
                                    setScreen('sharing');
                                  },
                                )
                              }
                            />
                          )}
                        </View>
                      ); })}
                      </View>}
                      {nextCursor && (
                        <Button
                          label="초대 더 보기"
                          secondary
                          disabled={busy || mutationLocked || more.status === 'loading'}
                          onPress={store.loadMore}
                        />
                      )}
                      {more.status === 'error' && <><Text style={s.error}>{more.error.message}</Text><AuthenticationRecovery error={more.error} /></>}
                      <View style={s.linkSection}>
                        <Text style={s.bold}>초대 링크 확인</Text>
                        <View style={s.linkCheck}>
                          <TextInput
                            accessibilityLabel="받은 초대 링크"
                            ref={linkField}
                            onFocus={() => focusInput(linkField.current)}
                            onBlur={() => blurInput(linkField.current)}
                            placeholder="초대 링크를 붙여 넣어 주세요" placeholderTextColor={colors.textMuted}
                            value={linkInput}
                            onChangeText={setLinkInput}
                            editable={!busy}
                            autoCapitalize="none"
                            autoCorrect={false}
                            keyboardType="url"
                            style={[s.field, s.grow]}
                          />
                          <Button
                            label="초대 링크 확인"
                            text="확인"
                            style={s.linkCheckButton}
                            secondary
                            disabled={busy || !linkInput.trim()}
                            onPress={() =>
                              run(
                                () => runtime.resolveLink(linkInput),
                                (value) => {
                                  try {
                                    prepareNickname(value);
                                  } catch (error) {
                                    setError(error.message);
                                  }
                                },
                              )
                            }
                          />
                        </View>
                      </View>
                    </>
                  )}
                  {screen === 'detail' && invite && (
                    <View style={s.detailBody}>
                      <View style={s.invitedDiary}>
                        <View style={s.invitedCover} accessibilityLabel={`${invite.diary.title} 다이어리 표지`}>
                          <Cover diary={invite.diary} thumbnailWidth={144} centered />
                        </View>
                        <Text style={s.invitedTitle}>{invite.diary.title}</Text>
                        {/* 상태 알약: 목록 카드와 같은 규칙(응답 대기 버터 · 참여 완료 라벤더 · 그 밖은 회색 판) */}
                        <View style={[s.statusChip, chipTone(isInviteFull(invite) && invite.status === 'PENDING' ? null : invite.status) && s[`statusChip${chipTone(invite.status)}`]]}>
                          <Text style={[s.statusChipText, !(isInviteFull(invite) && invite.status === 'PENDING') && chipTone(invite.status) && s[`statusChipText${chipTone(invite.status)}`]]}>
                            {isInviteFull(invite) && invite.status === 'PENDING' ? '정원 가득' : chipLabel(invite.status)}
                          </Text>
                        </View>
                        <Text style={s.invitedSender}>{invite.inviter || '다이어리 소유자'}님이 초대했어요.</Text>
                        {Number.isInteger(invite.memberCount) && <Text style={s.invitedCount}>참여 {invite.memberCount}/{MAX_SHARING_MEMBERS}명</Text>}
                      </View>
                      {invite.status !== 'PENDING' || isInviteFull(invite) ? (
                        <Text accessibilityRole="alert" style={s.invitedState}>
                          {isInviteFull(invite) && invite.status === 'PENDING' ? '참여 인원이 가득 찼어요.'
                            : ({ REVOKED: '취소된 초대예요.', EXPIRED: '만료된 초대예요.', ACCEPTED: '이미 수락한 초대예요.', DECLINED: '거절한 초대예요.' })[invite.status] || '사용할 수 없는 초대예요.'}
                        </Text>
                      ) : (
                        <View style={s.invitationActions}>
                          <Button label="상세 초대 삭제" text="삭제" secondary style={[s.cancelParticipation, s.detailDelete]}
                            disabled={busy} onPress={() => setQuestion({ kind: 'decline', inviteId: invite.inviteId, title: invite.diary.title })} />
                          <Button label="참여 프로필 설정" text="수락" style={s.acceptParticipation} disabled={busy}
                            onPress={() => run(() => runtime.invitationGateway.get(invite.inviteId), value => {
                              setInvite(value);
                              if (value.status !== 'PENDING' || isInviteFull(value)) return;
                              prepareNickname(value);
                            })} />
                        </View>
                      )}
                    </View>
                  )}
                  {((screen === 'nickname' && invite) || editingProfile) && (
                    <>
                      <View style={s.invitedDiary}>
                        <View
                          style={s.invitedCover}
                          accessibilityLabel={`${profileDiary.title} 다이어리 표지`}
                        >
                          <Cover diary={profileDiary} small />
                        </View>
                        <Text style={s.invitedTitle}>{profileDiary.title}</Text>
                      </View>
                      <Text style={s.label}>다이어리 닉네임</Text>
                      <View style={s.inputActions}>
                        <Pressable
                          style={s.profileControl}
                          accessibilityRole="button"
                          accessibilityLabel="다이어리 프로필 사진 선택"
                          disabled={busy}
                          onPress={() => {
                            dismissInput();
                            setPhotoMenu(editingProfile ? 'profile' : 'nickname');
                          }}
                        >
                          <MemberAvatar member={{ ...mine, photoUri: draftPhoto, nickname }} />
                          <View style={s.profileEdit}>
                            <Icon name="edit" size={10} />
                          </View>
                        </Pressable>
                        <TextInput
                          accessibilityLabel="다이어리 닉네임"
                          ref={nicknameField}
                          onFocus={() => focusInput(nicknameField.current)}
                          onBlur={() => blurInput(nicknameField.current)}
                          placeholder="닉네임을 입력해 주세요" placeholderTextColor={colors.textMuted}
                          value={nickname}
                          onChangeText={changeNickname}
                          editable={!busy}
                          maxLength={12}
                          autoCorrect={false}
                          autoCapitalize="none"
                          style={[s.field, s.grow]}
                        />
                      </View>
                      {!!nickname && !!sharingNicknameError(nickname) && (
                        <Text style={s.error}>{sharingNicknameError(nickname)}</Text>
                      )}
                      <View style={[s.section, s.invitationActions]}>
                        <Button
                          label={editingProfile ? '프로필 수정 취소' : '닉네임 설정 취소'}
                          text="취소"
                          style={s.cancelParticipation}
                          secondary
                          disabled={busy}
                          onPress={back}
                        />
                        <Button
                          label={editingProfile ? '변경 사항 저장' : '수락하고 참여하기'}
                          style={s.acceptParticipation}
                          disabled={busy || !nicknameReady || !profileChanged}
                          onPress={() => submitParticipation()}
                        />
                      </View>
                    </>
                  )}
                  {busy && screen === 'detail' && !invite && (
                    <View style={s.pageLoading}>
                      <ActivityIndicator accessibilityLabel="초대 불러오는 중" color={colors.primary} />
                    </View>
                  )}
                  {busy && !(screen === 'detail' && !invite) && (
                    <ActivityIndicator
                      accessibilityLabel="공유 요청 처리 중"
                      color={colors.primary}
                    />
                  )}
                  {!!error && (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={s.error}
                    >
                      {error}
                    </Text>
                  )}
                  {!!error && <AuthenticationRecovery error={requestError} />}
                </View>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
        {!!toast && (
          <View pointerEvents="none" style={s.toastPosition}>
            <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={s.toast}>
              {toast}
            </Text>
          </View>
        )}
        {!!photoMenu && (
          <View style={s.photoLayer}>
            <Pressable
              accessible={false}
              style={s.photoBackdrop}
              onPress={() => setPhotoMenu(null)}
            >
              <Pressable
                accessible={false}
                style={s.photoMenu}
                onPress={(event) => event.stopPropagation()}
              >
                <Text accessibilityRole="header" style={s.bold}>
                  다이어리 프로필 사진
                </Text>
                <Button label="다이어리 사진 선택" text="사진 선택" onPress={() => choosePhoto()} />
                <Button
                  label="기본 프로필로 변경"
                  secondary
                  disabled={!draftPhoto}
                  onPress={() => choosePhoto(true)}
                />
                <Button
                  label="사진 설정 취소"
                  text="취소"
                  secondary
                  onPress={() => setPhotoMenu(null)}
                />
              </Pressable>
            </Pressable>
          </View>
        )}
        <ConfirmDialog
          open={!!question}
          title={question?.kind === 'blocked-members' ? '차단한 사용자가 참여 중인 다이어리예요' : question?.kind === 'transfer' ? `${question.member.nickname}님에게 소유권을 양도할까요?` : question?.kind === 'remove' ? `${question.member.nickname}님을 내보낼까요?` : question?.kind === 'cancel-email' ? '보낸 초대를 취소할까요?' : question?.kind === 'decline' ? '초대를 삭제할까요?' : '참여를 해제할까요?'}
          danger={question?.kind !== 'transfer' && question?.kind !== 'blocked-members'}
          message={
            question?.kind === 'blocked-members'
              ? '참여하면 서로의 작업을 보고 함께 편집할 수 있어요. 계속 참여할까요?'
              : question?.kind === 'transfer'
              ? '나는 편집자로 남아요. 참여자 관리 권한은 새 소유자에게 넘어가요.'
              : question?.kind === 'remove'
              ? '이 참여자는 다이어리를 열거나 편집할 수 없어요. 작성한 내용은 남고 기존 초대 링크는 무효화돼요.'
              : question?.kind === 'cancel-email'
              ? '이 초대로는 다이어리에 참여할 수 없어요. 이미 참여한 멤버는 그대로 남아요.'
              : question?.kind === 'decline'
              ? '삭제하면 이 초대로는 다이어리에 참여할 수 없어요.'
              : '참여가 해제되면 이 다이어리를 함께 편집할 수 없어요.'
          }
          confirmLabel={question?.kind === 'blocked-members' ? '계속 참여하기' : question?.kind === 'transfer' ? '양도' : question?.kind === 'remove' ? '내보내기' : question?.kind === 'cancel-email' ? '초대 취소' : question?.kind === 'decline' ? '삭제' : '참여 해제'}
          onConfirm={confirmQuestion}
          onCancel={() => { if (question?.kind === 'blocked-members' && question.stage === 'prepare') setScreen('detail'); setQuestion(null); }}
        />
      </SafeAreaView>
  );
  return embedded ? content : <EditorModal transparent animationType="none" visible onRequestClose={back}>{content}</EditorModal>;
}
