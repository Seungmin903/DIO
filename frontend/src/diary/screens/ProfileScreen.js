import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import { SettingCard, SettingSection } from '../components/SettingRow';
import NotificationSetting from '../components/NotificationSetting';
import AppLockSetting from '../components/AppLockSetting';
import PinScreen from '../components/PinScreen';
import EditorModal from '../../editor/components/controls/EditorModal';
import { appLockScope, checkAppLock, clearAppLock, hasAppLock, setAppLock } from '../../shared/appLock';
import { colors } from '../../shared/theme';
import { notify } from '../../shared/dialogs';
import DioButton from '../../shared/DioButton';
import ProfileEditScreen from '../../auth/ProfileEditScreen';
import PasswordResetScreen from '../../auth/PasswordResetScreen';
import NotificationSettingsScreen from './NotificationSettingsScreen';
import AppIcon from '../../shared/AppIcon';
import DefaultAvatar from '../../shared/DefaultAvatar';

// 내 공간(한 단): 정체성 띠(아바타 + 이름 + 버튼) → 알림 → 보안 → 환경 설정(태블릿만) → 계정(로그아웃, 회원) → 앱 정보(맨 아래).
// 정체성 트레이 1장 + 설정 카드 2장(알림 · 보안 · 환경 / 계정 · 앱 정보)으로 덩어리를 나눈다. 행마다 카드로 만들지 않는다(코덱스 3차). 장식 · 통계 · 안내 문구는 두지 않는다.
export default function ProfileScreen({ compact = false, previewUser, onEndPreview, onClearSession = onEndPreview, onUpdatePreview, registerLeaveGuard, getProfilePhotoSource, accountService, guestService }) {
  // home · edit(회원정보 수정) · password(비밀번호 재설정 4단계) · notifications(서버 알림 설정, 회원)
  const [route, setRoute] = useState('home');
  const editing = route === 'edit';
  const setEditing = on => setRoute(on ? 'edit' : 'home');
  const [failedPhoto, setFailedPhoto] = useState(null);
  const photoUri = previewUser?.photoUri;
  const photoSource = photoUri
    ? (getProfilePhotoSource ? getProfilePhotoSource(photoUri) : { uri: photoUri }) : null;
  // 실패 상태는 계정·사진·접근 인증에 묶는다. 인증 변경 후 같은 사진도 다시 시도한다.
  // 인증 값은 메모리 비교에만 사용하고 캐시 키·로그에는 넣지 않는다.
  const photoIdentity = JSON.stringify([previewUser?.userId || previewUser?.accountId || 'guest', photoUri, photoSource?.headers || null]);
  const photoCacheKey = JSON.stringify(['profile', previewUser?.userId || previewUser?.accountId || 'guest', photoUri]);
  // 게스트(로그인 전 방문자)도 내 공간을 쓴다. 프로필은 기기에 남는다(guestService).
  const authenticatedUser = previewUser?.mode === 'authenticated';
  const guest = !authenticatedUser && previewUser?.provider === 'guest';
  // 앱 잠금: locked 는 이 계정에 잠금이 있는지(null = 읽는 중). pin 은 열려 있는 비밀번호 화면
  // ({ mode: 'setup' } 새로 켜기 · 바꾸기 2단계 | { mode: 'verify', next: 'off' | 'change' })
  const lockScope = appLockScope(previewUser);
  const [locked, setLocked] = useState(null);
  const [pin, setPin] = useState(null);
  useEffect(() => {
    let alive = true;
    // 읽기 실패는 '꺼짐'으로 두지 않는다(켜기로 기존 비밀번호를 확인 없이 덮어쓸 수 있다). null 이면 스위치가 눌리지 않고, 다시 들어오면 다시 읽는다
    hasAppLock(lockScope).then(value => { if (alive) setLocked(value); }).catch(() => { if (alive) setLocked(null); });
    return () => { alive = false; };
  }, [lockScope]);
  // 내 공간에 들어올 때 서버 회원정보(GET /me)로 로그인 시점 값을 갱신한다. 실패하면 로그인 응답 값을 그대로 보여 주고 다시 들어올 때 재시도한다.
  const userId = authenticatedUser ? previewUser.userId : null;
  useEffect(() => {
    if (!userId || route !== 'home' || typeof accountService?.getProfile !== 'function') return undefined;
    let active = true;
    accountService.getProfile(previewUser)
      .then(profile => { if (active) onUpdatePreview?.(profile); })
      .catch(() => {});
    return () => { active = false; };
    // previewUser 는 갱신 결과로 바뀌므로 계정 · 화면 전환 때만 다시 불러온다.
  }, [userId, route]); // eslint-disable-line react-hooks/exhaustive-deps
  // 회원 설정은 서버 인증이 끝난 세션이나 게스트만 연다(이전 체험 세션 값은 그리지 않는다)
  if (!authenticatedUser && !guest) return null;
  // 비밀번호 화면은 앱 전체(왼쪽 메뉴 · 아래 탭까지)를 덮는 전체 화면이다. 내 공간 본문 안에 두면 잘리고 메뉴가 남는다.
  let pinScreen = null;
  if (pin) {
    const done = async value => {
      if (pin.mode === 'verify' && pin.next === 'change') { setPin({ mode: 'setup' }); return; }
      // 저장이 실패하면 잠금 상태를 다시 읽어 실제 값으로 되돌리고 실패를 알린다(켜졌다고 오해하지 않게)
      try {
        if (pin.mode === 'verify') await clearAppLock(lockScope);
        else await setAppLock(lockScope, value);
      } catch { notify('앱 잠금', '앱 잠금을 바꾸지 못했어요. 다시 시도해 주세요.'); }
      setLocked(await hasAppLock(lockScope).catch(() => null));
      setPin(null);
    };
    pinScreen = (
      <EditorModal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setPin(null)}>
        <PinScreen key={`${pin.mode}:${pin.next || ''}`} mode={pin.mode} user={previewUser} getProfilePhotoSource={getProfilePhotoSource}
          check={value => checkAppLock(lockScope, value)} onDone={done} onCancel={() => setPin(null)} />
      </EditorModal>
    );
  }
  const editService = previewUser?.mode === 'authenticated' && accountService ? accountService : guest && guestService ? guestService : null;
  // 비밀번호 변경 · 탈퇴는 서버가 모든 세션을 폐기하므로 로그아웃 요청을 또 보내지 않고 이 기기의 세션만 정리한다(onClearSession)
  if (editing) return <ProfileEditScreen {...(editService ? { service: editService } : {})} compact={compact} user={previewUser} onClose={() => setEditing(false)} onUpdate={onUpdatePreview} onEndSession={onClearSession} onPasswordReset={authenticatedUser && accountService ? () => setRoute('password') : undefined} getProfilePhotoSource={getProfilePhotoSource} registerLeaveGuard={registerLeaveGuard} />
  if (route === 'password' && authenticatedUser && accountService) return <PasswordResetScreen compact={compact} email={previewUser?.email || ''} service={accountService} onClose={() => setRoute('home')} onComplete={onClearSession} />;
  if (route === 'notifications' && authenticatedUser) return <NotificationSettingsScreen compact={compact} userId={userId} onClose={() => setRoute('home')} />;

  // 게스트도 로그인한 사용자처럼 프로필을 고친다. 고친 값은 기기에 남는다. 로그인 · 회원가입 버튼은 두지 않는다.
  // 프로필 수정은 조용한 92×32 테두리 버튼(secondary 테두리 · primaryText 글자), 폰도 이름 줄 오른쪽에 둔다(원 페이저 12)
  // 게스트 프로필은 기기 저장(guestService)이 있어야 고칠 수 있다. 없으면 버튼을 누를 수 없게 둔다.
  const profileAction = guest ? (
    <DioButton variant="ghost" outline label="프로필 수정" icon="edit" disabled={!guestService} onPress={() => { if (guestService) setEditing(true); }} style={local.editButton} />
  ) : previewUser?.accountId || (authenticatedUser && accountService) ? (
    <DioButton variant="ghost" outline label="회원정보 수정" text="프로필 수정" icon="edit" onPress={() => setEditing(true)} style={local.editButton} />
  ) : null;

  // 로그아웃은 로그인한 사용자만 있다.
  const logout = onEndPreview && !guest ? <DioButton variant="ghost" outline label="로그아웃" onPress={onEndPreview} block /> : null;
  // 회원만: 서버 알림 설정(초대 · 댓글 등 받을 알림)으로 가는 줄. 앱 정보 행과 같은 높이 · 구분선 · 오른쪽 화살표
  const serverNotifications = authenticatedUser ? (
    <Pressable accessibilityRole="button" accessibilityLabel="알림 설정" onPress={() => setRoute('notifications')} style={local.linkRow}>
      <Text style={local.linkLabel}>알림 설정</Text>
      <AppIcon name="chevron-right" size={18} color={colors.textMuted} />
    </Pressable>
  ) : null;

  return (
    <>
    <ScrollView style={local.root} contentContainerStyle={[s.screen, compact && s.screenCompact, local.content]} showsVerticalScrollIndicator={false}>
      {/* 설정 본문은 다른 화면처럼 좌우 여백까지 꽉 채운다(760 제한은 실기기에서 오른쪽만 비어 좌우가 맞지 않았다). 조작은 모두 오른쪽 끝선 */}
      <View style={local.column}>
      <Header title="내 공간" icon="person" compact={compact} />
      <View style={[local.identity, compact && local.identityCompact]}>
        <View style={local.identityRow}>
          <View style={[local.avatarWrap, compact && local.avatarCompact]}>
            <View style={[local.avatar, compact && local.avatarCompact]}>
              {photoUri && failedPhoto !== photoIdentity
                ? <Image source={{ ...photoSource, cacheKey: photoCacheKey }}
                    contentFit="cover" cachePolicy="memory"
                    onError={() => {
                      setFailedPhoto(photoIdentity);
                    }} accessibilityLabel="프로필 사진" style={[local.photo, compact && local.avatarCompact]} />
                // 사진이 없을 때의 기본 프로필: 계정 색 동그라미에 모아의 표정(메뉴 아래 프로필과 같은 그림)
                : <DefaultAvatar user={previewUser} accessibilityLabel="기본 프로필 사진" style={[local.photo, compact && local.avatarCompact]} />}
            </View>
          </View>
          <View style={local.identityText}>
            <Text numberOfLines={1} style={[local.name, compact && local.nameCompact]}>{previewUser?.nickname || '나'}</Text>
            <Text numberOfLines={1} style={local.space}>{previewUser?.bio || (previewUser?.nickname ? `${previewUser.nickname}님의 기록 공간` : '나의 기록 공간')}</Text>
          </View>
          {profileAction}
        </View>
      </View>
      {/* 한 단: 알림 → 보안 → 환경 설정(태블릿만, 책상은 태블릿 홈에만 있다) → 로그아웃(회원) → 앱 정보(맨 아래) */}
      <View style={local.cards}>
        <SettingCard compact={compact}>
          <NotificationSetting compact={compact} />
          <AppLockSetting compact={compact} locked={locked} onTurnOn={() => setPin({ mode: 'setup' })} onTurnOff={() => setPin({ mode: 'verify', next: 'off' })} onChange={() => setPin({ mode: 'verify', next: 'change' })} />
        </SettingCard>
        <SettingCard compact={compact}>
          {(logout || serverNotifications) && <SettingSection title="계정">
            {serverNotifications}
            {logout && <View style={local.accountBody}>{logout}</View>}
          </SettingSection>}
          <AppInformation />
        </SettingCard>
      </View>
      </View>
    </ScrollView>
    {pinScreen}
    </>
  );
}

