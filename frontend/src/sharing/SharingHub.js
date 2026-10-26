import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Switch,
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
import { pickProfilePhoto } from '../auth/profilePhoto';
import MemberAvatar from './MemberAvatar';
import { invitationStatusLabel } from '../notifications/NotificationPanel';
import { colors } from '../shared/theme';
import { useFormFactor } from '../shared/useFormFactor';
import { normalizeSharingNickname, sharingNicknameError } from './sharingPreview';
import { sharingStyles as s } from './styles';

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
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        (disabled || pressed) && s.disabled,
        style,
      ]}
    >
      <Text style={[s.buttonText, secondary && s.secondaryText, danger && s.dangerText]}>
        {text}
      </Text>
    </Pressable>
  );
}
function DiarySummary({ diary }) {
  return (
    <View style={s.summary}>
      <Icon name="book" size={20} />
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
  photoPicker = pickProfilePhoto,
}) {
  const { isPhone } = useFormFactor();
  const [screen, setScreen] = useState('invitations');
  const [diary, setDiary] = useState(null);
  const [invite, setInvite] = useState(null);
  const [nickname, setNickname] = useState('');
  const [draftPhoto, setDraftPhoto] = useState(null);
  const [photoMenu, setPhotoMenu] = useState(null);
  const [checked, setChecked] = useState(null);
  const [checking, setChecking] = useState(false);
  const [nicknameMessage, setNicknameMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState(null);
  const [toast, setToast] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const job = useRef(0),
    checkJob = useRef(0),
    running = useRef(false),
    checkRunning = useRef(false);
  const alive = useRef(true);
  const nicknameField = useRef(null);
  const linkField = useRef(null);
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
  const mutationLocked = mutation.status === 'saving' || mutation.canRetry;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      job.current++;
      checkJob.current++;
    };
  }, []);
  useEffect(() => {
    job.current++;
    checkJob.current++;
    running.current = false;
    checkRunning.current = false;
    setBusy(false);
    setError('');
    setToast('');
    setQuestion(null);
    setPhotoMenu(null);
    setDraftPhoto(null);
    setChecked(null);
    setChecking(false);
    setNicknameMessage('');
    setInvite(null);
    setLinkInput('');
    focusedInput.current = null;
    clearTimeout(focusTimer.current);
    if (!request) return;
    dismissInput();
    if (request.diary) {
      try {
        setDiary(runtime.registerDiary(request.diary));
        setScreen('sharing');
      } catch (error) {
        setError(error.message);
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
      if (alive.current && id === job.current)
        setError(error.message || '처리하지 못했어요. 다시 시도해 주세요.');
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
    if (screen === 'nickname' || screen === 'profile') {
      checkJob.current++;
      checkRunning.current = false;
      setChecking(false);
      setScreen(screen === 'profile' ? 'sharing' : 'invitations');
      setChecked(null);
      setNicknameMessage('');
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
    dismissInput();
    checkJob.current++;
    setInvite(value);
    setNickname(runtime.self.nickname);
    setDraftPhoto(runtime.self.photoUri || null);
    setChecked(null);
    setNicknameMessage('');
    setScreen('nickname');
  };
  const prepareProfile = () => {
    const current = diary.members.find((member) => member.id === runtime.self.id);
    dismissInput();
    checkJob.current++;
    checkRunning.current = false;
    setNickname(current.nickname);
    setDraftPhoto(current.photoUri || null);
    setChecked(normalizeSharingNickname(current.nickname));
    setChecking(false);
    setNicknameMessage('');
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
          setError(error.message);
        }
      },
    );
  const changeNickname = (value) => {
    checkJob.current++;
    checkRunning.current = false;
    setNickname(value);
    setChecked(null);
    setChecking(false);
    setNicknameMessage('');
    setError('');
  };
  const checkNickname = async () => {
    if (checkRunning.current || running.current || sharingNicknameError(nickname)) return;
    const id = ++checkJob.current,
      value = normalizeSharingNickname(nickname);
    checkRunning.current = true;
    setChecked(null);
    setChecking(true);
    setNicknameMessage('');
    try {
      const result =
        screen === 'profile'
          ? await runtime.checkProfileNickname(diary.id, value)
          : await runtime.checkNickname(invite.inviteId, value);
      if (alive.current && id === checkJob.current) {
        setChecked(result);
        setNicknameMessage('사용할 수 있는 닉네임이에요.');
      }
    } catch (error) {
      if (alive.current && id === checkJob.current) setNicknameMessage(error.message);
    } finally {
      if (alive.current && id === checkJob.current) {
        checkRunning.current = false;
        setChecking(false);
      }
    }
  };
  const confirmQuestion = () => {
    const current = question;
    setQuestion(null);
    if (current.kind === 'decline')
      run(
        () => runtime.decline(current.inviteId),
        () => {
          store.refresh();
          setToast('초대를 거절했어요.');
        },
      );
    else if (current.kind === 'remove')
      run(
        () => runtime.removeMember(diary.id, current.member.id),
        (result) => {
          setDiary(result);
          setToast('참여를 해제했어요.');
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
  const invitationActions = (row) => (
    <View style={s.invitationActionsRow}>
      <Button
        label={`${row.title} 초대 거절`}
        text="거절"
        style={isPhone ? s.phoneInvitationButton : undefined}
        secondary
        disabled={busy || mutationLocked}
        onPress={() => setQuestion({ kind: 'decline', inviteId: row.inviteId, title: row.title })}
      />
      <Button
        label={`${row.title} 초대 수락`}
        text="수락"
        style={isPhone ? s.phoneInvitationButton : undefined}
        disabled={busy || mutationLocked}
        onPress={() => openInvite(row)}
      />
    </View>
  );
  if (!request) return null;
  const mine = diary?.members.find((member) => member.id === runtime.self.id);
  const isOwner = mine?.role === 'OWNER';
  const nicknameReady =
    checked === normalizeSharingNickname(nickname) && !sharingNicknameError(nickname) && !checking;
  const editingProfile = screen === 'profile';
  const profileDiary = editingProfile ? diary : invite?.diary;
  const profileChanged =
    !editingProfile ||
    normalizeSharingNickname(nickname) !== mine?.nickname ||
    draftPhoto !== (mine?.photoUri || null);
  return (
    <EditorModal transparent animationType="fade" visible onRequestClose={back}>
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
                  {screen !== 'sharing' && (
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
                  <Text accessibilityRole="header" style={s.title}>
                    {screen === 'sharing'
                      ? '다이어리 공유'
                      : screen === 'profile'
                        ? isPhone
                          ? '프로필 수정'
                          : '다이어리 프로필 수정'
                        : screen === 'nickname'
                          ? isPhone
                            ? '프로필 설정'
                            : '다이어리 프로필 설정'
                          : '다른 다이어리 공유 알림'}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="공유 창 닫기"
                    onPress={close}
                    disabled={busy}
                    style={s.iconButton}
                  >
                    <Icon name="close" size={18} />
                  </Pressable>
                </View>
                <View style={s.body}>
                  {screen === 'sharing' && diary && (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="받은 초대 목록 열기"
                        disabled={busy}
                        onPress={() => {
                          setScreen('invitations');
                          setError('');
                          store.refresh();
                        }}
                        style={s.banner}
                      >
                        <Icon name="bell" size={18} />
                        <View style={s.grow}>
                          <Text style={s.bold}>다른 다이어리 공유 알림</Text>
                          <Text style={s.muted}>
                            {countValue
                              ? `새 초대 ${countValue}개를 확인해 보세요.`
                              : '받은 초대를 확인해 보세요.'}
                          </Text>
                        </View>
                        <Icon name="chevronRight" size={18} />
                      </Pressable>
                      <DiarySummary diary={diary} />
                      <View style={s.row}>
                        <Text style={[s.label, s.grow]}>함께 편집하는 사람</Text>
                        <Text style={s.muted}>{diary.members.length}명</Text>
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
                            <Text style={s.muted}>{member.presence}</Text>
                          </View>
                          {isOwner && member.role !== 'OWNER' ? (
                            <View style={s.wrap}>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`${member.nickname} 참여 해제`}
                                disabled={busy}
                                onPress={() => setQuestion({ kind: 'remove', member })}
                                style={s.iconButton}
                              >
                                <Icon name="close" size={16} />
                              </Pressable>
                            </View>
                          ) : (
                            <Text style={s.muted}>
                              {member.role === 'OWNER' ? '소유자' : '함께 편집'}
                            </Text>
                          )}
                        </View>
                      ))}
                      {isOwner && (
                        <View style={s.section}>
                          <Text style={s.label}>초대 링크</Text>
                          <View style={s.linkRow}>
                            <View style={s.link}>
                              <Text selectable numberOfLines={1} style={[s.text, s.grow]}>
                                {diary.link || '초대 링크를 만들어 주세요.'}
                              </Text>
                              {diary.link && (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel="초대 링크 복사"
                                  disabled={busy}
                                  style={s.iconButton}
                                  onPress={() =>
                                    run(
                                      async () => {
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
                                    disabled={busy}
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
                                  disabled={busy}
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
                        </View>
                      )}
                      <View style={[s.section, s.row]}>
                        <View style={s.grow}>
                          <Text style={s.bold}>참여자의 내보내기 허용</Text>
                        </View>
                        <Switch
                          accessibilityLabel="참여자의 내보내기 허용"
                          value={diary.allowExport}
                          disabled={!isOwner || busy}
                          onValueChange={(value) =>
                            run(() => runtime.setExportAllowed(diary.id, value), setDiary)
                          }
                          trackColor={{ false: colors.border, true: colors.primary }}
                          thumbColor={colors.surface}
                        />
                      </View>
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
                        label={!isOwner && onOpenDiary ? '다이어리 열기' : '완료'}
                        onPress={() => {
                          if (!isOwner && onOpenDiary) onOpenDiary(diary.id);
                          else close();
                        }}
                        disabled={busy}
                      />
                    </>
                  )}
                  {screen === 'invitations' && (
                    <>
                      <Text style={s.muted}>
                        초대를 수락하면 다이어리 닉네임을 설정하고 참여해요.
                      </Text>
                      <View style={s.notificationToolbar}>
                        <Text style={[s.label, s.grow]}>받은 초대</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="새로고침"
                          disabled={busy || mutation.status === 'saving'}
                          onPress={store.refresh}
                          style={({ pressed }) => [
                            s.iconButton,
                            (pressed || busy || mutation.status === 'saving') && s.disabled,
                          ]}
                        >
                          <Icon name="rotate" size={18} />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="모두 읽음"
                          disabled={
                            busy || mutationLocked || !items.length || list.status !== 'success'
                          }
                          onPress={store.readAll}
                          style={({ pressed }) => [
                            s.notificationReadAll,
                            (pressed ||
                              busy ||
                              mutationLocked ||
                              !items.length ||
                              list.status !== 'success') &&
                              s.disabled,
                          ]}
                        >
                          <Icon name="check" size={17} />
                          <Text style={s.notificationActionText}>모두 읽음</Text>
                        </Pressable>
                      </View>
                      {(list.status === 'loading' || list.status === 'idle') && (
                        <ActivityIndicator
                          accessibilityLabel="받은 초대 불러오는 중"
                          color={colors.primary}
                        />
                      )}
                      {(list.status === 'error' || count.status === 'error') && (
                        <View>
                          <Text style={s.error}>{list.error?.message || count.error?.message}</Text>
                          <Button label="받은 초대 다시 시도" secondary onPress={store.refresh} />
                        </View>
                      )}
                      {mutation.status === 'error' && (
                        <View>
                          <Text style={s.error}>{mutation.error.message}</Text>
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
                          <Icon name="bell" size={32} />
                          <Text style={s.bold}>받은 초대가 없어요.</Text>
                        </View>
                      )}
                      {items.map((row) => (
                        <View key={row.id} style={s.invitation}>
                          <View style={s.row}>
                            <View
                              style={s.invitationCover}
                              accessibilityLabel={`${row.title} 다이어리 표지`}
                            >
                              <Cover
                                diary={row.diary || { title: row.title, color: colors.surfaceSoft }}
                                thumbnailWidth={56}
                              />
                            </View>
                            <View style={s.grow}>
                              <Text style={s.bold} numberOfLines={2}>
                                {row.title}
                              </Text>
                              <Text style={s.muted}>
                                {row.actor}님의 초대 · {row.readAt ? '읽음' : '안 읽음'}
                              </Text>
                              <Text style={s.muted}>{invitationStatusLabel(row.status)}</Text>
                              {isPhone && row.actionable && invitationActions(row)}
                            </View>
                            {!isPhone && row.actionable && invitationActions(row)}
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={`${row.title} 알림 삭제`}
                              disabled={busy || mutationLocked}
                              onPress={() => store.remove(row.id)}
                              style={s.iconButton}
                            >
                              <Icon name="close" size={16} />
                            </Pressable>
                          </View>
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
                      ))}
                      {nextCursor && (
                        <Button
                          label="초대 더 보기"
                          secondary
                          disabled={busy || mutationLocked || more.status === 'loading'}
                          onPress={store.loadMore}
                        />
                      )}
                      {more.status === 'error' && <Text style={s.error}>{more.error.message}</Text>}
                      <View style={s.section}>
                        <Text style={s.label}>초대 링크로 확인</Text>
                        <TextInput
                          accessibilityLabel="받은 초대 링크"
                          ref={linkField}
                          onFocus={() => focusInput(linkField.current)}
                          onBlur={() => blurInput(linkField.current)}
                          placeholder="초대 링크를 붙여 넣어 주세요"
                          value={linkInput}
                          onChangeText={setLinkInput}
                          editable={!busy}
                          autoCapitalize="none"
                          autoCorrect={false}
                          keyboardType="url"
                          style={s.field}
                        />
                        <Button
                          label="초대 링크 확인"
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
                    </>
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
                          <MemberAvatar member={{ photoUri: draftPhoto, nickname }} />
                          <View style={s.profileEdit}>
                            <Icon name="edit" size={10} />
                          </View>
                        </Pressable>
                        <TextInput
                          accessibilityLabel="다이어리 닉네임"
                          ref={nicknameField}
                          onFocus={() => focusInput(nicknameField.current)}
                          onBlur={() => blurInput(nicknameField.current)}
                          placeholder="닉네임을 입력해 주세요"
                          value={nickname}
                          onChangeText={changeNickname}
                          editable={!busy}
                          maxLength={12}
                          autoCorrect={false}
                          autoCapitalize="none"
                          style={[s.field, s.grow]}
                          onSubmitEditing={checkNickname}
                        />
                        <Button
                          label="다이어리 닉네임 중복 확인"
                          text="중복 확인"
                          secondary
                          disabled={busy || checking || !!sharingNicknameError(nickname)}
                          onPress={checkNickname}
                        />
                      </View>
                      {!!nickname && !!sharingNicknameError(nickname) && (
                        <Text style={s.error}>{sharingNicknameError(nickname)}</Text>
                      )}
                      {!!nicknameMessage && (
                        <Text accessibilityLiveRegion="polite" style={checked ? s.muted : s.error}>
                          {nicknameMessage}
                        </Text>
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
                          onPress={() => {
                            if (nicknameReady && !checkRunning.current)
                              run(
                                () =>
                                  editingProfile
                                    ? runtime.updateProfile(diary.id, {
                                        nickname,
                                        photoUri: draftPhoto,
                                      })
                                    : runtime.accept(invite.inviteId, nickname, {
                                        photoUri: draftPhoto,
                                      }),
                                (result) => {
                                  dismissInput();
                                  setDiary(result);
                                  setScreen('sharing');
                                  store.refresh();
                                  setToast(
                                    editingProfile
                                      ? '다이어리 프로필을 변경했어요.'
                                      : '다이어리에 참여했어요.',
                                  );
                                },
                              );
                          }}
                        />
                      </View>
                    </>
                  )}
                  {busy && (
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
          title={question?.kind === 'decline' ? '초대를 거절할까요?' : '참여를 해제할까요?'}
          message={
            question?.kind === 'decline'
              ? '이 초대로는 다이어리에 참여할 수 없어요.'
              : '참여가 해제되면 이 다이어리를 함께 편집할 수 없어요.'
          }
          confirmLabel={question?.kind === 'decline' ? '거절' : '참여 해제'}
          onConfirm={confirmQuestion}
          onCancel={() => setQuestion(null)}
        />
      </SafeAreaView>
    </EditorModal>
  );
}
