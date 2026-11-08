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
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import EditorModal from '../editor/components/controls/EditorModal';
import ConfirmDialog from '../editor/components/controls/ConfirmDialog';
import Icon from '../editor/components/controls/Icon';
import Cover from '../diary/components/Cover';
import EmptyState from '../diary/components/EmptyState';
import FadeScroll from '../editor/components/controls/FadeScroll';
import { FALLBACK_COVER_COLOR } from '../diary/constants';
import { pickProfilePhoto } from '../auth/profilePhoto';
import MemberAvatar from './MemberAvatar';
import DiaryActionBubble from '../diary/components/DiaryActionBubble';
import { useSafety } from '../safety/SafetyProvider';
import OwnerCrown from './OwnerCrown';
import AuthenticationRecovery from '../auth/AuthenticationRecovery';
import { invitationStatusLabel } from '../notifications/NotificationPanel';
import { notificationSender } from '../notifications/notificationPresentation';
import { colors } from '../shared/theme';
import { useFormFactor } from '../shared/useFormFactor';
import { normalizeSharingNickname, sharingNicknameError, inviteEmailError, MAX_SHARING_MEMBERS, COPY_TITLE_LIMIT, copyTitleError, defaultCopyTitle } from './sharingContracts';
import { sharingStyles as s } from './styles';
import { isSharingDiaryId } from './sharingApi';

