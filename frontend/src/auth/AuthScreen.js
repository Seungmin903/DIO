import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  BackHandler,
  Keyboard,
  Linking,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import BrandLogo from '../shared/BrandLogo';
import AppIcon from '../shared/AppIcon';
import Icon from '../editor/components/controls/Icon';
import EditorModal from '../editor/components/controls/EditorModal';
import { colors } from '../shared/theme';
import { useFormFactor } from '../shared/useFormFactor';
import { useOrientationLock } from '../shared/useOrientationLock';
import { authService } from './authService';
import {
  canCompleteProfile,
  credentialsErrors,
  credentialsValid,
  nicknameError,
  normalizeEmail,
} from './validation';
import { authStyles as s } from './styles';
import ProviderIcon from './ProviderIcon';
import { pickProfilePhoto } from './profilePhoto';
import EmailVerification from './EmailVerification';
import { createSignupDocuments, signupDocuments, signupEligibility } from './signupPolicy';
import PasswordResetScreen from './PasswordResetScreen';
import SignupTerms from './SignupTerms';

// 사진이 없을 때의 기본 프로필: 메뉴 아래 · 내 공간과 같은 그림
import DefaultAvatar from '../shared/DefaultAvatar';

const PROVIDERS = [
  { id: 'kakao', name: '카카오', color: '#FEE500' },
  { id: 'google', name: '구글', color: '#FFFFFF' },
  { id: 'apple', name: '애플', color: '#191919' },
];
const emptyValues = () => ({ email: '', password: '', confirmation: '' });
const emptyTerms = () => ({ service: false, privacy: false, marketing: false, marketingPrivacy: false, adEmail: false, adPush: false, adNightPush: false });

/**
 * onClose: 있으면 '나중에'를 보이고 누르면 닫는다(로그인이 필요한 기능에서 띄운 경우).
 */
