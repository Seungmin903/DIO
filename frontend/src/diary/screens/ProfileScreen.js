import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import AppInformation from '../components/AppInformation';
import DeskLightSetting from '../components/DeskLightSetting';
import NotificationSetting from '../components/NotificationSetting';
import AppLockSetting from '../components/AppLockSetting';
import PinScreen from '../components/PinScreen';
import { appLockScope, checkAppLock, clearAppLock, hasAppLock, setAppLock } from '../../shared/appLock';
import { colors } from '../../shared/theme';
import DioButton from '../../shared/DioButton';
import ProfileEditScreen from '../../auth/ProfileEditScreen';

const DEFAULT_AVATAR = require('../../../assets/characters/avatar-default.png');

// 내 공간(한 단): 정체성 띠(아바타 + 이름 + 버튼) → 알림 → 보안 → 환경 설정(태블릿만) → 로그아웃(회원) → 앱 정보(맨 아래).
// 카드로 감싸지 않고 여백 · 구분선으로 나눈다. 장식 · 통계 · 안내 문구는 두지 않는다.
export default function ProfileScreen({ diaries, compact = false, previewUser, onEndPreview, onUpdatePreview, registerLeaveGuard, getProfilePhotoSource, accountService }) {
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
  if (pin) {
    const done = async value => {
      if (pin.mode === 'verify' && pin.next === 'change') { setPin({ mode: 'setup' }); return; }
      if (pin.mode === 'verify') await clearAppLock(lockScope).catch(() => {});
      else await setAppLock(lockScope, value).catch(() => {});
      setLocked(await hasAppLock(lockScope).catch(() => false));
      setPin(null);
    };
    return <PinScreen key={`${pin.mode}:${pin.next || ''}`} mode={pin.mode} user={previewUser} getProfilePhotoSource={getProfilePhotoSource}
      check={value => checkAppLock(lockScope, value)} onDone={done} onCancel={() => setPin(null)} />;
  }
  if (editing) return <ProfileEditScreen {...(previewUser?.mode === 'authenticated' && accountService ? { service: accountService } : {})} compact={compact} user={previewUser} onClose={() => setEditing(false)} onUpdate={onUpdatePreview} onEndSession={onEndPreview} registerLeaveGuard={registerLeaveGuard} />;

  const profileAction = guest && onEndPreview ? (
    <DioButton variant="filled" label="로그인·회원가입" onPress={onEndPreview} block={compact} />
  ) : !guest && (previewUser?.accountId || (previewUser?.mode === 'authenticated' && accountService)) ? (
    <DioButton variant="tonal" label="회원정보 수정" text="프로필 수정" icon="edit" onPress={() => setEditing(true)} block={compact} />
  ) : null;

  const logout = !guest && onEndPreview ? <DioButton variant="danger" label="로그아웃" onPress={onEndPreview} block /> : null;

  return (
    <ScrollView style={local.root} contentContainerStyle={[s.screen, compact && s.screenCompact, local.content]} showsVerticalScrollIndicator={false}>
      <Header title="내 공간" icon="person" compact={compact} />
      {/* 설정 본문은 다른 화면처럼 좌우 여백까지 꽉 채운다(760 제한은 실기기에서 오른쪽만 비어 좌우가 맞지 않았다). 조작은 모두 오른쪽 끝선 */}
      <View style={local.column}>
      <View style={[local.identity, compact && local.identityCompact]}>
        <View style={local.identityRow}>
          <View style={local.avatarWrap}>
            <View style={local.avatar}>
              {photoUri && failedPhoto !== photoIdentity
                ? <Image source={{ ...photoSource, cacheKey: photoCacheKey }}
                    contentFit="cover" cachePolicy="memory"
                    onError={() => {
                      setFailedPhoto(photoIdentity);
                    }} accessibilityLabel="프로필 사진" style={local.photo} />
                // 사진이 없을 때의 기본 프로필: 단색 동그라미에 디오의 흰 표정(메뉴 아래 프로필과 같은 그림)
                : <Image source={DEFAULT_AVATAR} contentFit="cover" accessibilityLabel="기본 프로필 사진" style={local.photo} />}
            </View>
          </View>
          <View style={local.identityText}>
            <Text numberOfLines={1} style={[local.name, compact && local.nameCompact]}>{previewUser?.nickname || '나'}</Text>
            <Text numberOfLines={1} style={local.space}>{previewUser?.nickname ? `${previewUser.nickname}님의 기록 공간` : '나의 기록 공간'}</Text>
          </View>
          {!compact && profileAction}
        </View>
        {compact && profileAction}
      </View>
      {/* 한 단: 알림 → 보안 → 환경 설정(태블릿만, 책상은 태블릿 홈에만 있다) → 로그아웃(회원) → 앱 정보(맨 아래) */}
      <View style={local.block}><NotificationSetting /></View>
      <View style={local.block}>
        <AppLockSetting locked={locked} onTurnOn={() => setPin({ mode: 'setup' })} onTurnOff={() => setPin({ mode: 'verify', next: 'off' })} onChange={() => setPin({ mode: 'verify', next: 'change' })} />
      </View>
      {!compact && <View style={local.block}><DeskLightSetting /></View>}
      {logout && <View style={local.block}>{logout}</View>}
      <View style={local.block}><AppInformation /></View>
      </View>
    </ScrollView>
  );
}

const local = StyleSheet.create({
  // 카드 대신 화면 전체를 흰 면 한 장으로 둔다(공방과 같다)
  root: { flex: 1, backgroundColor: colors.surface },
  content: { paddingBottom: 36 },
  // 정체성 띠: 면 · 테두리 없이 아래 선 하나(cardBorder). 아바타 72 · 모서리 22
  identity: { minHeight: 116, justifyContent: 'center', gap: 14, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  identityCompact: { minHeight: 104 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 36, backgroundColor: colors.primaryStrong }, // 동그라미(메뉴 아래 프로필 그림과 같은 모양)
  photo: { width: 72, height: 72, borderRadius: 36 },
  name: { color: colors.text, fontSize: 22, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  nameCompact: { fontSize: 20, lineHeight: 26 },
  space: { color: colors.primaryText, fontSize: 15, fontWeight: '700' },
  block: { marginTop: 28 },
  column: { width: '100%' },
});
