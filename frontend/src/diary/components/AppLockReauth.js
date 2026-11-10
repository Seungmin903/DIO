import { useEffect, useRef, useState } from 'react';
import { BackHandler, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, DISABLED_OPACITY } from '../../shared/theme';
import AppIcon from '../../shared/AppIcon';
import DioButton from '../../shared/DioButton';
import ProviderIcon from '../../auth/ProviderIcon';
import { profileStyles } from '../../auth/profileStyles';
import ProfileAvatar from './ProfileAvatar';

const SOCIAL = { google: { name: '구글', color: '#FFFFFF' }, apple: { name: '애플', color: '#191919' } };

/**
 * 앱 잠금 4자리를 잊었을 때 계정으로 다시 확인하는 전체 화면(지라 799). PIN 화면 '잊었어요'에서 연다.
 * 이메일 가입은 계정 비밀번호, 구글 · 애플 가입은 그 로그인을 한 번 더 받는다. 통과하면 onVerified(새 4자리를 정하거나 잠금을 끈다).
 * 계정 비밀번호까지 잊었으면 맨 아래 '로그아웃'(다시 로그인 · 비밀번호 찾기로 이어진다). 화면 짜임은 PIN 화면과 같다(돌아가기 · 프로필 · 제목 · 오류 한 줄).
 * verify({ password }) → Promise: 계정 확인(authService.verifyAccount). 실패하면 그 오류 문구를 제목 아래에 보인다.
 */
export default function AppLockReauth({ user, getProfilePhotoSource, verify, onVerified, onCancel, onLogout }) {
  const provider = user?.provider && user.provider !== 'email' ? user.provider : 'email';
  const social = SOCIAL[provider];
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const { width, height } = useWindowDimensions();
  const small = height < 720;
  useEffect(() => () => { alive.current = false; }, []);
  // 안드로이드 뒤로 가기: PIN 화면으로 돌아간다
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { if (!busy) onCancel?.(); return true; });
    return () => subscription.remove();
  }, [busy, onCancel]);

  const submit = async () => {
    if (busy || (!social && !password)) return;
    Keyboard.dismiss();
    setBusy(true); setError('');
    try {
      await verify(social ? {} : { password });
      if (alive.current) onVerified();
    } catch (failure) {
      if (!alive.current) return;
      setError(failure?.message || '계정을 확인하지 못했어요. 다시 시도해 주세요.');
      setPassword('');
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  const title = social ? `${social.name} 계정으로 확인해 주세요` : '계정 비밀번호를 입력해 주세요';
  return (
    <SafeAreaView edges={['top', 'bottom']} style={[local.root, { width, height }]} accessibilityViewIsModal>
      <View style={local.top}><DioButton variant="ghost" icon="chevron-left" label="돌아가기" disabled={busy} onPress={onCancel} /></View>
      <ScrollView style={local.scroll} contentContainerStyle={[local.center, small && local.centerSmall]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <ProfileAvatar user={user} getSource={getProfilePhotoSource} size={small ? 56 : 72} />
        <Text accessibilityRole="header" style={[local.title, { marginTop: small ? 18 : 24 }]}>{title}</Text>
        {social ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`${social.name} 계정으로 확인`} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={submit}
            style={[local.social, busy && local.dim]}>
            <View style={[local.socialCircle, { backgroundColor: social.color }]}><ProviderIcon provider={provider} /></View>
            <Text style={local.socialLabel}>{social.name}</Text>
          </Pressable>
        ) : (
          <View style={local.form}>
            <View style={[profileStyles.field, focused && profileStyles.focused]}>
              <TextInput accessibilityLabel="계정 비밀번호" value={password} onChangeText={setPassword} editable={!busy} maxLength={32}
                placeholder="계정 비밀번호" placeholderTextColor={colors.textMuted} autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
                secureTextEntry={!visible} returnKeyType="done" onSubmitEditing={submit} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} style={profileStyles.input} />
              <Pressable accessibilityRole="button" accessibilityLabel={`계정 비밀번호 ${visible ? '숨기기' : '보기'}`} disabled={busy} onPress={() => setVisible(value => !value)} style={profileStyles.eye}>
                <AppIcon name={visible ? 'eye-off' : 'eye'} size={20} />
              </Pressable>
            </View>
            <DioButton variant="filled" block label="확인" loading={busy} disabled={busy || !password} onPress={submit} style={local.confirm} />
          </View>
        )}
        <Text accessibilityLiveRegion="polite" style={local.error}>{error}</Text>
        {onLogout && <DioButton variant="ghost" label="로그아웃" disabled={busy} onPress={onLogout} style={local.logout} />}
      </ScrollView>
    </SafeAreaView>
  );
}

const local = StyleSheet.create({
  // PIN 화면과 같은 덮개: 흰 면 전체, 앱 위(잠금 화면 위)에 그린다
  root: { ...StyleSheet.absoluteFill, zIndex: 110, backgroundColor: colors.surface },
  top: { minHeight: 64, paddingHorizontal: 12, paddingTop: 12, flexDirection: 'row' },
  scroll: { flex: 1 },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 72 },
  centerSmall: { paddingBottom: 24 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800', color: colors.text, letterSpacing: -0.5, textAlign: 'center' },
  form: { width: '100%', maxWidth: 360, marginTop: 24, gap: 12 },
  confirm: { minHeight: 48 },
  // 로그인 화면의 간편 로그인 칸과 같은 원(56) + 이름
  social: { marginTop: 24, minWidth: 64, alignItems: 'center', gap: 8 },
  socialCircle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  socialLabel: { fontSize: 12, fontWeight: '700', color: colors.text },
  dim: { opacity: DISABLED_OPACITY },
  error: { minHeight: 20, marginTop: 12, fontSize: 14, lineHeight: 20, fontWeight: '700', color: colors.dangerStrong, textAlign: 'center' },
  logout: { marginTop: 16 },
});
