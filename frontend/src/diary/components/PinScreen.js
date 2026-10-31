import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../shared/theme';
import { PIN_LENGTH } from '../../shared/appLock';
import DioButton from '../../shared/DioButton';
import ProfileAvatar from './ProfileAvatar';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'forgot', '0', 'erase'];

/**
 * 앱 잠금 비밀번호(숫자 4자리)를 받는 전체 화면. 모달 대신 화면 전체를 덮는다. 눌림 효과는 없다.
 * mode: 'unlock'(잠금 풀기, 돌아가기 없음) | 'verify'(지금 비밀번호 확인) | 'setup'(새 비밀번호를 두 번 받는다)
 * check(pin) → Promise<boolean>: unlock · verify 에서 맞는지. onDone(pin): 맞거나(setup 은 두 번 같으면) 부른다.
 * onCancel: 돌아가기(unlock 이면 없음). onForgot: 있으면 왼쪽 아래 '잊었어요' 칸을 둔다.
 */
export default function PinScreen({ mode, user, getProfilePhotoSource, check, onDone, onCancel, onForgot }) {
  const [digits, setDigits] = useState('');
  const [first, setFirst] = useState(null); // setup: 처음 입력한 값
  const [error, setError] = useState('');
  const busy = useRef(false);

  // 안드로이드 뒤로 가기: 잠금 화면은 막고, 그 밖에는 돌아가기와 같다
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (mode !== 'unlock') onCancel?.(); return true; });
    return () => subscription.remove();
  }, [mode, onCancel]);

  const finish = async pin => {
    if (mode === 'setup') {
      if (first === null) { setFirst(pin); setDigits(''); setError(''); return; }
      if (pin === first) { onDone(pin); return; }
      setFirst(null); setDigits(''); setError('두 번 입력한 비밀번호가 달라요');
      return;
    }
    busy.current = true;
    const ok = await check(pin).catch(() => false);
    busy.current = false;
    if (ok) onDone(pin);
    else { setDigits(''); setError('비밀번호가 달라요'); }
  };

  const press = key => {
    if (busy.current) return;
    if (key === 'erase') { setDigits(current => current.slice(0, -1)); return; }
    if (digits.length >= PIN_LENGTH) return;
    const next = digits + key;
    setDigits(next);
    if (next.length === PIN_LENGTH) finish(next);
  };

  const title = mode === 'setup' ? (first === null ? '새 비밀번호' : '한 번 더 입력해 주세요') : mode === 'verify' ? '지금 비밀번호' : '비밀번호를 입력해 주세요';

  return (
    <View style={local.root} accessibilityViewIsModal>
      <View style={local.top}>{mode !== 'unlock' && onCancel ? <DioButton variant="ghost" icon="chevron-left" label="돌아가기" onPress={onCancel} /> : null}</View>
      <View style={local.center}>
        <ProfileAvatar user={user} getSource={getProfilePhotoSource} size={72} />
        <Text accessibilityRole="header" style={local.title}>{title}</Text>
        <View style={local.dots} accessible accessibilityLabel={`${PIN_LENGTH}자리 중 ${digits.length}자리 입력`}>
          {Array.from({ length: PIN_LENGTH }, (_, index) => <View key={index} style={[local.dot, index < digits.length && local.dotOn]} />)}
        </View>
        <Text accessibilityLiveRegion="polite" style={local.error}>{error}</Text>
        <View style={local.pad}>
          {KEYS.map(key => {
            if (key === 'forgot') {
              return onForgot
                ? <Pressable key={key} accessibilityRole="button" accessibilityLabel="비밀번호를 잊었어요" onPress={onForgot} style={local.key}><Text style={local.keySmall}>잊었어요</Text></Pressable>
                : <View key={key} style={local.key} />;
            }
            if (key === 'erase') {
              return <Pressable key={key} accessibilityRole="button" accessibilityLabel="한 자리 지우기" onPress={() => press(key)} style={local.key}><Text style={local.keySmall}>지우기</Text></Pressable>;
            }
            return (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={key} onPress={() => press(key)} style={[local.key, local.keyNumber]}>
                <Text style={local.keyText}>{key}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const local = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: colors.surface },
  top: { minHeight: 64, paddingHorizontal: 12, paddingTop: 12, flexDirection: 'row' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 64, gap: 16 },
  title: { marginTop: 4, fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  dots: { flexDirection: 'row', gap: 16, paddingVertical: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  dotOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  error: { minHeight: 20, fontSize: 15, lineHeight: 20, fontWeight: '700', color: colors.dangerStrong },
  pad: { width: 3 * 72 + 2 * 20, flexDirection: 'row', flexWrap: 'wrap', gap: 16, columnGap: 20, justifyContent: 'center' },
  key: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  keyNumber: { backgroundColor: colors.surfaceMuted },
  keyText: { fontSize: 26, fontWeight: '700', color: colors.text },
  keySmall: { fontSize: 14, fontWeight: '800', color: colors.primaryText },
});
