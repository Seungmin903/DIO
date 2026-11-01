import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
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
  // 화면이 낮으면 잘리지 않게 줄인다: 낮은 가로 화면은 왼쪽 안내 + 오른쪽 숫자판, 낮은 세로 화면은 숫자판을 작게. 그래도 모자라면 스크롤된다.
  const { width, height } = useWindowDimensions();
  const side = width > height && height < 760;
  const small = !side && height < 720;
  const keySize = side || small ? 60 : 72;
  const gap = side || small ? 8 : 10; // 숫자만 놓으므로 행 간격을 좁힌다(터치 영역은 키 크기 그대로)
  const padWidth = 3 * keySize + 2 * 20;
  const keyBox = { width: keySize, height: keySize, borderRadius: keySize / 2 };
  // 세로 리듬(코덱스 4차): 아바타→제목 · 제목→점 · 점→오류 · 오류→숫자판
  const rhythm = side || small ? { title: 18, dots: 12, error: 12, pad: 28 } : { title: 24, dots: 16, error: 12, pad: 32 };

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

  const header = (
    <View style={[local.head, side && local.headSide]}>
      <ProfileAvatar user={user} getSource={getProfilePhotoSource} size={small || side ? 56 : 72} />
      <Text accessibilityRole="header" style={[local.title, { marginTop: rhythm.title }]}>{title}</Text>
      <View style={[local.dots, { marginTop: rhythm.dots }]} accessible accessibilityLabel={`${PIN_LENGTH}자리 중 ${digits.length}자리 입력`}>
        {Array.from({ length: PIN_LENGTH }, (_, index) => <View key={index} style={[local.dot, index < digits.length && local.dotOn]} />)}
      </View>
      <Text accessibilityLiveRegion="polite" style={[local.error, { marginTop: rhythm.error }]}>{error}</Text>
    </View>
  );
  const pad = (
    <View style={[local.pad, { width: padWidth, gap, columnGap: 20, marginTop: side ? 0 : rhythm.pad }]}>
      {KEYS.map(key => {
        if (key === 'forgot') {
          return onForgot
            ? <Pressable key={key} accessibilityRole="button" accessibilityLabel="비밀번호를 잊었어요" onPress={onForgot} style={[local.key, keyBox]}><Text style={local.keySmall}>잊었어요</Text></Pressable>
            : <View key={key} style={[local.key, keyBox]} />;
        }
        if (key === 'erase') {
          return <Pressable key={key} accessibilityRole="button" accessibilityLabel="한 자리 지우기" onPress={() => press(key)} style={[local.key, keyBox]}><Text style={local.keySmall}>지우기</Text></Pressable>;
        }
        return (
          <Pressable key={key} accessibilityRole="button" accessibilityLabel={key} onPress={() => press(key)} style={[local.key, local.keyNumber, keyBox]}>
            <Text style={[local.keyText, keySize < 72 && local.keyTextSmall]}>{key}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    // 모달(안드로이드) 안에서는 absoluteFill 이 창 높이를 못 받아 내용이 위로 쏠리므로 창 크기를 직접 준다
    <View style={[local.root, { width, height }]} accessibilityViewIsModal>
      <View style={local.top}>{mode !== 'unlock' && onCancel ? <DioButton variant="ghost" icon="chevron-left" label="돌아가기" onPress={onCancel} /> : null}</View>
      <ScrollView style={local.scroll} contentContainerStyle={[local.center, small && local.centerSmall, side && local.centerSide]} showsVerticalScrollIndicator={false}>
        {header}
        {pad}
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, zIndex: 100, backgroundColor: colors.surface },
  top: { minHeight: 64, paddingHorizontal: 12, paddingTop: 12, flexDirection: 'row' },
  scroll: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 72 },
  centerSmall: { paddingBottom: 24 },
  centerSide: { flexDirection: 'row', gap: 56, paddingBottom: 24, paddingHorizontal: 32 },
  head: { alignItems: 'center' },
  headSide: { width: 280 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  dots: { flexDirection: 'row', gap: 16, paddingVertical: 4 },
  dot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.primary },
  dotOn: { backgroundColor: colors.primaryStrong, borderColor: colors.primaryStrong },
  error: { minHeight: 20, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.dangerStrong, textAlign: 'center' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  key: { alignItems: 'center', justifyContent: 'center' },
  // 숫자만(면 · 테두리 없음): 카카오톡 미니멀 테마처럼 큰 숫자가 키다. 터치 영역은 keyBox 크기.
  keyNumber: {},
  keyText: { fontSize: 30, fontWeight: '600', color: colors.text },
  keyTextSmall: { fontSize: 26 },
  keySmall: { fontSize: 14, fontWeight: '800', color: colors.primaryText },
});
