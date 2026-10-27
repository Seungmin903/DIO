import { useEffect, useRef, useState } from 'react';
import { AppState, Keyboard, Pressable, Text, View } from 'react-native';
import Icon from '../editor/components/controls/Icon';
import { authStyles as s } from './styles';
import { remainingSeconds, verificationClock } from './verificationTime';

export default function EmailVerification({ email, service, onComplete, Field, primary, focusInput, blurInput }) {
  const [preview] = useState(() => {
    if (__DEV__ && !service) {
      return require('./verificationPreview').createVerificationPreview();
    }
    return null;
  });
  const gateway = service ?? preview;
  const [code, setCode] = useState('');
  const [deadline, setDeadline] = useState(0);
  const [retryAt, setRetryAt] = useState(0);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const alive = useRef(true), running = useRef(false), input = useRef(null);
  const expires = remainingSeconds(deadline, now), cooldown = remainingSeconds(retryAt, now);
  useEffect(() => {
    alive.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const subscription = AppState.addEventListener('change', () => setNow(Date.now()));
    return () => { alive.current = false; clearInterval(timer); subscription.remove(); };
  }, []);
  const run = async (task) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError('');
    try { await task(); }
    catch (reason) {
      if (alive.current) setError(typeof reason?.message === 'string' && reason.message.trim()
        ? reason.message : '처리하지 못했어요. 다시 시도해 주세요.');
    }
    finally { running.current = false; if (alive.current) setBusy(false); }
  };
  const send = () => {
    if (!gateway || cooldown || verified) return;
    run(async () => {
      const result = await gateway.send(email);
      if (!alive.current) return;
      const time = Date.now();
      if (!Number.isFinite(result?.expiresIn) || result.expiresIn <= 0 ||
          !Number.isFinite(result?.retryAfter) || result.retryAfter < 0 ||
          !Number.isSafeInteger(time + Math.ceil(result.expiresIn * 1000)) ||
          !Number.isSafeInteger(time + Math.ceil(result.retryAfter * 1000))) {
        throw new Error('인증번호 발송 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      setNow(time);
      setDeadline(time + Math.ceil(result.expiresIn * 1000));
      setRetryAt(time + Math.ceil(result.retryAfter * 1000));
      setCode('');
    });
  };
  const verify = () => {
    if (!/^\d{6}$/.test(code) || !expires || verified) return;
    run(async () => {
      await gateway.verify(email, code);
      if (alive.current) {
        Keyboard.dismiss();
        setVerified(true);
      }
    });
  };
  return <View style={s.form}>
    <Text style={[s.muted, { textAlign: 'center' }]}>{email}</Text>
    {!gateway && <Text style={s.muted}>이메일 인증 서비스 연결을 준비하고 있어요.</Text>}
    {gateway?.preview && !verified && <Text style={s.verificationPreview}>{gateway.notice}</Text>}
    {!deadline && primary(busy ? '전송 중…' : '인증번호 받기', send, busy || !gateway)}
    {verified ? <>
      <View style={s.verificationComplete}>
        <View style={s.verificationCheck} accessible={false}>
          <Icon name="check" size={28} />
        </View>
        <Text accessibilityLiveRegion="polite" style={s.verificationCompleteText}>이메일 인증이 완료됐어요.</Text>
      </View>
      {primary('다음', onComplete)}
    </> : !!deadline && <>
      <Field label="인증번호" placeholder="6자리 숫자" value={code}
        onChange={(value) => { setCode(value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
        onInputFocus={focusInput} onInputBlur={blurInput} inputRef={input}
        keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" autoComplete="one-time-code"
        editable={!busy && !verified && expires > 0} onSubmitEditing={verify} />
      <View style={s.verificationDetails}>
        {!verified && <View style={s.verificationActions}>
          <Text style={[s.muted, !expires && s.error]}>
            {expires ? `남은 시간 ${verificationClock(expires)}` : '유효 시간 만료'}
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="인증번호 재전송"
            disabled={busy || cooldown > 0} accessibilityState={{ disabled: busy || cooldown > 0 }}
            style={[s.verificationResend, (busy || cooldown > 0) && s.disabled]} onPress={send}>
            <Text style={s.linkText}>{cooldown ? `재전송 (${cooldown}초)` : '재전송'}</Text>
          </Pressable>
        </View>}
        {!!error && <Text accessibilityRole="alert" style={[s.error, { marginTop: 0 }]}>{error}</Text>}
        {!verified && !expires && !error && <Text style={s.error}>인증번호를 다시 받아 주세요.</Text>}
      </View>
      {primary(busy ? '처리 중…' : '인증 확인', verify, busy || !expires || !/^\d{6}$/.test(code))}
    </>}
    {!deadline && !!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  </View>;
}
