import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import Header from '../diary/components/Header';
import { colors, radius } from '../shared/theme';
import { authService } from './authService';
import { emailError, normalizeEmail, passwordError } from './validation';

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
  const addressError = emailError(address);
  const passwordIssue = passwordError(password);
  const confirmationIssue = confirmation && password !== confirmation ? '비밀번호가 일치하지 않아요.' : '';
  const canSetPassword = !passwordIssue && !confirmationIssue && !!confirmation;
  const heading = useMemo(() => ({
    email: '비밀번호 재설정',
    code: '인증번호 확인',
    password: '새 비밀번호 설정',
    success: '비밀번호 재설정 완료',
  })[step], [step]);

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

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : Platform.OS === 'android' ? 'height' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, compact && styles.phoneScroll]}
        keyboardShouldPersistTaps="handled"
      >
        <Header
          title={heading}
          compact={compact}
          left={step !== 'success' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="마이페이지로 돌아가기"
              onPress={leave}
              style={({ pressed }) => [styles.headerBack, compact && styles.headerBackCompact, pressed && styles.pressed]}
            >
              <AppIcon name="chevron-left" size={22} color={colors.text} />
            </Pressable>
          ) : null}
        />
        <View style={[styles.card, compact && styles.phoneCard]}>
          {step === 'email' && (
            <>
              <Text style={styles.copy}>가입할 때 사용한 이메일을 입력해 주세요.</Text>
              <Field
                label="이메일"
                value={address}
                onChangeText={(value) => { setAddress(value); setError(''); }}
                keyboardType="email-address"
                autoComplete="email"
                placeholder="name@example.com"
              />
              <Hint text="입력한 이메일로 인증번호를 보내드려요." />
              <Button label="인증번호 보내기" busy={busy} disabled={!!addressError} onPress={() => requestCode()} />
            </>
          )}
          {step === 'code' && (
            <>
              <Text style={styles.copy}><Text style={styles.strong}>{normalizedAddress}</Text>로 보낸 인증번호를 입력해 주세요.</Text>
              <Field
                label="인증번호"
                value={code}
                onChangeText={(value) => { setCode(value.replace(/[^0-9]/g, '')); setError(''); }}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="인증번호 6자리"
              />
              <View style={styles.timerRow}>
                <Text accessibilityLiveRegion="polite" style={[styles.timer, !expiresIn && styles.dangerText]}>
                  {expiresIn ? `남은 시간 ${timeLabel(expiresIn)}` : '인증번호가 만료됐어요'}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="인증번호 재전송"
                  disabled={busy || resendIn > 0}
                  onPress={() => requestCode(true)}
                  style={({ pressed }) => [styles.textButton, (busy || resendIn > 0) && styles.disabled, pressed && styles.pressed]}
                >
                  <Text style={styles.textButtonLabel}>{resendIn ? `재전송 ${resendIn}초` : '인증번호 재전송'}</Text>
                </Pressable>
              </View>
              <Button label="인증번호 확인" busy={busy} disabled={code.length !== 6 || !expiresIn} onPress={verifyCode} />
            </>
          )}
          {step === 'password' && (
            <>
              <Text style={styles.copy}>앞으로 사용할 새 비밀번호를 입력해 주세요.</Text>
              <PasswordField label="새 비밀번호" value={password} onChangeText={(value) => { setPassword(value); setError(''); }} />
              <Hint text="영문·숫자를 포함해 8~32자로 입력해 주세요." />
              <PasswordField label="새 비밀번호 확인" value={confirmation} onChangeText={(value) => { setConfirmation(value); setError(''); }} />
              {!!confirmationIssue && <Text accessibilityRole="alert" style={styles.inlineError}>{confirmationIssue}</Text>}
              <Button label="비밀번호 재설정" busy={busy} disabled={!canSetPassword} onPress={resetPassword} />
            </>
          )}
          {step === 'success' && (
            <>
              <View style={styles.successIcon}><Text style={styles.successMark}>✓</Text></View>
              <Text style={styles.successTitle}>새 비밀번호를 설정했어요.</Text>
              <Text style={styles.copy}>새 비밀번호로 다시 로그인해 주세요.</Text>
              <Button label="로그인으로 돌아가기" onPress={onComplete} />
            </>
          )}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, ...props }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} placeholderTextColor={colors.textMuted} style={styles.field} {...props} />
    </View>
  );
}

function PasswordField(props) {
  return <Field {...props} secureTextEntry autoComplete="new-password" />;
}

function Hint({ text }) {
  return <Text style={styles.hint}>{text}</Text>;
}

function Button({ label, onPress, disabled, busy }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, (disabled || busy) && styles.disabled, pressed && styles.pressed]}
    >
      {busy && <ActivityIndicator color={colors.surface} />}
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  scroll: { flexGrow: 1, paddingHorizontal: 30, paddingTop: 38, paddingBottom: 44 },
  phoneScroll: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 48 },
  headerBack: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  headerBackCompact: { width: 38, height: 38, borderRadius: 10, borderWidth: 0, backgroundColor: 'transparent' },
  card: { width: '100%', alignSelf: 'center', maxWidth: 520, padding: 32, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  phoneCard: { padding: 24, borderRadius: radius.lg },
  copy: { color: colors.textMuted, fontSize: 15, lineHeight: 23, marginBottom: 28 },
  strong: { color: colors.text, fontWeight: '700' },
  fieldWrap: { marginTop: 18 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  field: { minHeight: 52, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, color: colors.text, fontSize: 16, paddingHorizontal: 16, backgroundColor: colors.surface },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  button: { minHeight: 52, marginTop: 32, borderRadius: radius.md, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primaryStrong },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: '800' },
  timerRow: { minHeight: 48, marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  timer: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' },
  textButton: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 6 },
  textButtonLabel: { color: colors.primaryStrong, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 14, lineHeight: 21, marginTop: 16 },
  inlineError: { color: colors.danger, fontSize: 13, lineHeight: 20, marginTop: 8 },
  notice: { color: colors.primaryStrong, fontSize: 14, lineHeight: 21, marginTop: 16 },
  successIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryStrong, marginBottom: 20 },
  successMark: { color: colors.surface, fontSize: 30, fontWeight: '800' },
  successTitle: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 10 },
  dangerText: { color: colors.danger },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.7 },
});