export default function AuthScreen({
  onContinue,
  legalDocuments = signupDocuments,
  openDocument = Linking.openURL,
  onClose = null,
  service = authService,
  photoPicker = pickProfilePhoto,
  verificationService = service.verificationService,
  emailVerificationEnabled = typeof __DEV__ !== 'undefined' && __DEV__,
}) {
  const { isPhone, formFactor } = useFormFactor();
  useOrientationLock(formFactor, false);
  const [route, setRoute] = useState('welcome');
  const [ageConfirmed, setAgeConfirmed] = useState(null);
  const [enrollmentProvider, setEnrollmentProvider] = useState('email');
  const [values, setValues] = useState(emptyValues);
  const [touched, setTouched] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [info, setInfo] = useState(null);
  const [profile, setProfile] = useState(null);
  const [nickname, setNickname] = useState('');
  const [terms, setTerms] = useState(emptyTerms);
  const [photoUri, setPhotoUri] = useState(null);
  const [verificationAttempt, setVerificationAttempt] = useState(0);
  const [signupComplete, setSignupComplete] = useState(false);
  const [needsLoginAccess, setNeedsLoginAccess] = useState(false);
  const [accessId, setAccessId] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const canSetDevelopmentAccess = typeof __DEV__ !== 'undefined' && __DEV__ &&
    typeof verificationService?.setDevelopmentAccess === 'function';
  const job = useRef(0);
  const running = useRef(false);
  const enrollmentBlocked = useRef(false);
  const alive = useRef(true);
  const passwordInput = useRef(null);
  const confirmationInput = useRef(null);
  const formScroll = useRef(null);
  const focusedInput = useRef(null);
  const scrollOffset = useRef(0);
  const keyboardTop = useRef(Infinity);
  // 안드로이드 전체 화면(edge-to-edge)은 키보드가 떠도 창이 줄지 않고, 폼이 화면에 다 들어가면 스크롤할 여유도 없어 아래 칸(비밀번호 확인)이 키보드에 가렸다.
  // 키보드 높이만큼 아래를 비워 스크롤할 수 있게 한다.
  const [keyboardPad, setKeyboardPad] = useState(0);
  const focusTimer = useRef(null);
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
      if (Platform.OS === 'android') setKeyboardPad(event.endCoordinates.height || 0); // iOS 는 KeyboardAvoidingView 가 이미 줄인다
      revealInput();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = Infinity;
      setKeyboardPad(0);
    });
    return () => {
      show.remove();
      hide.remove();
      clearTimeout(focusTimer.current);
    };
  }, []);
  const signup = route === 'signup',
    errors = credentialsErrors(values, signup);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      job.current++;
      service.cancelPending?.();
    };
  }, []);
  const navigate = (next, provider = enrollmentProvider) => {
    if (enrollmentBlocked.current && next !== 'welcome') next = 'underage';
    if (provider === 'email' && (next === 'signup' || next === 'eligibility') && !emailVerificationEnabled && !verificationService) {
      Keyboard.dismiss();
      setInfo({ title: '회원가입 준비 중', body: '이메일 인증 기능을 준비하고 있어요. 연결이 완료되면 회원가입을 이용할 수 있어요.' });
      return;
    }
    if (next === 'signup' && !signupEligibility({ ageConfirmed, terms }, legalDocuments)) next = 'eligibility';
    service.cancelPending?.({ keepEnrollment: next === 'profile' || next === 'verification' });
    Keyboard.dismiss();
    focusedInput.current = null;
    clearTimeout(focusTimer.current);
    scrollOffset.current = 0;
    formScroll.current?.scrollTo({ y: 0, animated: false });
    job.current++;
    running.current = false;
    setBusy(false);
    setMessage('');
    setTouched({});
    setInfo(null);
    setSignupComplete(false);
    setNeedsLoginAccess(false);
    setAccessId('');
    setAccessPassword('');
    setRoute(next);
    if (next === 'welcome' || next === 'underage') {
      enrollmentBlocked.current = next === 'underage';
      setPhotoUri(null);
      setValues(emptyValues());
      setNickname('');
      setProfile(null);
      setTerms(emptyTerms());
      setAgeConfirmed(null);
      setEnrollmentProvider('email');
    }
  };
  const beginEnrollment = (provider = 'email') => {
    setEnrollmentProvider(provider);
    navigate('eligibility', provider);
  };
  const continueEnrollment = () => {
    if (enrollmentBlocked.current || !signupEligibility({ ageConfirmed, terms }, legalDocuments)) return;
    if (enrollmentProvider === 'email') { navigate('signup'); return; }
    run(
      () => service.social(enrollmentProvider),
      (result) => {
        setPhotoUri(null);
        setValues(emptyValues());
        setProfile(result);
        navigate('profile');
      },
    );
  };
  const viewDocument = async (key, title) => {
    const url = createSignupDocuments(legalDocuments)[key];
    if (!url) {
      setInfo({ title: '문서 준비 중', body: '아직 공개되지 않은 문서예요. 잠시 후 다시 확인해 주세요.' });
      return;
    }
    try { await openDocument(url); }
    catch { if (alive.current) setInfo({ title, body: '문서를 열지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.' }); }
  };
  const back = () =>
    navigate(route === 'verification' || (route === 'profile' && profile?.provider === 'email') ? 'signup' : route === 'signup' ? 'eligibility' : 'welcome');
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (info) {
        setInfo(null);
        return true;
      }
      if (route === 'welcome' && needsLoginAccess) {
        navigate('welcome');
        return true;
      }
      if (route !== 'welcome') {
        back();
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [route, profile, info, needsLoginAccess]);
  const run = async (action, onSuccess, onFailure) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setMessage('');
    const id = ++job.current;
    try {
      const result = await action();
      if (alive.current && id === job.current) onSuccess(result);
    } catch (error) {
      if (alive.current && id === job.current) {
        onFailure?.(error);
        setMessage(typeof error?.message === 'string' && error.message.trim()
          ? error.message : '처리하지 못했어요. 다시 시도해 주세요.');
      }
    } finally {
      if (alive.current && id === job.current) {
        running.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 5000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (!signupComplete) return;
    const timer = setTimeout(() => setSignupComplete(false), 2500);
    return () => clearTimeout(timer);
  }, [signupComplete]);
  const change = (name, value) => {
    setSignupComplete(false);
    setValues((current) => ({ ...current, [name]: value }));
    setMessage('');
  };
  const blur = (name) => setTouched((current) => ({ ...current, [name]: true }));
  const credentialsSubmit = () => {
    setTouched({ email: true, password: true, confirmation: signup });
    if (!credentialsValid(values, signup)) return;
    if (signup) {
      if (!signupEligibility({ ageConfirmed, terms }, legalDocuments)) { navigate('eligibility'); return; }
      if (profile?.email !== normalizeEmail(values.email)) setPhotoUri(null);
      setProfile({ provider: 'email', email: normalizeEmail(values.email) });
      navigate('verification');
    }
    else if (!needsLoginAccess) submitLogin();
  };
  const submitLogin = () => {
    if (!credentialsValid(values, false)) return;
    run(
      () => service.login(values),
      (result) => {
        Keyboard.dismiss();
        setValues(emptyValues());
        onContinue(result);
      },
      (error) => {
        if (canSetDevelopmentAccess && error?.code === 'DEVELOPMENT_ACCESS_REQUIRED') {
          Keyboard.dismiss();
          setNeedsLoginAccess(true);
        }
      },
    );
  };
  const changeNickname = (value) => {
    setNickname(value);
    setMessage('');
  };
  const profileReady = canCompleteProfile({ nickname, terms }) && (profile?.provider !== 'email' || ageConfirmed);
  const complete = () => {
    if (profileReady)
      run(
        () => service.completeProfile({ ...profile, nickname, photoUri, terms }),
        (result) => {
          if (result.provider === 'email') {
            navigate('welcome');
            setValues({ ...emptyValues(), email: result.email });
            setSignupComplete(true);
          } else {
            Keyboard.dismiss();
            setValues(emptyValues());
            onContinue(result);
          }
        },
        (error) => {
          if (profile?.provider === 'email' && error?.code === 'SIGNUP_DRAFT_REQUIRED') {
            navigate('signup');
          } else if (profile?.provider === 'email' && error?.code === 'INVALID_SIGNUP_TOKEN') {
            // 같은 가입 흐름에서 재인증한다. 닉네임·사진·약관은 부모 상태에 유지한다.
            setVerificationAttempt(value => value + 1);
            navigate('verification');
          }
        },
      );
  };
  const link = (label, onPress, style) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[s.link, style]}
    >
      <Text style={s.linkText}>{label}</Text>
    </Pressable>
  );
  const primary = (label, onPress, disabled = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [s.button, (disabled || busy) && s.disabled, pressed && s.pressed]}
    >
      {busy ? <ActivityIndicator color={colors.surface} /> : null}
      <Text style={s.buttonText}>{busy ? '처리 중…' : label}</Text>
    </Pressable>
  );
  if (route === 'password-reset') {
    return (
      <SafeAreaView style={[s.safe, isPhone && { backgroundColor: colors.surface }]}>
        <PasswordResetScreen
          compact={isPhone}
          email={values.email}
          service={service}
          onClose={() => navigate('welcome')}
          onComplete={() => navigate('welcome')}
        />
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={[s.safe, isPhone && { backgroundColor: colors.surface }]}>
      <KeyboardAvoidingView
        style={s.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={formScroll}
          style={s.scrollViewport}
          onLayout={revealInput}
          onContentSizeChange={revealInput}
          onScroll={(event) => {
            scrollOffset.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[s.scroll, isPhone && s.phoneScroll, keyboardPad > 0 && { paddingBottom: keyboardPad }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <View style={[s.card, isPhone && s.phoneCard]}>
            {route !== 'welcome' && route !== 'underage' && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이전 화면"
                onPress={back}
                style={s.back}
              >
                <AppIcon name="chevron-left" size={20} forText={12.5} />
                <Text style={s.linkText}>
                  {(route === 'verification' || (route === 'profile' && profile?.provider === 'email')) ? '이전 화면' : '시작 화면'}
                </Text>
              </Pressable>
            )}
            <View style={[s.header, route === 'welcome' && s.welcomeHeader, isPhone && s.phoneHeader]}>
              <BrandLogo size={52} />
              <View style={[s.headingCopy, isPhone && s.phoneCopy]}>
                <Text accessibilityRole="header" style={s.title}>
                  {route === 'welcome'
                    ? 'DIO에 오신 걸 환영해요'
                    : route === 'underage' ? '지금은 가입할 수 없어요'
                    : route === 'eligibility' ? (isPhone ? '가입 전\n확인해 주세요' : '가입 전 확인해 주세요')
                    : route === 'signup'
                      ? '나만의 기록을 시작해요'
                      : route === 'verification' ? '이메일을 인증해 주세요'
                      : '프로필을 완성해 주세요'}
                </Text>
                <Text style={s.subtitle}>
                  {route === 'welcome'
                    ? '함께 기록하고, 추억을 나눠 보세요.'
                    : route === 'underage' || route === 'eligibility' ? 'DIO는 만 14세 이상만 가입할 수 있어요.'
                    : route === 'signup'
                      ? '이메일로 DIO 계정을 만들어 주세요.'
                      : route === 'verification' ? '인증번호를 입력해 이메일을 확인해 주세요.'
                      : '나만의 이름으로 DIO의 기록을 시작해요.'}
                </Text>
              </View>
            </View>
            {route === 'underage' ? (
              <View style={s.form}>
                {primary('시작 화면으로', () => navigate('welcome'))}
              </View>
            ) : route === 'eligibility' ? (
              <View style={s.form}>
                <View accessibilityRole="radiogroup" accessibilityLabel="가입 가능 연령">
                  <AgeChoice label="만 14세 이상입니다" checked={ageConfirmed === true} disabled={busy}
                    onPress={() => setAgeConfirmed(true)} />
                  <AgeChoice label="만 14세 미만입니다" checked={false} disabled={busy}
                    onPress={() => { enrollmentBlocked.current = true; navigate('underage'); }} />
                </View>
                <View style={s.consentDivider} />
                <SignupTerms terms={terms} onChange={setTerms} onView={viewDocument} disabled={busy} />
                {primary('동의하고 계속', continueEnrollment, !signupEligibility({ ageConfirmed, terms }, legalDocuments))}
              </View>
            ) : route === 'verification' ? (
              <EmailVerification key={`${profile?.email}:${verificationAttempt}`} email={profile?.email}
                service={verificationService} Field={FormField} primary={primary}
                focusInput={focusInput} blurInput={blurInput} onComplete={() => {
                  Keyboard.dismiss();
                  if (verificationService && typeof verificationService.prepareSignup !== 'function') {
                    setMessage('가입 정보 준비 기능이 연결되지 않았어요. 잠시 후 다시 시도해 주세요.');
                    return;
                  }
                  if (verificationService) {
                    run(() => verificationService.prepareSignup({ ...values, ageConfirmed }), (result) => {
                      if (result?.provider !== 'email' || typeof result.email !== 'string' ||
                          normalizeEmail(result.email) !== normalizeEmail(values.email)) {
                        throw new Error('가입 정보를 확인하지 못했어요. 다시 시도해 주세요.');
                      }
                      setProfile(result);
                      navigate('profile');
                    }, (error) => {
                      if (error?.code === 'INVALID_SIGNUP_TOKEN') {
                        setVerificationAttempt(value => value + 1);
                        navigate('verification');
                      }
                    });
                  } else navigate('profile');
                }} />
            ) : route === 'welcome' || route === 'signup' ? (
              <View style={s.form}>
                <FormField
                  onInputFocus={focusInput}
                  onInputBlur={blurInput}
                  key={`${route}-email`}
                  label="이메일"
                  placeholder="이메일을 입력해 주세요"
                  value={values.email}
                  onChange={(value) => change('email', value)}
                  onBlur={() => blur('email')}
                  error={touched.email ? errors.email : ''}
                  editable={!busy}
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordInput.current?.focus()}
                />
                <FormField
                  onInputFocus={focusInput}
                  onInputBlur={blurInput}
                  key={`${route}-password`}
                  inputRef={passwordInput}
                  label="비밀번호"
                  placeholder="비밀번호를 입력해 주세요"
                  value={values.password}
                  onChange={(value) => change('password', value)}
                  onBlur={() => blur('password')}
                  error={touched.password ? errors.password : ''}
                  editable={!busy}
                  password
                  returnKeyType={signup ? 'next' : 'done'}
                  onSubmitEditing={() =>
                    signup ? confirmationInput.current?.focus() : credentialsSubmit()
                  }
                />
                {signup && (
                  <FormField
                    onInputFocus={focusInput}
                    onInputBlur={blurInput}
                    inputRef={confirmationInput}
                    label="비밀번호 확인"
                    placeholder="비밀번호를 다시 입력해 주세요"
                    value={values.confirmation}
                    onChange={(value) => change('confirmation', value)}
                    onBlur={() => blur('confirmation')}
                    error={touched.confirmation || values.confirmation ? errors.confirmation : ''}
                    editable={!busy}
                    password
                    returnKeyType="done"
                    onSubmitEditing={credentialsSubmit}
                  />
                )}
                {!signup && needsLoginAccess && canSetDevelopmentAccess ? <>
                  <Text style={s.muted}>개발 서버 접속 인증 · 앱을 다시 실행하면 초기화돼요.</Text>
                  <FormField label="개발 서버 ID" value={accessId} onChange={setAccessId}
                    onInputFocus={focusInput} onInputBlur={blurInput} editable={!busy} />
                  <FormField label="개발 서버 비밀번호" value={accessPassword} onChange={setAccessPassword} password
                    onInputFocus={focusInput} onInputBlur={blurInput} editable={!busy} />
                  {primary('접속 인증 후 로그인', () => {
                    if (running.current) return;
                    try {
                      verificationService.setDevelopmentAccess(accessId, accessPassword);
                      setAccessPassword('');
                      setNeedsLoginAccess(false);
                      submitLogin();
                    } catch (error) {
                      setMessage(error?.message || '개발 서버 접속 정보를 확인해 주세요.');
                    }
                  }, !accessId.trim() || !accessPassword || !credentialsValid(values, false))}
                </> : null}
                <View style={s.submitArea}>
                  {message ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      style={[s.error, s.submitError]}
                    >
                      {message}
                    </Text>
                  ) : null}
                  {(signup || !needsLoginAccess) && primary(
                    signup ? '다음' : '로그인',
                    credentialsSubmit,
                    !credentialsValid(values, signup) || (!signup && needsLoginAccess),
                  )}
                </View>
                {signup ? (
                  <View style={s.footer}>
                    <Text style={s.muted}>이미 계정이 있나요?</Text>
                    {link('로그인 화면으로', () => {
                      setValues((current) => ({ ...current, password: '', confirmation: '' }));
                      navigate('welcome');
                    })}
                  </View>
                ) : (
                  <View style={s.accountLinks}>
                    {link(
                      '아이디 찾기',
                      () =>
                        setInfo({
                          title: '아이디 찾기',
                          body: '가입한 이메일 찾기는 계정 서비스 연결 후 이용할 수 있어요.',
                        }),
                      s.accountLink,
                    )}
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={s.accountSeparator}
                    >
                      |
                    </Text>
                    {link(
                      '비밀번호 찾기',
                      () => navigate('password-reset'),
                      s.accountLink,
                    )}
                    <Text
                      accessibilityElementsHidden
                      importantForAccessibility="no"
                      style={s.accountSeparator}
                    >
                      |
                    </Text>
                    {link(
                      '회원가입',
                      () => {
                        setValues(emptyValues());
                        beginEnrollment('email');
                      },
                      s.accountLink,
                    )}
                  </View>
                )}
                {!signup && (
                  <View style={s.socialSection}>
                    <View style={s.divider}>
                      <View style={s.line} />
                      <Text style={s.muted}>간편 로그인</Text>
                      <View style={s.line} />
                    </View>
                    <View style={[s.socialRow, isPhone && s.phoneSocialRow]}>
                      {PROVIDERS.map((provider) => (
                        <Pressable
                          key={provider.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${provider.name}로 로그인`}
                          accessibilityState={{ disabled: busy }}
                          disabled={busy}
                          onPress={() => beginEnrollment(provider.id)}
                          style={({ pressed }) => [
                            s.social,
                            busy && s.disabled,
                            pressed && s.pressed,
                          ]}
                        >
                          <View style={[s.socialCircle, { backgroundColor: provider.color }]}>
                            <ProviderIcon provider={provider.id} />
                          </View>
                          <Text style={s.socialLabel}>{provider.name}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {onClose && <Pressable accessibilityRole="button" accessibilityLabel="나중에" accessibilityState={{ disabled: busy }} disabled={busy}
                      onPress={() => { if (!running.current) { Keyboard.dismiss(); onClose(); } }} style={s.link}>
                      <Text style={s.browseText}>나중에</Text>
                    </Pressable>}
                  </View>
                )}
              </View>
            ) : (
              <View style={s.form}>
                <View style={s.avatarArea}>
                  <View style={s.avatarSlot}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="프로필 사진 선택"
                      accessibilityState={{ disabled: busy }}
                      disabled={busy}
                      onPress={() =>
                        run(photoPicker, (uri) => {
                          if (uri) setPhotoUri(uri);
                        })
                      }
                      style={s.avatar}
                    >
                      {photoUri ? (
                        <Image
                          source={{ uri: photoUri }}
                          accessibilityLabel="선택한 프로필 사진"
                          style={s.avatarPhoto}
                        />
                      ) : (
                        <DefaultAvatar accessibilityLabel="기본 프로필" style={s.avatarPhoto} />
                      )}
                      <View style={s.avatarEdit}>
                        <AppIcon name="edit" size={14} />
                      </View>
                    </Pressable>
                    {photoUri && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="프로필 사진 삭제"
                        accessibilityState={{ disabled: busy }}
                        disabled={busy}
                        onPress={() => setPhotoUri(null)}
                        style={s.avatarRemove}
                      >
                        <View style={s.avatarRemoveIcon}>
                          <AppIcon name="close" size={14} />
                        </View>
                      </Pressable>
                    )}
                  </View>
                </View>
                <View>
                  <Text style={s.label}>닉네임</Text>
                  <View style={s.checkRow}>
                    <View style={s.checkField}>
                      <FormField
                        onInputFocus={focusInput}
                        onInputBlur={blurInput}
                        label="닉네임"
                        hideLabel
                        placeholder="닉네임을 입력해 주세요"
                        value={nickname}
                        onChange={changeNickname}
                        editable={!busy}
                        maxLength={12}
                      />
                    </View>
                  </View>
                  {nickname && nicknameError(nickname) ? (
                    <Text style={s.error}>{nicknameError(nickname)}</Text>
                  ) : null}
                </View>
                {primary('가입 완료', complete, !profileReady)}
              </View>
            )}
            {(route === 'profile' || route === 'verification' || route === 'eligibility') && message ? (
              <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.error}>
                {message}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {signupComplete && (
        <View pointerEvents="none" style={s.toastPosition}>
          <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={s.toast}>
            가입이 완료됐어요.
          </Text>
        </View>
      )}
      <EditorModal
        visible={!!info}
        transparent
        animationType="none"
        onRequestClose={() => setInfo(null)}
        statusBarTranslucent
      >
        <SafeAreaView style={s.modalBackdrop}>
          <View style={s.modalCard}>
            <Text accessibilityRole="header" style={s.modalTitle}>
              {info?.title}
            </Text>
            <ScrollView>
              <Text style={s.muted}>{info?.body}</Text>
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="안내 닫기"
              onPress={() => setInfo(null)}
              style={s.button}
            >
              <Text style={s.buttonText}>확인</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </EditorModal>
    </SafeAreaView>
  );
}
function FormField({
  onInputFocus,
  onInputBlur,
  label,
  hideLabel,
  value,
  onChange,
  error,
  inputRef,
  password,
  editable = true,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const ownInput = useRef(null);
  const { isPhone: phoneForm } = useFormFactor(); // 입력칸 높이는 폰 풀스크린에서만 키운다(코덱스 2026-11-03)
  return (
    <View>
      {!hideLabel && <Text style={s.label}>{label}</Text>}
      <View style={[s.field, phoneForm && s.phoneField, focused && s.focus, error && s.invalid]}>
        <TextInput
          {...props}
          ref={(node) => {
            ownInput.current = node;
            if (inputRef) inputRef.current = node;
          }}
          accessibilityLabel={label}
          accessibilityHint={error || undefined}
          value={value}
          onChangeText={onChange}
          onFocus={() => {
            setFocused(true);
            onInputFocus?.(ownInput.current);
          }}
          onBlur={() => {
            setFocused(false);
            onInputBlur?.(ownInput.current);
            props.onBlur?.();
          }}
          editable={editable}
          secureTextEntry={password && !visible}
          keyboardType={password && visible && Platform.OS === 'android' ? 'visible-password' : props.keyboardType}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={props.autoComplete ?? 'off'}
          textContentType={props.textContentType ?? 'none'}
          placeholderTextColor={colors.textMuted}
          style={[s.input, phoneForm && s.phoneInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
        />
        {password && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${label} ${visible ? '숨기기' : '보기'}`}
            disabled={!editable}
            onPress={() => setVisible((current) => !current)}
            style={s.eye}
          >
            <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text accessibilityLiveRegion="polite" style={s.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
function AgeChoice({ label, checked, onPress, disabled }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityLabel={label}
      accessibilityState={{ checked, disabled }}
      {...(Platform.OS === 'web' ? { 'aria-checked': checked, 'aria-disabled': !!disabled } : {})}
      disabled={disabled} onPress={onPress} style={s.termButton}>
      <View style={[s.checkbox, s.ageRadio, checked && s.checked]}>
        {checked && <View style={s.ageRadioDot} />}
      </View>
      <Text style={s.termText}>{label}</Text>
    </Pressable>
  );
}
