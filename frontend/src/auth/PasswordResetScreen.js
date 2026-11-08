import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AppIcon from '../shared/AppIcon';
import BrandLogo from '../shared/BrandLogo';
import DioButton from '../shared/DioButton';
import { MakerBar } from '../shared/MakerKit';
import { colors, radius } from '../shared/theme';
import { authService } from './authService';
import { profileStyles as ps } from './profileStyles';
import { authStyles as s } from './styles';
import { accountEmailError, normalizeEmail, passwordError } from './validation';

const FALLBACK_EXPIRES_IN = 10 * 60;
const FALLBACK_RESEND_AFTER = 60;

const seconds = (value, fallback) =>
  Number.isSafeInteger(value) && value >= 0 ? value : fallback;

const timeLabel = (value) => {
  const minutes = Math.floor(Math.max(value, 0) / 60);
  const secondsLeft = Math.max(value, 0) % 60;
  return `${minutes}:${String(secondsLeft).padStart(2, '0')}`;
};

export default function PasswordResetScreen({
  email = '',
  compact = false,
  change = false, // 로그인한 회원이 회원정보 수정에서 여는 비밀번호 변경(제목 · 머리글이 회원정보 수정과 같다)
  backLabel = '마이페이지로 돌아가기',
  onClose,
  onComplete,
  service = authService,
}) {
  const [step, setStep] = useState('email');
  const [address, setAddress] = useState(email);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!expiresAt && !resendAt) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt, resendAt]);

  const expiresIn = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const normalizedAddress = normalizeEmail(address);
  const addressError = accountEmailError(address);
  const passwordIssue = passwordError(password);
  const confirmationIssue = confirmation && password !== confirmation ? '비밀번호가 일치하지 않아요.' : '';
  const canSetPassword = !passwordIssue && !confirmationIssue && !!confirmation;
  const heading = useMemo(() => ({
    email: change ? '비밀번호 변경' : '비밀번호 재설정',
    code: '인증번호 확인',
    password: '새 비밀번호 설정',
    success: change ? '비밀번호 변경 완료' : '비밀번호 재설정 완료',
  })[step], [step, change]);
  // 로그인 화면에서 온 찾기 흐름(change 아님)은 로그인 · 가입과 같은 틀: 흰 바탕 · 마스코트 · 가운데 큰 제목 · 전체 폭 버튼(지라 643)
  const flowTitle = {
    email: '비밀번호를 재설정해요',
    code: '이메일을 인증해 주세요',
    password: '새 비밀번호를 설정해 주세요',
    success: '비밀번호를 재설정했어요',
  }[step];

  const run = async (task) => {
    if (busy) return { ok: false };
    setBusy(true);
    setError('');
    setNotice('');
    try {
      return { ok: true, value: await task() };
    } catch (reason) {
      setError(reason?.message || '처리하지 못했어요. 다시 시도해 주세요.');
      return { ok: false };
    } finally {
      setBusy(false);
    }
  };

  const requestCode = async (resend = false) => {
    if (addressError) {
      setError(addressError);
      return;
    }
    const outcome = await run(() => service.requestPasswordReset(normalizedAddress));
    if (!outcome.ok) return;
    const result = outcome.value || {};
    const timestamp = Date.now();
    setExpiresAt(timestamp + seconds(result.expiresIn, FALLBACK_EXPIRES_IN) * 1000);
    setResendAt(timestamp + seconds(result.resendAfter, FALLBACK_RESEND_AFTER) * 1000);
    setNow(timestamp);
    setCode('');
    setStep('code');
    setNotice(resend ? '인증번호를 다시 보냈어요.' : '인증번호를 이메일로 보냈어요.');
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('인증번호 6자리를 입력해 주세요.');
      return;
    }
    if (!expiresIn) {
      setError('인증번호가 만료됐어요. 다시 보내 주세요.');
      return;
    }
    const outcome = await run(() => service.verifyPasswordReset(normalizedAddress, code));
    if (!outcome.ok) return;
    setStep('password');
    setNotice('이메일 인증이 완료됐어요.');
  };

  const resetPassword = async () => {
    if (!canSetPassword) {
      setError(passwordIssue || confirmationIssue || '새 비밀번호를 다시 확인해 주세요.');
      return;
    }
    const outcome = await run(() => service.completePasswordReset({ email: normalizedAddress, newPassword: password }));
    if (!outcome.ok) return;
    setPassword('');
    setConfirmation('');
    setStep('success');
  };

  const leave = () => {
    service.cancelPending?.();
    onClose?.();
  };

  // 내 공간 · 회원정보 수정과 같은 문법: 상단 바(높이 64, `<` 가 이 흐름에서 나가기) + 카드 없는 열린 폼 + 하단 고정 줄(주 버튼 하나)
  const block = !change; // 찾기 흐름은 하단 고정 줄 없이 전체 폭 버튼을 폼 안에 둔다
  const primary = {
    email: <DioButton variant="filled" block={block} label="인증번호 보내기" disabled={busy || !!addressError} onPress={() => requestCode()} />,
    code: <DioButton variant="filled" block={block} label="인증번호 확인" disabled={busy || code.length !== 6 || !expiresIn} onPress={verifyCode} />,
    password: <DioButton variant="filled" block={block} label={change ? '비밀번호 변경' : '비밀번호 재설정'} disabled={busy || !canSetPassword} onPress={resetPassword} />,
    // 변경 흐름은 바꾼 뒤 세션을 끝내고(onClearSession) 로그인 화면으로 보낸다. 로그인 화면에서 온 찾기 흐름만 '돌아가기'
    success: <DioButton variant="filled" block={block} label={change ? '다시 로그인' : '로그인으로 돌아가기'} onPress={onComplete} />,
  }[step];
    return (
    <KeyboardAvoidingView
      style={[styles.root, !change && compact && styles.authRoot]}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
    >
      <ScrollView
        contentContainerStyle={change ? [ps.scroll, compact && ps.phoneScroll] : [s.scroll, compact && s.phoneScroll]}
        keyboardShouldPersistTaps="handled"
      >
        {change && (
          <View style={ps.rail}>
            <View style={ps.heading}>
              {step !== 'success' && (
                <Pressable accessibilityRole="button" accessibilityLabel={backLabel} disabled={busy} onPress={leave} style={ps.back}>
                  <AppIcon name="chevron-left" size={24} />
                </Pressable>
              )}
              <Text accessibilityRole="header" style={[ps.title, compact && ps.titleCompact]}>{heading}</Text>
            </View>
          </View>
        )}
        <View style={change ? [styles.form, ps.rail] : [s.card, compact && s.phoneCard]}>
          {!change && step !== 'success' && (
            <Pressable accessibilityRole="button" accessibilityLabel="이전 화면" disabled={busy} onPress={leave} style={s.back}>
              <AppIcon name="chevron-left" size={20} forText={12.5} />
              <Text style={s.linkText}>{backLabel}</Text>
            </Pressable>
          )}
          {!change && (
            <View style={[s.header, compact && s.phoneHeader]}>
              <BrandLogo size={52} />
              <View style={[s.headingCopy, compact && s.phoneCopy]}>
                <Text accessibilityRole="header" style={s.title}>{flowTitle}</Text>
              </View>
            </View>
          )}
          <View style={!change && s.form}>
          {step === 'email' && (
            <Field
              flow={!change}
              label="이메일"
              value={address}
              onChangeText={(value) => { setAddress(value); setError(''); }}
              keyboardType="email-address"
              autoComplete="email"
              placeholder="이메일을 입력해 주세요"
            />
          )}
          {step === 'code' && (
            <>
              <Text style={styles.copy}><Text style={styles.strong}>{normalizedAddress}</Text>로 보낸 인증번호</Text>
              <Field
              flow={!change}
                label="인증번호"
                value={code}
                onChangeText={(value) => { setCode(value.replace(/[^0-9]/g, '')); setError(''); }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="6자리 숫자"
              />
              <View style={[styles.timerRow, !change && styles.flowFlush]}>
                <Text accessibilityLiveRegion="polite" style={[styles.timer, !expiresIn && styles.dangerText]}>
                  {expiresIn ? `남은 시간 ${timeLabel(expiresIn)}` : '인증번호가 만료됐어요'}
                </Text>
                <DioButton
                  variant="ghost"
                  label="인증번호 재전송"
                  text={resendIn ? `재전송 (${resendIn}초)` : '재전송'}
                  disabled={busy || resendIn > 0}
                  onPress={() => requestCode(true)}
                />
              </View>
            </>
          )}
          {step === 'password' && (
            <>
              <PasswordField flow={!change} label="새 비밀번호" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} />
              <Hint text="영문·숫자를 포함해 8~32자" />
              <PasswordField flow={!change} label="새 비밀번호 확인" value={confirmation} onChangeText={(value) => { setConfirmation(value); setError(''); }} />
              {!!confirmationIssue && <Text accessibilityRole="alert" style={styles.inlineError}>{confirmationIssue}</Text>}
            </>
          )}
          {step === 'success' && (
            <>
              <View style={styles.successIcon}><AppIcon name="check" size={30} color={colors.surface} strokeWidth={2.6} /></View>
              <Text style={styles.successTitle}>새 비밀번호를 설정했어요.</Text>
              <Text style={styles.copy}>새 비밀번호로 다시 로그인해 주세요.</Text>
            </>
          )}
          {!!error && <Text accessibilityRole="alert" style={[styles.error, !change && styles.flowFlush]}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.notice, !change && styles.flowFlush]}>{notice}</Text>}
          {!change && primary}
          </View>
        </View>
      </ScrollView>
      {change && <MakerBar>{primary}</MakerBar>}
    </KeyboardAvoidingView>
  );
}