// 미리보기 초대는 full 을 채우고, 서버 초대는 참여 인원(memberCount)만 준다
// 초대 링크 만료 시각을 '오후 8:41'로. 기기 Intl 차이(Hermes)에 기대지 않고 직접 만든다
export function expiryClock(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const hour = date.getHours();
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// 지금 쓸 수 있는 초대 링크인가(있고 만료 시각이 지나지 않았다)
function usableLink(diary) {
  return !!diary?.link && !(diary.linkExpiresAt && Date.parse(diary.linkExpiresAt) <= Date.now());
}

function isInviteFull(invite) {
  return invite.full ?? (Number.isInteger(invite.memberCount) && invite.memberCount >= MAX_SHARING_MEMBERS);
}

/** 공유 창 참여자 순서: 나 → 소유자 → 나머지(서버가 준 참여 순서 그대로) */
export function orderMembers(members = [], selfId) {
  const me = members.filter(member => member.id === selfId);
  const owner = members.filter(member => member.id !== selfId && member.role === 'OWNER');
  return [...me, ...owner, ...members.filter(member => member.id !== selfId && member.role !== 'OWNER')];
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
  // 알림 화면 고정 높이 계산용(훅은 이른 return 보다 위에서 늘 같은 순서로 부른다)
  const windowHeight = typeof useWindowDimensions === 'function' ? useWindowDimensions().height : 800;
  const [screen, setScreen] = useState(request?.inviteId ? 'detail' : 'invitations');
  const [diary, setDiary] = useState(null);
  // 방금 초대를 수락한 다이어리: 열기에 실패했거나(프로필 경고 포함) 아직 열지 않았을 때만 '다이어리 열기'로 다시 연다.
  // 이미 연 다이어리에서 연 공유 창에는 맨 아래 버튼이 없다(닫기는 머리줄 X, 2026-11-08 지라 686)
  const [joinedId, setJoinedId] = useState(null);
  // 참여자 ⋯ 말풍선(신고하기 · 차단하기). 참여자 목록 화면으로 옮겨 가지 않는다(2026-11-08 지라 686)
  const [memberMenu, setMemberMenu] = useState(null);
  // 공유 첫 화면 창 높이(다른 화면은 이 높이로 연다)
  const [mainHeight, setMainHeight] = useState(null);
  const memberMore = useRef({});
  const safety = typeof useSafety === 'function' ? useSafety() : null;
  const isBlocked = member => (safety?.state?.status === 'ready' ? safety.state.blocks.some(row => String(row.id) === String(member.id)) : member.blockedByMe === true);
  const openMemberMenu = member => {
    const node = memberMore.current[member.id];
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setMemberMenu({ member, anchor: { x, y, width, height } }));
    else setMemberMenu({ member, anchor: null });
  };
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
    setMainHeight(null); // 다른 다이어리 · 다른 진입이면 높이를 다시 잰다
    setLinkInput('');
    setInviteEmail('');
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
  // A different member can join, leave, or receive ownership while this sheet is open.
  // Subscribe to the runtime store so the visible role and member count follow its refresh.
  useEffect(() => {
    if (!diary?.id || typeof runtime.subscribe !== 'function') return undefined;
    return runtime.subscribe(() => {
      const current = runtime.getSnapshot?.().diaries?.find(value => value.id === diary.id);
      if (current) setDiary(previous => previous?.id === current.id ? { ...previous, members: current.members, ownerId: current.ownerId, myRole: current.myRole } : current);
    });
  }, [diary?.id, runtime]);
  useEffect(() => {
    if (!isSharingDiaryId(diary?.id) || !runtime.server || typeof runtime.watchDiary !== 'function') return undefined;
    return runtime.watchDiary(diary.id, { onUnavailable: setError });
  }, [diary?.id, runtime]);
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
  // 콜드 스타트: 소유자가 공유 창을 열었는데 쓸 수 있는 링크가 없으면(처음 · 만료 — 서버는 만료를 '없음'으로 준다) 바로 하나 만든다.
  // 같은 다이어리 · 같은 링크 상태로는 한 번만 시도하고, 실패는 조용히 둔다('복사'가 다시 만든다). 처리 중 표시 없음(2026-11-08 지라 686)
  const coldLink = useRef('');
  // 콜드 스타트로 만드는 중인 링크(약속). '복사'가 이걸 기다려 링크를 두 번 만들지 않는다(서버는 새 링크를 만들면 이전 링크를 끊는다 — AI 리뷰)
  const coldPending = useRef(null);
  useEffect(() => {
    if (screen !== 'sharing' || !diary || busy || typeof runtime.createLink !== 'function') return;
    const owner = diary.members.some(member => member.id === runtime.self.id && member.role === 'OWNER');
    // 만료는 시각으로 바로 판단한다(만료 상태 값은 한 박자 늦어, 막 만든 링크를 만료로 보고 또 만들었다)
    const usable = usableLink(diary);
    if (!owner || diary.members.length >= MAX_SHARING_MEMBERS || usable || running.current) return;
    const key = `${diary.id}:${diary.link || ''}`;
    if (coldLink.current === key) return;
    coldLink.current = key;
    const id = diary.id;
    const pending = Promise.resolve().then(() => runtime.createLink(id));
    coldPending.current = pending;
    // 늦게 온 응답은 그 사이 쓸 수 있는 링크가 생겼으면(복사 · 다시 만들기) 덮지 않는다
    pending.then(value => { if (alive.current) setDiary(previous => previous?.id === value?.id && !usableLink(previous) ? value : previous); })
      .catch(() => {})
      .finally(() => { if (coldPending.current === pending) coldPending.current = null; });
  }, [screen, diary, busy, linkExpired]); // eslint-disable-line react-hooks/exhaustive-deps -- 만료 시각이 지나면 다시 본다
  const run = async (action, done = () => {}) => {
    if (running.current) return;
    const id = ++job.current;
    running.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await action();
      if (alive.current && id === job.current) await done(result);
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
    if (screen === 'copy') {
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
      // 보던 다이어리가 그대로면 바로 공유 화면으로 돌아가고 최신 정보는 조용히 받아 온다(기다리는 표시 없이)
      const id = request.diary.sharedDiaryId || request.diary.id;
      if (diary?.id === id) {
        setScreen('sharing'); setError('');
        Promise.resolve().then(() => runtime.getSharing(id))
          .then(value => { if (alive.current) setDiary(previous => previous?.id === value?.id ? value : previous); })
          .catch(() => {});
        return;
      }
      run(
        () => runtime.getSharing(id),
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
    if (current.kind === 'relink') {
      run(() => runtime.createLink(diary.id), result => { setDiary(result); setToast('초대 링크를 다시 만들었어요.'); });
      return;
    }
    if (current.kind === 'block' || current.kind === 'unblock') {
      run(
        () => current.kind === 'block' ? safety.store.block(current.member, diary.sharedDiaryId || diary.id) : safety.store.unblock(current.member),
        () => setToast(current.kind === 'block' ? '사용자를 차단했어요' : '차단을 해제했어요'),
      );
      return;
    }
    if (current.kind === 'blocked-members') {
      setBlockedAcknowledged(true);
      if (current.stage === 'retry') submitParticipation(true);
      return;
    }
    if (current.kind === 'decline')
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
  // 카드 아래(폰) · 오른쪽(태블릿) 버튼 줄: 삭제 · 수락. 끝난 초대는 수락 없이 삭제(알림 삭제).
  // 초대 상세는 카드(표지 · 제목)를 누르면 열린다 — 따로 '더보기 ›'를 두지 않는다(초대장 멘트를 지운 뒤 상세에 더 볼 것이 적어, 2026-11-01 논의 · 2026-11-08 지라 686)
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
  const emailAvailable = typeof runtime.sendEmailInvite === 'function' && isOwner; // 이메일 초대도 소유자만(2026-11-08 지라 686)
  const nicknameReady = !sharingNicknameError(nickname);
  const editingProfile = screen === 'profile';
  // 공유 정보(서버)에는 방향 · 속지 설정이 없어, 이 기기 보관함의 다이어리가 있으면 그 표지 설정을 이어 받아 보관함 카드와 같은 표지로 그린다
  const profileDiary = editingProfile
    ? (diary && request?.diary ? { ...diary, cover: diary.cover ?? request.diary.cover, pageSize: request.diary.pageSize, templateConfig: request.diary.templateConfig } : diary)
    : invite?.diary;
  const profileChanged =
    !editingProfile ||
    normalizeSharingNickname(nickname) !== mine?.nickname ||
    draftPhoto !== (mine?.photoUri || null);
  const submitParticipation = (acknowledge = blockedAcknowledged) => {
    if (!nicknameReady) return;
    run(() => editingProfile
      ? runtime.updateProfile(diary.id, { nickname, photoUri: draftPhoto })
      : runtime.accept(invite.inviteId, nickname, { photoUri: draftPhoto, ...(acknowledge === true ? { acknowledgeBlockedMembers: true } : {}) }),
      async result => {
        dismissInput(); setDiary(result); setScreen('sharing'); store.refresh();
        if (!editingProfile) setJoinedId(result.id);
        setToast(result.profileWarning || (editingProfile ? '다이어리 프로필을 변경했어요.' : '다이어리에 참여했어요.'));
        if (!editingProfile && !result.profileWarning && onOpenDiary && runtime.canOpenDiary !== false) {
          await onOpenDiary(result.id);
        }
      });
  };
  // 창 높이 고정(2026-11-08 지라 686): 같은 창 안에서 화면을 옮겨도 높이가 바뀌지 않게, 공유 첫 화면의 높이를 재 두고
  // 알림 · 프로필 수정 · 초대 상세 등 다른 화면은 그 높이 이상으로 연다(짧으면 같은 높이에 아래가 비고, 아래 묶음은 pinBottom 으로 끝에 붙는다).
  // 창 안 겹 스크롤은 쓰지 않는다 — 안드로이드에서 안쪽 스크롤이 손가락을 못 받아 아래가 잘렸다. 더 긴 화면은 바깥 스크롤로 내린다.
  // 공유 첫 화면을 거치지 않고 연 창(홈 알림에서 바로 연 초대 등)은 재 둔 높이가 없어 내용 높이 그대로
  const lockedHeight = screen !== 'sharing' && mainHeight ? mainHeight : null;
  // 알림 화면은 높이를 '고정'해야 목록만 스크롤된다. 공유 첫 화면을 거치지 않았으면 화면 높이에 맞춘 높이
  const fixedHeight = screen === 'invitations' ? (lockedHeight || Math.min(Math.max(windowHeight - 96, 360), 720)) : null;
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
                style={[s.card, isPhone && s.phoneCard, fixedHeight ? { height: fixedHeight } : lockedHeight && { minHeight: lockedHeight }]}
                onLayout={screen === 'sharing' ? event => { const height = Math.round(event.nativeEvent.layout.height); if (height > 0) setMainHeight(previous => (previous === height ? previous : height)); } : undefined}
                onPress={(event) => event.stopPropagation()}
              >
                <View style={s.header}>
                  {/* 알림 화면도 다이어리 공유 창에서 들어왔으면 ‹ 로 공유 창에 돌아간다(X 는 창 전체를 닫는다, 2026-11-08 지라 686) */}
                  {screen !== 'sharing' && (screen !== 'invitations' || !!request?.diary) && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="이전 공유 화면"
                      onPress={back}
                      disabled={busy}
                      style={[s.iconButton, s.edgeIconLeft]}
                    >
                      <Icon name="chevronLeft" size={20} />
                    </Pressable>
                  )}
                  <Text accessibilityRole="header" numberOfLines={1} style={s.title}>
                    {screen === 'sharing'
                      ? '다이어리 공유'
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
                  {/* 알림 화면의 새로고침은 머리줄 오른쪽(X 왼쪽)에. 도구 줄 왼쪽에 아이콘만 덩그러니 있던 것(2026-11-08 지라 686, 코덱스) */}
                  {screen === 'invitations' && <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="새로고침"
                    disabled={busy || mutation.status === 'saving' || refreshing}
                    onPress={store.refresh}
                    style={[s.iconButton, (busy || mutation.status === 'saving' || refreshing) && s.disabled]}
                  >
                    <Icon name="rotate" size={17} color={colors.text} />
                  </Pressable>}
                  {/* 알림은 머리줄 X 왼쪽 종 아이콘(새 초대가 있으면 빨간 점). 큰 알림 박스를 두지 않는다 — 노션 · 디스코드 공유 창처럼
                      제목 · 목록 · 초대만 남긴다(2026-11-08 지라 686, 코덱스). 수 · 상태는 접근성 이름이 말한다 */}
                  {screen === 'sharing' && diary && <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`알림, ${noticeState}`}
                    disabled={busy}
                    onPress={() => {
                      setScreen('invitations');
                      setError('');
                      store.refresh();
                    }}
                    style={s.iconButton}
                  >
                    <Icon name="bell" size={20} color={colors.text} />
                    {countValue > 0 && <View testID="sharing-notice-dot" style={s.headerDot} />}
                  </Pressable>}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="공유 창 닫기"
                    onPress={close}
                    disabled={busy}
                    style={[s.iconButton, s.edgeIcon]}
                  >
                    <Icon name="close" size={20} />
                  </Pressable>
                </View>
                <View style={[s.body, fixedHeight ? s.bodyFixed : lockedHeight && s.bodyFill]}>
                  {screen === 'sharing' && diary && (
                    <>
                      {/* 다이어리 제목 칸은 두지 않는다 — 편집기에서 연 공유 창이라 어느 다이어리인지 이미 보인다(2026-11-08 지라 686) */}
                      {!!diary.refreshWarning && <View style={s.notice}><Text style={s.muted}>{diary.refreshWarning}</Text>
                        <Button label="공유 정보 새로고침" text="새로고침" secondary disabled={busy}
                          onPress={() => run(() => runtime.getSharing(diary.id), setDiary)} /></View>}
                      {/* 함께하는 사람(2026-11-08 지라 686): 구글 문서 공유 창의 '액세스 권한이 있는 사람'처럼 나 → 소유자 → 나머지(참여 순서).
                          프로필 동그라미는 모두 같은 크기, 소유자는 오른쪽 아래 금색 왕관. 내 줄 오른쪽은 프로필 수정, 다른 사람은 ⋯(신고 · 차단).
                          '참여자 관리'(소유자)는 머리줄 오른쪽 글자 버튼, 인원이 가득 찬 것은 '4/4명'이 말한다(따로 안내 줄 · 전체 참여자 보기 버튼 없음) */}
                      <View style={s.row}>
                        <Text style={[s.inviteHeadText, s.grow]}>함께 편집하는 사람</Text>
                        <Text style={s.muted}>{diary.members.length}/{MAX_SHARING_MEMBERS}명</Text>
                      </View>
                      {orderMembers(diary.members, runtime.self.id).map((member) => (
                        <View key={member.id} style={s.participant}>
                          <View style={s.avatar}>
                            <View style={s.avatarClip}><MemberAvatar member={member} /></View>
                            {member.role === 'OWNER' && <OwnerCrown />}
                          </View>
                          <View style={s.grow}>
                            <Text style={s.bold}>
                              {member.nickname}
                              {member.id === runtime.self.id ? ' · 나' : ''}
                            </Text>
                            {/* 역할 글자는 소유자만. 보기 전용 참여자가 없어 모두 편집자라 '편집자'는 적지 않는다. 이메일은 보이지 않는다(2026-11-08 지라 686) */}
                            {(member.role === 'OWNER' || (member.presence && !['소유자', '편집자'].includes(member.presence))) && <Text style={s.muted}>
                              {[member.role === 'OWNER' && '소유자', member.presence && !['소유자', '편집자'].includes(member.presence) && member.presence].filter(Boolean).join(' · ')}
                            </Text>}
                          </View>
                          {member.id === runtime.self.id ? (
                            <Pressable accessibilityRole="button" accessibilityLabel="이 다이어리 프로필 수정" style={[s.iconButton, s.edgeIcon]}
                              disabled={busy} onPress={prepareProfile}>
                              <Icon name="edit" size={20} color={colors.text} />
                            </Pressable>
                          ) : (onOpenParticipants || isOwner) ? (
                            <Pressable ref={node => { memberMore.current[member.id] = node; }} accessibilityRole="button" accessibilityLabel={`${member.nickname} 메뉴`}
                              accessibilityState={{ expanded: memberMenu?.member.id === member.id }} style={[s.iconButton, s.edgeIcon]}
                              disabled={busy} onPress={() => openMemberMenu(member)}>
                              <Icon name="more" size={22} color={colors.text} />
                            </Pressable>
                          ) : null}
                        </View>
                      ))}
                      {isOwner && (() => {
                        // 초대 구역(2026-11-08 지라 686 — 노션 공유 창 참고, 사용자 배치): 위에서부터
                        //  '이메일 주소로 초대' → [이메일 주소 칸][초대] → '초대 링크로 초대' + 새로고침(다시 만들기, 확인창) → [초대 링크 칸][복사] → 상태 한 줄
                        //  - 두 버튼은 칸 밖 같은 크기(48 · 폭 72)로 오른쪽 끝을 맞춘다. 초대는 채운 버튼(보내는 동작), 복사는 테두리 버튼
                        //  - 보낸 초대 목록 화면은 두지 않는다(이메일 초대는 7일 뒤 저절로 만료). 링크는 소유자만 복사 · 다시 만들기
                        //  - 소유자가 창을 열 때 쓸 수 있는 링크가 없으면 바로 하나 만든다(콜드 스타트). 그래도 없으면 '복사'가 새로 만들어 복사한다. 상태 줄은 늘 자리를 두고 정원 가득 / 만료 시각 / 만료됨만 적는다
                        const canLink = isOwner;
                        const emailReady = !inviteEmailError(inviteEmail);
                        // 만료는 시각으로 바로 판단한다(linkExpired 는 만료 시각에 다시 그리게 하는 신호로만 쓴다 — 한 박자 늦어 새 링크가 잠깐 자리표시로 깜빡였다)
                        const linkReady = usableLink(diary);
                        const copyLink = () => run(async () => {
                          let current = diary;
                          // 콜드 스타트로 만드는 중이면 그 결과를 기다려 쓴다
                          if (!usableLink(current) && coldPending.current) current = await coldPending.current.catch(() => current);
                          if (!usableLink(current)) {
                            current = await runtime.createLink(diary.id);
                            // 복사가 실패해도 새로 만든 링크는 칸에 보이게 먼저 반영한다(다시 누르면 만들지 않고 복사만)
                            if (alive.current) setDiary(previous => previous?.id === current?.id ? current : previous);
                          }
                          const copied = await Clipboard.setStringAsync(current.link);
                          if (copied === false) throw new Error('복사하지 못했어요. 다시 시도해 주세요.');
                          return current;
                        }, result => { setDiary(result); setToast('초대 링크를 복사했어요.'); });
                        const sendEmail = () => {
                          dismissInput();
                          run(() => runtime.sendEmailInvite(diary.id, inviteEmail), result => {
                            setDiary(result);
                            setInviteEmail('');
                            setToast('가입된 이메일이라면 초대가 전달됩니다.');
                          });
                        };
                        return (
                        <View style={s.section}>
                          {emailAvailable && <View style={[s.inviteLinkHead, s.inviteFirstHead]}>
                            <Text style={[s.inviteHeadText, s.grow]}>이메일 주소로 초대</Text>
                          </View>}
                          {emailAvailable && <View style={s.inviteEmailRow}>
                            <TextInput ref={emailField} accessibilityLabel="초대할 이메일"
                              placeholder="이메일 주소" placeholderTextColor={colors.textMuted}
                              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} returnKeyType="send"
                              maxLength={254} value={inviteEmail} editable={!busy && !isFull}
                              onFocus={() => focusInput(emailField.current)} onBlur={() => blurInput(emailField.current)}
                              onChangeText={value => { setInviteEmail(value); setError(''); }}
                              onSubmitEditing={() => { if (!busy && !isFull && emailReady) sendEmail(); }}
                              style={[s.field, s.grow, isFull && s.disabled]} />
                            <Pressable accessibilityRole="button" accessibilityLabel="이메일 초대 보내기"
                              accessibilityState={{ disabled: busy || isFull || !emailReady }} disabled={busy || isFull || !emailReady}
                              onPress={sendEmail} style={[s.inviteEmailButton, (busy || isFull || !emailReady) && s.disabled]}>
                              <Text style={s.inviteFieldButtonText}>초대</Text>
                            </Pressable>
                          </View>}
                          {canLink && <>
                            {/* '초대 링크로 초대' + 오른쪽 새로고침(다시 만들기 → 확인창). 줄 높이는 아이콘이 꺼져도 그대로 */}
                            <View style={s.inviteLinkHead}>
                              <Text style={[s.inviteHeadText, s.grow]}>초대 링크로 초대</Text>
                              <Pressable accessibilityRole="button" accessibilityLabel="초대 링크 다시 만들기"
                                accessibilityState={{ disabled: busy || isFull || !linkReady }} disabled={busy || isFull || !linkReady}
                                onPress={() => setQuestion({ kind: 'relink' })} style={[s.iconButton, s.inviteRelink, (busy || isFull || !linkReady) && s.disabled]}>
                                <Icon name="rotate" size={17} color={colors.text} />
                              </Pressable>
                            </View>
                            <View style={s.inviteEmailRow}>
                              <View style={[s.field, s.grow, s.inviteLinkBox, isFull && s.disabled]}>
                                <Text numberOfLines={1} ellipsizeMode="tail" style={[s.inviteFieldText, !linkReady && s.inviteFieldPlaceholder]}>
                                  {linkReady ? diary.link : '초대 링크'}
                                </Text>
                              </View>
                              <Pressable accessibilityRole="button" accessibilityLabel="초대 링크 복사"
                                accessibilityState={{ disabled: busy || isFull }} disabled={busy || isFull}
                                onPress={copyLink} style={[s.inviteCopyButton, (busy || isFull) && s.disabled]}>
                                <Text style={s.inviteCopyButtonText}>복사</Text>
                              </Pressable>
                            </View>
                          </>}
                          {/* 상태 한 줄은 늘 자리를 둔다(비어 있어도) — 상태가 바뀌어도 창 높이가 그대로다 */}
                          <Text numberOfLines={1} style={[s.muted, s.inviteStatus]}>
                            {isFull ? '정원이 다 차서 더 초대할 수 없어요.'
                              : !canLink ? ''
                              : linkReady && diary.linkExpiresAt ? `초대 링크가 ${expiryClock(diary.linkExpiresAt)}에 만료돼요.`
                              : diary.link && !linkReady ? '초대 링크가 만료됐어요.' : ''}
                          </Text>
                        </View>
                        );
                      })()}
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
                      {/* 맨 아래 '완료'는 두지 않는다 — 닫기는 머리줄 X 가 맡는다(완료는 창을 닫을 뿐이었다, 2026-11-08 지라 686).
                          방금 초대를 수락한 다이어리에서 열기에 실패했을 때만 '다이어리 열기'로 다시 연다 */}
                      {joinedId === diary.id && onOpenDiary && runtime.canOpenDiary !== false && <Button
                        label="다이어리 열기"
                        onPress={() => run(() => onOpenDiary(diary.id))}
                        disabled={busy}
                      />}
                      {/* 참여자 ⋯ 말풍선: 소유자는 소유권 양도 · 내보내기, 누구나 신고하기 · 차단하기(따로 '참여자 관리' 화면 없음, 2026-11-08 지라 686) */}
                      {memberMenu && <DiaryActionBubble anchor={memberMenu.anchor} title={memberMenu.member.nickname} onClose={() => setMemberMenu(null)} actions={[
                        isOwner && typeof runtime.transferOwner === 'function' && { id: 'transfer', icon: 'crown', text: '소유권 양도', label: `${memberMenu.member.nickname} 소유권 양도`,
                          onPress: () => { const member = memberMenu.member; setMemberMenu(null); setQuestion({ kind: 'transfer', member }); } },
                        isOwner && { id: 'remove', icon: 'user-minus', danger: true, text: '내보내기', label: `${memberMenu.member.nickname} 내보내기`,
                          onPress: () => { const member = memberMenu.member; setMemberMenu(null); setQuestion({ kind: 'remove', member }); } },
                        onOpenParticipants && { id: 'report', icon: 'flag', text: '신고하기', label: `${memberMenu.member.nickname} 신고하기`,
                          onPress: () => { const member = memberMenu.member; setMemberMenu(null); onOpenParticipants(diary, member, 'report'); } },
                        safety?.store && memberMenu.member.activeAccount !== false && { id: 'block', icon: 'ban', danger: !isBlocked(memberMenu.member), text: isBlocked(memberMenu.member) ? '차단 해제' : '차단하기',
                          label: `${memberMenu.member.nickname} ${isBlocked(memberMenu.member) ? '차단 해제' : '차단하기'}`,
                          disabled: safety.state?.status !== 'ready',
                          onPress: () => { const member = memberMenu.member; setMemberMenu(null); setQuestion({ kind: isBlocked(member) ? 'unblock' : 'block', member }); } },
                      ].filter(Boolean)} />}
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

                  {screen === 'invitations' && (
                    <>
                      {/* 읽음 상태가 있는 런타임만 도구 줄(받은 초대 · 모두 읽음). 서버는 읽음 상태가 없어 줄째 두지 않는다 — 화면 제목 '알림'이 목록을 말한다 */}
                      {runtime.supportsReadState !== false && <View style={s.notificationToolbar}>
                        <Text style={s.invitationsLabel}>받은 초대</Text>
                        <View style={s.grow} />
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="모두 읽음"
                          disabled={readAllDisabled}
                          onPress={store.readAll}
                          hitSlop={6}
                          style={[s.toolbarButton, readAllDisabled && s.disabled]}
                        >
                          <Icon name="check" size={18} forText={14} color={colors.primaryText} />
                          <Text style={s.notificationActionText}>모두 읽음</Text>
                        </Pressable>
                      </View>}
                      {/* 알림 목록만 창 안에서 스크롤하고 아래 '초대 링크 확인'은 그대로 둔다(알림이 많을 때, 2026-11-08 지라 686).
                          알림 화면은 창 높이를 고정(공유 첫 화면 높이, 없으면 화면 높이에 맞춤)해 목록 칸이 남는 높이를 채운다 */}
                      {/* 더 넘겨 볼 알림이 있으면 위 · 아래 끝에 앱 공통 흰 그라데이션(FadeScroll) */}
                      <FadeScroll testID="sharing-invitations-scroll" style={s.invitationScroll} contentContainerStyle={s.invitationScrollContent}
                        nestedScrollEnabled keyboardShouldPersistTaps="handled">
                        {/* 불러오는 동안 자리표시(빈 네모) · 도넛을 두지 않는다 — 새로고침 때마다 빈 네모 둘이 깜빡였다(2026-11-08).
                            처음 열 때는 잠깐 비어 있고, 새로고침 · 모두 읽음 뒤에는 이전 결과(목록 · 빈 화면)를 그대로 둔다. 화면 읽기에는 불러오는 중을 알린다 */}
                        {(list.status === 'loading' || list.status === 'idle') && !list.data && (
                          <View accessible accessibilityRole="progressbar" accessibilityLabel="받은 초대 불러오는 중" accessibilityState={{ busy: true }} style={s.emptyFill} />
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
                        {items.length === 0 && list.data && list.status !== 'error' && (
                          // 빈 알림: 홈 알림 창과 같은 디오 빈 화면(compact, 지라 661 · 2026-11-08), 위아래 남는 자리 가운데에
                          <View testID="sharing-invitations-empty" style={s.emptyFill}>
                            <EmptyState compact small={isPhone} art="dio" title="받은 초대가 없어요" />
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
                      </FadeScroll>
                      {/* 초대 링크 확인은 창 아래에 고정(목록이 길어도 움직이지 않는다) */}
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
                      {/* 초대 수락(닉네임 설정)은 어느 다이어리에 들어가는지 표지 · 제목을 크게 보이고,
                          이미 함께하는 다이어리의 프로필 수정은 표지 없이 다이어리 이름 한 줄만(2026-11-08 지라 686, 코덱스) */}
                      {editingProfile ? (
                        <View style={s.profileDiaryLine}>
                          <Text style={s.label}>다이어리</Text>
                          <Text numberOfLines={1} style={s.profileDiaryName}>{profileDiary?.title}</Text>
                        </View>
                      ) : (
                      <View style={s.invitedDiary}>
                        <View
                          style={s.invitedCover}
                          accessibilityLabel={`${profileDiary.title} 다이어리 표지`}
                        >
                          <Cover diary={profileDiary} small />
                        </View>
                        <Text style={s.invitedTitle}>{profileDiary.title}</Text>
                      </View>
                      )}
                      <Text style={s.label}>다이어리 프로필</Text>
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
                      <View style={[s.section, s.invitationActions, s.pinBottom]}>
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
                          text={editingProfile ? '저장' : undefined}
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
                  {/* 처리 중 도넛은 두지 않는다 — 알림 → 공유 창 복귀 · 프로필 저장 때 창 아래에 떠 들썩였다(2026-11-08 지라 686).
                      처리 중에는 버튼이 꺼지는 것으로 충분하다. 초대 상세를 처음 불러올 때만 가운데 표시 */}
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
          title={question?.kind === 'blocked-members' ? '차단한 사용자가 참여 중인 다이어리예요' : question?.kind === 'transfer' ? `${question.member.nickname}님에게 소유권을 양도할까요?` : question?.kind === 'remove' ? `${question.member.nickname}님을 내보낼까요?` : question?.kind === 'decline' ? '초대를 삭제할까요?' : question?.kind === 'relink' ? '초대 링크를 다시 만들까요?' : question?.kind === 'block' ? `${question.member.nickname}님을 차단할까요?` : question?.kind === 'unblock' ? `${question.member.nickname}님의 차단을 해제할까요?` : '참여를 해제할까요?'}
          danger={question?.kind !== 'transfer' && question?.kind !== 'blocked-members' && question?.kind !== 'unblock' && question?.kind !== 'relink'}
          message={
            question?.kind === 'blocked-members'
              ? '참여하면 서로의 작업을 보고 함께 편집할 수 있어요. 계속 참여할까요?'
              : question?.kind === 'transfer'
              ? '나는 편집자로 남아요. 참여자 관리 권한은 새 소유자에게 넘어가요.'
              : question?.kind === 'remove'
              ? '이 참여자는 다이어리를 열거나 편집할 수 없어요. 작성한 내용은 남고 기존 초대 링크는 무효화돼요.'
              : question?.kind === 'decline'
              ? '삭제하면 이 초대로는 다이어리에 참여할 수 없어요.'
              : question?.kind === 'relink'
              ? '이전 초대 링크는 쓸 수 없게 돼요.'
              : question?.kind === 'block'
              ? '서로 이메일 초대를 보내거나 수락할 수 없어요.\n이미 함께하는 다이어리와 공동 작업은 그대로 유지돼요. 링크로는 안내를 확인한 뒤 다시 함께 참여할 수 있어요.'
              : question?.kind === 'unblock'
              ? '서로 이메일 초대를 주고받거나 수락할 수 있게 돼요. 유효한 대기 초대도 다시 수락할 수 있어요.'
              : '참여가 해제되면 이 다이어리를 함께 편집할 수 없어요.'
          }
          confirmLabel={question?.kind === 'blocked-members' ? '계속 참여하기' : question?.kind === 'transfer' ? '양도' : question?.kind === 'remove' ? '내보내기' : question?.kind === 'decline' ? '삭제' : question?.kind === 'relink' ? '다시 만들기' : question?.kind === 'block' ? '차단하기' : question?.kind === 'unblock' ? '차단 해제' : '참여 해제'}
          onConfirm={confirmQuestion}
          onCancel={() => { if (question?.kind === 'blocked-members' && question.stage === 'prepare') setScreen('detail'); setQuestion(null); }}
        />
      </SafeAreaView>
  );
  return embedded ? content : <EditorModal transparent animationType="none" visible onRequestClose={back}>{content}</EditorModal>;
}
