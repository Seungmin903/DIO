import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppIcon from '../shared/AppIcon';
import { SettingCard } from '../diary/components/SettingRow';
import Modal from '../editor/components/controls/EditorModal';
import { colors } from '../shared/theme';
import { previewAuth } from './previewAuth';
import { pickProfilePhoto } from './profilePhoto';
import { bioError, BIO_MAX, nicknameError, normalizeBio, normalizeNickname, passwordError } from './validation';
import { useProfileKeyboard } from './useProfileKeyboard';
import { profileStyles as s } from './profileStyles';

// 사진이 없을 때의 기본 프로필: 메뉴 아래 · 내 공간과 같은 그림(primaryStrong 동그라미에 디오의 흰 표정)
import DefaultAvatar from '../shared/DefaultAvatar';
const PROVIDER_NAMES = { email: '이메일', kakao: '카카오', google: '구글', apple: '애플' };
const emptyPasswords = () => ({ currentPassword: '', password: '', confirmation: '' });
const WITHDRAW_TEXT = '탈퇴합니다';

export default function ProfileEditScreen({
  user,
  compact = false,
  onClose,
  onUpdate,
  onEndSession,
  registerLeaveGuard,
  service = previewAuth,
  photoPicker = pickProfilePhoto,
}) {
  const [saved, setSaved] = useState(user);
  const [nickname, setNickname] = useState(user.nickname);
  const [photoUri, setPhotoUri] = useState(user.photoUri || null);
  const [bio, setBio] = useState(user.bio || '');
  const [dialog, setDialog] = useState(null);
  const [withdrawText, setWithdrawText] = useState('');
  const [passwords, setPasswords] = useState(emptyPasswords);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true),
    running = useRef(false),
    request = useRef(0),
    pendingLeave = useRef(null);
  const form = useProfileKeyboard(),
    modalForm = useProfileKeyboard();
  const name = normalizeNickname(nickname);
  const guest = saved.provider === 'guest';
  const changed =
    nickname !== saved.nickname ||
    photoUri !== (saved.photoUri || null) ||
    normalizeBio(bio) !== (saved.bio || '');
  const ready = changed && !nicknameError(nickname) && !bioError(bio);
  const passwordDirty = Object.values(passwords).some(Boolean);
  const passwordReady =
    passwords.currentPassword &&
    !passwordError(passwords.password) &&
    passwords.password === passwords.confirmation &&
    passwords.password !== passwords.currentPassword;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current++;
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 3000);
    return () => clearTimeout(timer);
  }, [notice]);

  const showDialog = (next) => {
    if (running.current) return;
    form.dismiss();
    modalForm.dismiss();
    setError('');
    setNotice('');
    setWithdrawText('');
    setPasswords(emptyPasswords());
    setDialog(next);
  };
  const closeDialog = () => {
    if (running.current) return;
    modalForm.dismiss();
    setError('');
    if (dialog === 'password' && passwordDirty) {
      pendingLeave.current = () => {
        setDialog(null);
        setPasswords(emptyPasswords());
      };
      setDialog('discard-password');
    } else {
      setDialog(null);
      setPasswords(emptyPasswords());
      setWithdrawText('');
      pendingLeave.current = null;
    }
  };
  const leave = (action) => {
    if (running.current) return;
    if (changed || passwordDirty) {
      form.dismiss();
      modalForm.dismiss();
      pendingLeave.current = action;
      setError('');
      setDialog(passwordDirty ? 'discard-password' : 'discard');
    } else {
      form.dismiss();
      action();
    }
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;
  useEffect(() => registerLeaveGuard?.(
    (action) => leaveRef.current(action),
    () => backRef.current(),
  ), [registerLeaveGuard]);
  const backRef = useRef(null);
  backRef.current = () => {
    if (running.current) return;
    if (dialog === 'discard' || dialog === 'discard-password') continueEditing();
    else if (dialog) closeDialog();
    else leave(onClose);
  };

  const run = async (task, success, commit) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    const id = ++request.current;
    try {
      const result = await task();
      commit?.(result);
      if (mounted.current && id === request.current) success?.(result);
    } catch (reason) {
      if (mounted.current && id === request.current)
        setError(reason.message || '처리하지 못했어요. 다시 시도해 주세요.');
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const save = () => {
    if (!ready) return;
    run(
      () => {
        if (typeof service.updateProfile !== 'function')
          throw new Error('프로필 정보 수정 기능이 아직 연결되지 않았어요.');
        return service.updateProfile(saved, { nickname: name, photoUri, bio: normalizeBio(bio) });
      },
      (result) => {
        setSaved(result);
        setNickname(result.nickname);
        setPhotoUri(result.photoUri || null);
        setBio(result.bio || '');
        form.dismiss();
        setNotice(guest ? '프로필을 저장했어요.' : '회원정보를 저장했어요.');
      },
      onUpdate,
    );
  };
  const changeNickname = (value) => {
    request.current++;
    setNickname(value);
    setError('');
    setNotice('');
  };
  const changeBio = (value) => {
    request.current++;
    setBio(value);
    setError('');
    setNotice('');
  };
  const pickPhoto = () =>
    run(photoPicker, (uri) => {
      if (uri) setPhotoUri(uri);
    });
  const discard = () => {
    if (running.current) return;
    const action = pendingLeave.current;
    pendingLeave.current = null;
    modalForm.dismiss();
    setDialog(null);
    setError('');
    setPasswords(emptyPasswords());
    if (dialog === 'discard') {
      setNickname(saved.nickname);
      setPhotoUri(saved.photoUri || null);
      setBio(saved.bio || '');
    }
    action?.();
  };
  const continueEditing = () => {
    pendingLeave.current = null;
    modalForm.dismiss();
    setError('');
    setDialog(dialog === 'discard-password' ? 'password' : null);
  };
  const updatePassword = (key, value) => {
    setPasswords((previous) => ({ ...previous, [key]: value }));
    setError('');
  };
  const changePassword = () => {
    if (!passwordReady) return;
    run(
      () => service.changePassword(saved, passwords),
      () => {
        modalForm.dismiss();
        setPasswords(emptyPasswords());
        setDialog(null);
        setNotice('비밀번호를 변경했어요.');
      },
      user?.mode === 'authenticated' ? onEndSession : undefined,
    );
  };
  const withdraw = () => {
    if (withdrawText !== WITHDRAW_TEXT) return;
    run(() => service.withdraw(saved), null, onEndSession);
  };
  // 사진 변경 메뉴: 열려 있으면 트리거의 화면 위치(말풍선 자리)를 들고 있다
  const [photoMenu, setPhotoMenu] = useState(null);
  const photoTrigger = useRef(null);
  const openPhotoMenu = () => {
    form.dismiss();
    if (compact || !photoTrigger.current?.measureInWindow) return setPhotoMenu({});
    photoTrigger.current.measureInWindow((x, y, w, h) => setPhotoMenu({ x, y, w, h }));
  };
  const modalTitle =
    dialog === 'withdraw'
      ? '정말 탈퇴하시겠어요?'
      : dialog === 'password'
        ? '비밀번호 변경'
        : '변경사항을 버릴까요?';
  const discardDialog = dialog === 'discard' || dialog === 'discard-password';
  // 저장 안 한 변경 확인: 안전한 `계속 수정하기`를 채움으로, 버리는 쪽은 글자만 위험색(폰: 위아래로 쌓고 계속 수정이 위, 태블릿: 오른쪽 정렬 나가기 → 계속 수정)
  const discardActions = discardDialog ? (
    <View style={compact ? s.discardActionsSheet : s.discardActions}>
      {compact ? null : (
        <Button label="저장하지 않고 나가기" dangerText disabled={busy} onPress={discard} />
      )}
      <Button label="계속 수정하기" disabled={busy} onPress={continueEditing} />
      {compact ? (
        <Button label="저장하지 않고 나가기" dangerText disabled={busy} onPress={discard} />
      ) : null}
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={
        Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
      }
    >
      <ScrollView
        ref={form.scroll}
        style={s.flex}
        contentContainerStyle={[s.scroll, compact && s.phoneScroll]}
        onLayout={form.reveal}
        onScroll={form.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.rail}>
          <View style={s.heading}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="내 공간으로 돌아가기"
              disabled={busy}
              onPress={() => leave(onClose)}
              style={s.back}
            >
              <AppIcon name="chevron-left" size={24} />
            </Pressable>
            <Text accessibilityRole="header" style={[s.title, compact && s.titleCompact]}>
              {guest ? '프로필 수정' : '회원정보 수정'}
            </Text>
          </View>
          <Text accessibilityRole="header" style={s.sectionTitle}>
            프로필 정보
          </Text>
          <View style={[s.tray, compact && s.trayCompact]}>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                accessibilityLabel="프로필 사진"
                style={[s.photo, compact && s.photoCompact]}
              />
            ) : (
              <DefaultAvatar accessibilityLabel="기본 프로필" style={[s.photo, compact && s.photoCompact]} />
            )}
            <View style={s.avatarActions}>
              <Pressable
                ref={photoTrigger}
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 변경"
                accessibilityState={{ expanded: !!photoMenu }}
                disabled={busy}
                onPress={openPhotoMenu}
                style={s.photoLink}
              >
                <AppIcon name="edit" size={16} forText={14} color={colors.primaryText} />
                <Text style={s.photoLinkText}>사진 변경</Text>
              </Pressable>
            </View>
          </View>
          <FormRow label="닉네임">
            <Field
              label="닉네임"
              value={nickname}
              onChangeText={changeNickname}
              disabled={busy}
              form={form}
              maxLength={12}
            />
            <Text accessibilityLiveRegion="polite" style={s.hint}>
              {nicknameError(nickname) && nickname
                ? nicknameError(nickname)
                : '한글·영문·숫자·밑줄 2~12자'}
            </Text>
          </FormRow>
          <FormRow label="한 줄 소개">
            <Field
              label="한 줄 소개"
              value={bio}
              onChangeText={changeBio}
              disabled={busy}
              form={form}
              maxLength={BIO_MAX}
            />
            <Text accessibilityLiveRegion="polite" style={[s.hint, s.counter]}>
              {[...normalizeBio(bio)].length}/{BIO_MAX}
            </Text>
          </FormRow>
          {!guest && (
            <>
              <Text accessibilityRole="header" style={[s.sectionTitle, s.sectionGap]}>
                계정 정보
              </Text>
              <SettingCard compact={compact}>
                {saved.email && <InfoRow label="이메일" value={saved.email} />}
                <InfoRow label="로그인 방식" value={PROVIDER_NAMES[saved.provider] || '소셜'} />
                {saved.provider === 'email' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="비밀번호 변경"
                    accessibilityState={{ disabled: !!busy }}
                    disabled={busy}
                    onPress={() => showDialog('password')}
                    style={s.infoRow}
                  >
                    <Text style={s.infoLabel}>비밀번호 변경</Text>
                    <AppIcon name="chevron-right" size={20} color={colors.textMuted} />
                  </Pressable>
                )}
              </SettingCard>
              {saved.provider !== 'email' && (
                <Text style={[s.hint, s.socialHint]}>
                  {PROVIDER_NAMES[saved.provider] || '소셜'} 계정으로 로그인하고 있어요.
                </Text>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="회원 탈퇴"
                disabled={busy}
                onPress={() => showDialog('withdraw')}
                style={s.withdraw}
              >
                <Text style={s.withdrawText}>회원 탈퇴</Text>
              </Pressable>
            </>
          )}
          {!!error && !dialog && (
            <Text accessibilityRole="alert" style={[s.error, s.formError]}>
              {error}
            </Text>
          )}
        </View>
      </ScrollView>
      {/* 하단 고정 바: 저장 행동이 항상 보인다 */}
      <View style={[s.bar, compact && s.phoneBar]}>
        <View style={[s.barInner, compact && s.phoneBarInner]}>
          <Button
            label="취소"
            secondary
            disabled={busy}
            onPress={() => leave(onClose)}
            style={s.barButton}
          />
          <Button
            label="변경사항 저장"
            disabled={busy || !ready}
            busy={busy}
            onPress={save}
            style={[s.barButton, compact && s.grow]}
          />
        </View>
      </View>
      <Modal
        visible={!!dialog}
        transparent
        animationType="none"
        onRequestClose={() => backRef.current()}
      >
        <KeyboardAvoidingView
          style={s.backdrop}
          behavior={
            Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
          }
        >
          <ScrollView
            ref={modalForm.scroll}
            style={{ width: '100%' }}
            contentContainerStyle={[s.modalScroll, discardDialog && compact && s.sheetScroll]}
            keyboardShouldPersistTaps="handled"
            onLayout={modalForm.reveal}
            onScroll={modalForm.onScroll}
            scrollEventThrottle={16}
          >
            <View style={[s.dialog, discardDialog && s.discardDialog, discardDialog && compact && s.sheetDialog]} accessibilityViewIsModal>
              {discardDialog && compact && <View style={s.sheetGrab} />}
              <View style={s.dialogHeading}>
                <Text accessibilityRole="header" style={s.dialogTitle}>
                  {modalTitle}
                </Text>
                {!discardDialog && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="확인 창 닫기"
                    disabled={busy}
                    onPress={closeDialog}
                    style={s.close}
                  >
                    <AppIcon name="close" size={18} />
                  </Pressable>
                )}
              </View>
              <View style={s.dialogBody}>
                {dialog === 'withdraw' && (
                  <>
                    <Text style={s.muted}>
                      탈퇴하면 DIO 계정을 더 이상 사용할 수 없어요.{'\n'}탈퇴 전 필요한 기록을
                      내보내 주세요.
                    </Text>
                    <Text style={s.text}>확인을 위해 아래에 ‘탈퇴합니다’를 입력해 주세요.</Text>
                    <Field
                      label="탈퇴 확인 문구"
                      placeholder="확인 문구를 입력해 주세요"
                      value={withdrawText}
                      onChangeText={(value) => {
                        setWithdrawText(value);
                        setError('');
                      }}
                      disabled={busy}
                      form={modalForm}
                      maxLength={30}
                    />
                    <Text style={s.hint}>
                      {withdrawText === WITHDRAW_TEXT
                        ? '확인 문구가 일치해요.'
                        : '문구가 일치하면 탈퇴하기 버튼이 활성화돼요.'}
                    </Text>
                  </>
                )}
                {discardDialog && (
                  <Text style={s.muted}>
                    지금 나가면 수정한 내용이 저장되지 않아요.
                  </Text>
                )}
                {dialog === 'password' && (
                  <>
                    {['currentPassword', 'password', 'confirmation'].map((key, index) => (
                      <View key={key}>
                        <Text style={s.text}>
                          {['현재 비밀번호', '새 비밀번호', '새 비밀번호 확인'][index]}
                        </Text>
                        <Field
                          label={['현재 비밀번호', '새 비밀번호', '새 비밀번호 확인'][index]}
                          value={passwords[key]}
                          onChangeText={(value) => updatePassword(key, value)}
                          password
                          disabled={busy}
                          form={modalForm}
                          autoComplete={index === 0 ? 'current-password' : 'new-password'}
                        />
                      </View>
                    ))}
                    <Text style={s.muted}>영문·숫자를 포함해 8~32자로 입력해 주세요.</Text>
                    {!!passwords.confirmation && passwords.password !== passwords.confirmation && (
                      <Text style={s.error}>비밀번호가 일치하지 않아요.</Text>
                    )}
                  </>
                )}
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
              </View>
              {discardActions}
              {!discardDialog && (
              <View style={s.dialogActions}>
                <Button
                  label={discardDialog ? '저장하지 않고 나가기' : '취소'}
                  secondary={!discardDialog}
                  dangerGhost={discardDialog}
                  disabled={busy}
                  onPress={discardDialog ? discard : closeDialog}
                  style={s.grow}
                />
                <Button
                  label={
                    discardDialog ? '계속 수정하기' : dialog === 'withdraw' ? '탈퇴하기' : '변경'
                  }
                  danger={dialog === 'withdraw'}
                  disabled={
                    busy ||
                    (dialog === 'withdraw'
                      ? withdrawText !== WITHDRAW_TEXT
                      : dialog === 'password'
                        ? !passwordReady
                        : false)
                  }
                  busy={busy}
                  onPress={
                    discardDialog
                      ? continueEditing
                      : dialog === 'withdraw'
                        ? withdraw
                        : changePassword
                  }
                  style={s.grow}
                />
              </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      {/* 사진 변경 메뉴: 태블릿은 `사진 변경` 아래 말풍선, 폰은 아래 시트. 사진 선택 · 기본 이미지로 되돌리기(사진이 있을 때만) · 취소. 뜰 때 효과(페이드 등)는 넣지 않는다 */}
      <Modal visible={!!photoMenu} transparent animationType="none" onRequestClose={() => setPhotoMenu(null)}>
        <Pressable accessible={false} style={compact ? s.photoBackdrop : s.photoBackdropPopover} onPress={() => setPhotoMenu(null)}>
          <Pressable
            accessible={false}
            onPress={(event) => event.stopPropagation()}
            style={compact ? s.photoSheet : [s.photoPopover, { left: photoMenu?.x ?? 0, top: (photoMenu?.y ?? 0) + (photoMenu?.h ?? 0) + 8 }]}
          >
            {compact && <View style={s.sheetGrab} />}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="프로필 사진 선택"
              onPress={() => {
                setPhotoMenu(null);
                pickPhoto();
              }}
              style={[s.photoRow, compact && s.photoRowSheet]}
            >
              <Text style={[s.photoRowText, compact && s.photoRowTextSheet]}>사진 선택</Text>
            </Pressable>
            {!!photoUri && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 삭제"
                onPress={() => {
                  setPhotoMenu(null);
                  setPhotoUri(null);
                  setError('');
                  setNotice('');
                }}
                style={[s.photoRow, compact && s.photoRowSheet]}
              >
                <Text style={[s.photoRowText, compact && s.photoRowTextSheet, s.photoRowDanger]}>기본 이미지로 되돌리기</Text>
              </Pressable>
            )}
            <View style={s.photoDivider} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="프로필 사진 변경 취소"
              onPress={() => setPhotoMenu(null)}
              style={[s.photoRow, compact && s.photoRowSheet]}
            >
              <Text style={[s.photoRowText, compact && s.photoRowTextSheet, s.photoRowCancel]}>취소</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
      {/* 저장 · 변경 결과는 화면 아래에 남색 알약으로 잠깐 뜬다(다른 화면의 알림 알약과 같다) */}
      {!!notice && (
        <View pointerEvents="none" style={s.toastPosition}>
          <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={s.toast}>
            {notice}
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
// 라벨은 입력칸 위에 쌓는다(태블릿 · 폰 같음). 입력은 읽기 좋은 폭(560)까지만.
function FormRow({ label, children }) {
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.value}>{children}</View>
    </View>
  );
}
// 읽기 전용 정보 행(카드 안): 왼쪽 라벨, 오른쪽 값, 아래 선. 높이 56.
function InfoRow({ label, value }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={s.infoRow}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text selectable numberOfLines={1} style={s.infoValue}>
        {value}
      </Text>
    </View>
  );
}
function Button({ label, text, icon, onPress, disabled, secondary, tonal, ghost, dangerGhost, dangerText, danger, busy, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        tonal && s.tonal,
        ghost && s.ghost,
        dangerGhost && s.dangerGhost,
        dangerText && s.dangerTextButton,
        danger && s.danger,
        disabled && s.disabled,
        style,
      ]}
    >
      {busy && <ActivityIndicator color={colors.surface} />}
      {!!icon && <AppIcon name={icon} size={18} forText={14} color={colors.primaryText} />}
      <Text
        style={[
          s.buttonText,
          secondary && s.secondaryText,
          (tonal || ghost) && s.tonalText,
          (dangerGhost || dangerText) && s.dangerGhostText,
          ghost && s.ghostText,
        ]}
      >
        {text || label}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  disabled,
  form,
  password,
  maxLength,
  placeholder,
  autoComplete,
}) {
  const ref = useRef(null),
    [visible, setVisible] = useState(false),
    [focused, setFocused] = useState(false);
  return (
    <View style={[s.field, focused && s.focused]}>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        editable={!disabled}
        maxLength={maxLength || (password ? 32 : undefined)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={!!password && !visible}
        autoComplete={autoComplete || 'off'}
        onFocus={() => {
          setFocused(true);
          form.focus(ref.current);
        }}
        onBlur={() => {
          setFocused(false);
          form.blur(ref.current);
        }}
        style={s.input}
      />
      {password && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${label} ${visible ? '숨기기' : '보기'}`}
          disabled={disabled}
          onPress={() => setVisible((previous) => !previous)}
          style={s.eye}
        >
          <AppIcon name={visible ? 'eye-off' : 'eye'} size={20} />
        </Pressable>
      )}
    </View>
  );
}