// flow: 로그인 화면에서 온 찾기 흐름 — 로그인 · 가입 입력칸(authStyles)과 같은 모양
function Field({ label, flow = false, ...props }) {
  return (
    <View style={flow ? null : styles.fieldWrap}>
      <Text style={flow ? s.label : styles.fieldLabel}>{label}</Text>
      {flow ? (
        <View style={s.field}>
          <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textMuted} style={s.input} {...props} />
        </View>
      ) : (
        <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textMuted} style={styles.field} {...props} />
      )}
    </View>
  );
}

// flow(찾기 흐름)도 Field 로 그대로 넘어가 로그인 · 가입 입력칸 모양을 쓴다(Field 가 flow 를 꺼내 TextInput 에는 넘기지 않는다)
function PasswordField(props) {
  return <Field {...props} secureTextEntry autoComplete="new-password" />;
}

function Hint({ text }) {
  return <Text style={styles.hint}>{text}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  flowFlush: { marginTop: 0 }, // 찾기 흐름은 폼의 gap 16 이 간격을 맡는다
  authRoot: { backgroundColor: colors.surface }, // 로그인과 같게: 폰은 화면 전체 흰 바탕, 태블릿은 연보라 바탕 위 흰 카드
  scroll: { flexGrow: 1, paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32 },
  phoneScroll: { paddingHorizontal: 16, paddingTop: 16 },
  // 본문 최대 폭 760, 가운데. 카드 · 테두리 없이 열린 폼
  form: { width: '100%', alignSelf: 'center', maxWidth: 760 },
  copy: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginBottom: 4 },
  strong: { color: colors.text, fontWeight: '700' },
  fieldWrap: { marginTop: 12 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  field: { minHeight: 48, borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, color: colors.text, fontSize: 16, fontWeight: '600', paddingHorizontal: 14, backgroundColor: colors.surface },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  timerRow: { minHeight: 48, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  timer: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' },
  error: { color: colors.dangerStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  inlineError: { color: colors.dangerStrong, fontSize: 13, lineHeight: 20, marginTop: 8 },
  notice: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong, marginBottom: 20 },
  successTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  dangerText: { color: colors.dangerStrong },
});
