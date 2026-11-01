import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import DeskLightSetting from '../components/DeskLightSetting';
import { SettingCard, SettingSection } from '../components/SettingRow';
import NotificationSetting from '../components/NotificationSetting';
import AppLockSetting from '../components/AppLockSetting';
import PinScreen from '../components/PinScreen';
import EditorModal from '../../editor/components/controls/EditorModal';
import { appLockScope, checkAppLock, clearAppLock, hasAppLock, setAppLock } from '../../shared/appLock';
import { colors } from '../../shared/theme';
import DioButton from '../../shared/DioButton';
import ProfileEditScreen from '../../auth/ProfileEditScreen';

import DefaultAvatar from '../../shared/DefaultAvatar';

// 내 공간(한 단): 정체성 띠(아바타 + 이름 + 버튼) → 알림 → 보안 → 환경 설정(태블릿만) → 계정(로그아웃, 회원) → 앱 정보(맨 아래).
// 정체성 트레이 1장 + 설정 카드 2장(알림 · 보안 · 환경 / 계정 · 앱 정보)으로 덩어리를 나눈다. 행마다 카드로 만들지 않는다(코덱스 3차). 장식 · 통계 · 안내 문구는 두지 않는다.
export default function ProfileScreen({ diaries, compact = false, previewUser, onEndPreview, onUpdatePreview, registerLeaveGuard, getProfilePhotoSource, accountService, guestService }) {
  const [editing, setEditing] = useState(false);
  const [failedPhoto, setFailedPhoto] = useState(null);
  const photoUri = previewUser?.photoUri;
  const photoSource = photoUri
    ? (getProfilePhotoSource ? getProfilePhotoSource(photoUri) : { uri: photoUri }) : null;
  // 실패 상태는 계정·사진·접근 인증에 묶는다. 인증 변경 후 같은 사진도 다시 시도한다.
  // 인증 값은 메모리 비교에만 사용하고 캐시 키·로그에는 넣지 않는다.
  const photoIdentity = JSON.stringify([previewUser?.userId || previewUser?.accountId || 'guest', photoUri, photoSource?.headers || null]);
  const photoCacheKey = JSON.stringify(['profile', previewUser?.userId || previewUser?.accountId || 'guest', photoUri]);
  const guest = previewUser?.provider === 'guest';
  // 앱 잠금: locked 는 이 계정에 잠금이 있는지(null = 읽는 중). pin 은 열려 있는 비밀번호 화면
  // ({ mode: 'setup' } 새로 켜기 · 바꾸기 2단계 | { mode: 'verify', next: 'off' | 'change' })
  const lockScope = appLockScope(previewUser);
  const [locked, setLocked] = useState(null);
  const [pin, setPin] = useState(null);
  useEffect(() => {
    let alive = true;
    hasAppLock(lockScope).then(value => { if (alive) setLocked(value); }).catch(() => { if (alive) setLocked(false); });
    return () => { alive = false; };
  }, [lockScope]);
  // 비밀번호 화면은 앱 전체(왼쪽 메뉴 · 아래 탭까지)를 덮는 전체 화면이다. 내 공간 본문 안에 두면 잘리고 메뉴가 남는다.
  let pinScreen = null;
  if (pin) {
    const done = async value => {
      if (pin.mode === 'verify' && pin.next === 'change') { setPin({ mode: 'setup' }); return; }
      if (pin.mode === 'verify') await clearAppLock(lockScope).catch(() => {});
      else await setAppLock(lockScope, value).catch(() => {});
      setLocked(await hasAppLock(lockScope).catch(() => false));
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
  if (editing) return <ProfileEditScreen {...(editService ? { service: editService } : {})} compact={compact} user={previewUser} onClose={() => setEditing(false)} onUpdate={onUpdatePreview} onEndSession={onEndPreview} registerLeaveGuard={registerLeaveGuard} />;

  // 게스트(개발용)도 로그인한 사용자처럼 프로필을 고친다. 고친 값은 기기에 남는다. 로그인 · 회원가입 버튼은 두지 않는다.
  // 프로필 수정은 조용한 92×32 테두리 버튼(secondary 테두리 · primaryText 글자), 폰도 이름 줄 오른쪽에 둔다(원 페이저 12)
  const guestEdit = guest && guestService ? <DioButton variant="ghost" outline label="프로필 수정" icon="edit" onPress={() => setEditing(true)} style={local.editButton} /> : null;
  const profileAction = guest ? (
    guestEdit
  ) : !guest && (previewUser?.accountId || (previewUser?.mode === 'authenticated' && accountService)) ? (
    <DioButton variant="ghost" outline label="회원정보 수정" text="프로필 수정" icon="edit" onPress={() => setEditing(true)} style={local.editButton} />
  ) : null;

  const logout = !guest && onEndPreview ? <DioButton variant="ghost" outline label="로그아웃" onPress={onEndPreview} block /> : null;

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
                // 사진이 없을 때의 기본 프로필: 단색 동그라미에 모아의 흰 표정(메뉴 아래 프로필과 같은 그림)
                : <DefaultAvatar accessibilityLabel="기본 프로필 사진" style={[local.photo, compact && local.avatarCompact]} />}
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
          {!compact && <DeskLightSetting compact={compact} />}
        </SettingCard>
        <SettingCard compact={compact}>
          {logout && <SettingSection title="계정"><View style={local.accountBody}>{logout}</View></SettingSection>}
          <AppInformation compact={compact} />
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
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionsCompact: { flexDirection: 'column', alignItems: 'stretch' },
  accountBody: { paddingVertical: 12 },
  cards: { marginTop: 8 },
  column: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
});