const local = StyleSheet.create({
  // 카드 대신 화면 전체를 흰 면 한 장으로 둔다(공방과 같다)
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 36 },
  // 정체성 판(원 페이저 12): 옅은 면(surfaceMuted) + 모서리 16 한 장, 테두리 없음. 화면에서 면이 있는 판은 이것 하나다
  identity: { minHeight: 112, justifyContent: 'center', gap: 16, padding: 20, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  identityCompact: { padding: 16 },
  editButton: { minHeight: 32, minWidth: 92, paddingHorizontal: 12, borderColor: colors.secondary, backgroundColor: colors.surface },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 36, backgroundColor: colors.primaryStrong }, // 동그라미(메뉴 아래 프로필 그림과 같은 모양)
  photo: { width: 72, height: 72, borderRadius: 36 },
  avatarCompact: { width: 48, height: 48, borderRadius: 24 }, // 폰: 이름 · 수정 버튼과 한 줄에 서도록 48(원 페이저 12)
  name: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4 },
  nameCompact: { fontSize: 20, lineHeight: 26 },
  space: { color: colors.primaryStrong, fontSize: 14, fontWeight: '600' },
  accountBody: { paddingVertical: 12 },
  linkRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '700' },
  cards: { marginTop: 8 },
  column: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
});
