import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import { colors, radius } from '../../shared/theme';
import AppIcon from '../../shared/AppIcon';
import { C } from '../constants';
import ProfileEditScreen from '../../auth/ProfileEditScreen';
import PasswordResetScreen from '../../auth/PasswordResetScreen';
import NotificationSettingsScreen from './NotificationSettingsScreen';
import { authService } from '../../auth/authService';
import { openFontStudio } from '../../handwriting/studioBus.js';

export default function ProfileScreen({ compact = false, previewUser, onEndPreview, onUpdatePreview, registerLeaveGuard, getProfilePhotoSource }) {
  const [route, setRoute] = useState('home');
  const [failedPhoto, setFailedPhoto] = useState(null);
  // 회원 설정은 서버 인증이 끝난 세션만 접근한다. 이전 체험 세션 값은 앱 진입
  // 단계에서 로그인으로 돌려보내며, 이 화면에서도 방어적으로 렌더링하지 않는다.
  const authenticated = previewUser?.mode === 'authenticated';
  const userId = authenticated ? previewUser.userId : null;
  // 내 공간에 들어올 때 서버 회원정보(GET /me)로 로그인 시점 값을 갱신한다.
  // 실패하면 로그인 응답 값을 그대로 보여 주고, 다시 들어올 때 재시도한다.
  useEffect(() => {
    if (!userId || route !== 'home' || typeof authService.getProfile !== 'function') return undefined;
    let active = true;
    authService.getProfile(previewUser)
      .then((profile) => { if (active) onUpdatePreview?.(profile); })
      .catch(() => {});
    return () => { active = false; };
    // previewUser는 갱신 결과로 바뀌므로 계정·화면 전환 때만 다시 불러온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, route]);
  if (!authenticated) return null;
  const photoUri = previewUser?.photoUri;
  const photoSource = photoUri
    ? (getProfilePhotoSource ? getProfilePhotoSource(photoUri) : { uri: photoUri })
    : null;
  // 실패 상태는 계정·사진·접근 인증에 묶는다. 인증 변경 후 같은 사진도 다시 시도한다.
  // 인증 값은 메모리 비교에만 사용하고 캐시 키·로그에는 넣지 않는다.
  const photoIdentity = JSON.stringify([
    previewUser?.userId || previewUser?.accountId || 'guest',
    photoUri,
    photoSource?.headers || null,
  ]);
  const photoCacheKey = JSON.stringify([
    'profile',
    previewUser?.userId || previewUser?.accountId || 'guest',
    photoUri,
  ]);

  if (route === 'edit' && authenticated) {
    return (
      <ProfileEditScreen
        compact={compact}
        user={previewUser}
        onClose={() => setRoute('home')}
        onUpdate={onUpdatePreview}
        onEndSession={onEndPreview}
        onPasswordReset={() => setRoute('password')}
        registerLeaveGuard={registerLeaveGuard}
        getProfilePhotoSource={getProfilePhotoSource}
        service={authService}
        photoEditable={false}
      />
    );
  }
  if (route === 'password' && authenticated) {
    return (
      <PasswordResetScreen
        compact={compact}
        email={previewUser?.email || ''}
        service={authService}
        onClose={() => setRoute('home')}
        onComplete={onEndPreview}
      />
    );
  }
  if (route === 'notifications') {
    return <NotificationSettingsScreen compact={compact} onClose={() => setRoute('home')} />;
  }
  return (
    <ScrollView contentContainerStyle={[s.screen, compact && s.screenCompact]} showsVerticalScrollIndicator={false}>
      <Header title="마이페이지" compact={compact} />
      <View style={local.content}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="회원정보 수정"
          onPress={() => setRoute('edit')}
          style={({ pressed }) => [local.profileCard, pressed && local.pressed]}
        >
          <View style={local.avatar}>
            {photoUri && failedPhoto !== photoIdentity ? (
              <Image
                source={{ ...photoSource, cacheKey: photoCacheKey }}
                contentFit="cover"
                cachePolicy="memory"
                accessibilityLabel="프로필 사진"
                onError={() => setFailedPhoto(photoIdentity)}
                style={local.photo}
              />
            ) : (
              <AppIcon name="person" size={27} color={C.blueStrong} />
            )}
          </View>
          <View style={local.profileCopy}>
            <Text accessibilityRole="header" style={local.nickname}>{previewUser?.nickname || '사용자'}</Text>
            {!!previewUser?.email && <Text selectable style={local.email}>{previewUser.email}</Text>}
          </View>
          <AppIcon name="chevron-right" size={20} color={C.muted} />
        </Pressable>
        <Text style={local.groupTitle}>계정</Text>
        <ListSection>
          {previewUser?.provider === 'email' && (
            <ListItem label="비밀번호 변경" icon="lock" onPress={() => setRoute('password')} />
          )}
          <ListItem label="알림 설정" icon="bell" onPress={() => setRoute('notifications')} />
        </ListSection>
        <Text style={local.groupTitle}>서비스</Text>
        <ListSection>
          <ListItem label="나만의 폰트 만들기" icon="edit" onPress={() => openFontStudio()} />
        </ListSection>
        <Text style={local.groupTitle}>앱 정보</Text>
        <AppInformation standalone />
        {onEndPreview && (
          <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={onEndPreview} style={({ pressed }) => [local.logout, pressed && local.pressed]}>
            <Text style={local.logoutText}>로그아웃</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function ListSection({ children }) {
  return <View style={local.list}>{children}</View>;
}

function ListItem({ label, icon, onPress }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [local.item, pressed && local.pressed]}>
      <View style={local.itemIcon}><AppIcon name={icon} size={20} color={colors.primaryStrong} /></View>
      <Text style={local.itemLabel}>{label}</Text>
      <AppIcon name="chevron-right" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

const local = StyleSheet.create({
  content: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  profileCard: { minHeight: 104, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 20, backgroundColor: C.white, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  avatar: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: C.active },
  photo: { width: 62, height: 62 },
  profileCopy: { flex: 1, gap: 6 },
  nickname: { color: C.ink, fontSize: 19, fontWeight: '800', letterSpacing: -0.35 },
  email: { color: C.muted, fontSize: 13 },
  groupTitle: { color: C.muted, fontSize: 12, fontWeight: '800', marginTop: 26, marginBottom: 9, paddingHorizontal: 4 },
  list: { overflow: 'hidden', backgroundColor: C.white, borderWidth: 1, borderColor: C.line, borderRadius: 18 },
  item: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: C.line },
  itemIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.pale },
  itemLabel: { flex: 1, color: C.ink, fontSize: 15, fontWeight: '700' },
  logout: { minHeight: 52, marginTop: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.danger, borderRadius: 14, backgroundColor: 'rgba(229,72,77,0.04)' },
  logoutText: { color: C.danger, fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
});
