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
import Header from '../diary/components/Header';
import Modal from '../editor/components/controls/EditorModal';
import { colors } from '../shared/theme';
import { pickProfilePhoto } from './profilePhoto';
import { nicknameError, normalizeNickname, passwordError } from './validation';
import { useProfileKeyboard } from './useProfileKeyboard';
import { profileStyles as s } from './profileStyles';

const PROVIDER_NAMES = { email: '이메일', kakao: '카카오', google: '구글', apple: '애플' };
const emptyPasswords = () => ({ currentPassword: '', password: '', confirmation: '' });
const WITHDRAW_TEXT = '탈퇴합니다';

export default function ProfileEditScreen({
  user,
  passwordOnly = false,
  compact = false,
  onClose,
  onUpdate,
  onEndSession,
  onPasswordReset,
  registerLeaveGuard,
  getProfilePhotoSource,
  photoEditable = true,
  service,
  photoPicker = pickProfilePhoto,
}) {
  const [saved, setSaved] = useState(user);
  const [nickname, setNickname] = useState(user.nickname);
  const [photoUri, setPhotoUri] = useState(user.photoUri || null);
  const [dialog, setDialog] = useState(passwordOnly ? 'password' : null);
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
  // 서버 사진은 개발 게이트웨이 인증 헤더가 필요할 수 있다. 홈과 수정 화면이
  // 서로 다른 source를 쓰면, 이미 설정한 사진이 수정 화면에서만 빈 이미지가 된다.
  const photoSource = photoUri
    ? (getProfilePhotoSource ? getProfilePhotoSource(photoUri) : { uri: photoUri })
    : null;
  const name = normalizeNickname(nickname);
  const changed = nickname !== saved.nickname || photoUri !== (saved.photoUri || null);
  const ready = changed && !nicknameError(nickname);
  const passwordDirty = Object.values(passwords).some(Boolean);
  const passwordReady =
    passwords.currentPassword &&
    !passwordError(passwords.password) &&
    passwords.password === passwords.confirmation &&
    passwords.password !== passwords.currentPassword;
  const canWithdraw = typeof service?.withdraw === 'function';
  const requireService = (operation) => {
    if (typeof service?.[operation] !== 'function')
      throw new Error('회원정보 기능을 준비하지 못했어요. 다시 로그인해 주세요.');
    return service[operation].bind(service);
  };
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
        if (passwordOnly) onClose?.();
      };
      setDialog('discard-password');
    } else {
      setDialog(null);
      setPasswords(emptyPasswords());
      setWithdrawText('');
      pendingLeave.current = null;
      if (passwordOnly) onClose?.();
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
      () => requireService('updateProfile')(saved, { nickname: name, photoUri }),
      (result) => {
        setSaved(result);
        setNickname(result.nickname);
        setPhotoUri(result.photoUri || null);
        form.dismiss();
        setNotice('회원정보를 저장했어요.');
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
      () => requireService('changePassword')(saved, passwords),
      () => {
        modalForm.dismiss();
        setPasswords(emptyPasswords());
        setDialog(null);
        setNotice('비밀번호를 변경했어요.');
      },
      // 서버는 비밀번호 변경 시 모든 세션을 폐기한다. 이 대화상자는
      // passwordOnly 여부와 무관하게 인증 계정에서 열릴 수 있으므로,
      // 만료된 토큰을 계속 쓰지 않도록 항상 앱의 로컬 세션도 끝낸다.
      saved.mode === 'authenticated' ? onEndSession : undefined,
    );
  };
  const withdraw = () => {
    if (withdrawText !== WITHDRAW_TEXT || !canWithdraw) return;
    run(() => requireService('withdraw')(saved), null, onEndSession);
  };
  const modalTitle =
    dialog === 'withdraw'
      ? '정말 탈퇴하시겠어요?'
      : dialog === 'password'
        ? '비밀번호 변경'
        : '변경사항을 저장하지 않았어요';
  const discardDialog = dialog === 'discard' || dialog === 'discard-password';

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={
        Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined
      }
    >
      {!passwordOnly && <ScrollView
        ref={form.scroll}
        contentContainerStyle={[s.scroll, compact && s.phoneScroll]}
        onLayout={form.reveal}
        onScroll={form.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title="회원정보 수정"
          compact={compact}
          left={(
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="마이페이지로 돌아가기"
              disabled={busy}
              onPress={() => leave(onClose)}
              style={({ pressed }) => [s.headerBack, compact && s.headerBackCompact, busy && s.disabled, pressed && s.pressed]}
            >
              <AppIcon name="chevron-left" size={22} />
            </Pressable>
          )}
        />
        <View style={[s.card, compact && s.phoneCard]}>
          <Text style={s.section}>프로필 정보</Text>
          <View style={s.avatarRow}>
            <View style={s.avatarWrap}>
              {photoSource ? (
                <Image
                  source={photoSource}
                  accessibilityLabel="프로필 사진"
                  style={s.photo}
                />
              ) : (
                <View accessibilityLabel="기본 프로필" style={s.avatar}>
                  <AppIcon name="person" size={32} color={colors.textMuted} />
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 변경"
                accessibilityState={{ disabled: busy || !photoEditable }}
                disabled={busy || !photoEditable}
                onPress={pickPhoto}
                style={[s.photoHit, !photoEditable && s.disabled]}
              >
                <View style={s.photoBadge}>
                  <AppIcon name="edit" size={14} color={colors.surface} />
                </View>
              </Pressable>
            </View>
            <View style={s.grow}>
              <Text style={s.photoTitle}>프로필 사진</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="프로필 사진 삭제"
                accessibilityState={{ disabled: busy || !photoUri || !photoEditable }}
                disabled={busy || !photoUri || !photoEditable}
                onPress={() => {
                  setPhotoUri(null);
                  setError('');
                  setNotice('');
                }}
                style={[s.link, (!photoUri || !photoEditable) && s.disabled]}
              >
                <Text style={s.linkText}>기본 이미지로 되돌리기</Text>
              </Pressable>
            </View>
          </View>
          <View style={s.form}>
            <FormRow label="닉네임" compact={compact}>
              <View style={s.nicknameRow}>
                <View style={s.grow}>
                  <Field
                    label="닉네임"
                    value={nickname}
                    onChangeText={changeNickname}
                    disabled={busy}
                    form={form}
                    maxLength={12}
                  />
                </View>
              </View>
              <Text accessibilityLiveRegion="polite" style={s.hint}>
                {(nicknameError(nickname) && nickname
                    ? nicknameError(nickname)
                    : '한글·영문·숫자·밑줄 2~12자')}
              </Text>
            </FormRow>
            {saved.email && (
              <FormRow label="이메일" compact={compact}>
                <ReadOnly label="이메일" value={saved.email} />
              </FormRow>
            )}
            <FormRow label="로그인 방식" compact={compact}>
              <ReadOnly label="로그인 방식" value={PROVIDER_NAMES[saved.provider] || '소셜'} />
              {saved.provider !== 'email' && (
                <Text style={s.hint}>
                  {PROVIDER_NAMES[saved.provider] || '소셜'} 계정으로 로그인하고 있어요.
                </Text>
              )}
            </FormRow>
            {saved.provider === 'email' && (
              <FormRow label="비밀번호" compact={compact}>
                <View style={{ alignItems: 'flex-start' }}>
                  <Button
                    label={onPasswordReset ? '비밀번호 재설정' : '비밀번호 변경'}
                    secondary
                    onPress={() => onPasswordReset ? leave(onPasswordReset) : showDialog('password')}
                    disabled={busy}
                  />
                </View>
              </FormRow>
            )}
          </View>
          {!!error && !dialog && (
            <Text accessibilityRole="alert" style={s.error}>
              {error}
            </Text>
          )}
          {!!notice && (
            <Text accessibilityLiveRegion="polite" style={s.notice}>
              {notice}
            </Text>
          )}
          <View style={s.footer}>
            <View style={s.footerDivider} />
            <View style={[s.footerRow, compact && s.phoneFooter]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="회원 탈퇴"
                accessibilityHint={!canWithdraw ? '회원 탈퇴 기능은 준비 중이에요.' : undefined}
                disabled={busy || !canWithdraw}
                onPress={() => showDialog('withdraw')}
                style={[s.withdraw, !canWithdraw && s.disabled]}
              >
                <Text style={s.withdrawText}>회원 탈퇴</Text>
              </Pressable>
              <View style={[s.actions, compact && s.phoneActions]}>
                <Button
                  label="취소"
                  secondary
                  disabled={busy}
                  onPress={() => leave(onClose)}
                  style={compact && s.grow}
                />
                <Button
                  label="변경사항 저장"
                  disabled={busy || !ready}
                  busy={busy}
                  onPress={save}
                  style={compact && s.grow}
                />
              </View>
            </View>
          </View>
        </View>
      </ScrollView>}
      <Modal
        visible={!!dialog}
        transparent
        animationType="fade"
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
            contentContainerStyle={s.modalScroll}
            keyboardShouldPersistTaps="handled"
            onLayout={modalForm.reveal}
            onScroll={modalForm.onScroll}
            scrollEventThrottle={16}
          >
            <View style={s.dialog} accessibilityViewIsModal>
              <View style={s.dialogHeading}>
                <Text accessibilityRole="header" style={s.dialogTitle}>
                  {modalTitle}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="확인 창 닫기"
                  disabled={busy}
                  onPress={discardDialog ? continueEditing : closeDialog}
                  style={s.close}
                >
                  <AppIcon name="close" size={18} />
                </Pressable>
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
                    지금 나가면 수정한 내용이 저장되지 않아요.{'\n'}계속 수정하시겠어요?
                  </Text>
                )}
                {dialog === 'password' && (
                  <>
                    {passwordOnly && <Text style={s.muted}>변경하면 모든 기기에서 로그아웃돼요. 새 비밀번호로 다시 로그인해 주세요.</Text>}
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
              <View style={s.dialogDivider} />
              <View style={s.actions}>
                <Button
                  label={discardDialog ? '저장하지 않고 나가기' : '취소'}
                  secondary
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
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </KeyboardAvoidingView>
  );
}
function FormRow({ label, compact, children }) {
  return (
    <View style={[s.row, compact && s.phoneRow]}>
      <Text style={[s.label, compact && s.phoneLabel]}>{label}</Text>
      <View style={[s.value, compact && s.phoneValue]}>{children}</View>
    </View>
  );
}
function ReadOnly({ label, value }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={s.readOnly}>
      <Text selectable style={s.readOnlyText}>
        {value}
      </Text>
    </View>
  );
}
function Button({ label, onPress, disabled, secondary, danger, busy, style }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        secondary && s.secondary,
        danger && s.danger,
        disabled && s.disabled,
        pressed && s.pressed,
        style,
      ]}
    >
      {busy && <ActivityIndicator color={colors.surface} />}
      <Text style={[s.buttonText, secondary && s.secondaryText]}>{label}</Text>
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
