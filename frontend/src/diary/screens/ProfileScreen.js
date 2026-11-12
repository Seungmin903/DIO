import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { styles as s } from '../styles';
import Header from '../components/Header';
import BackButton from '../components/BackButton';
import AppInformation from '../components/AppInformation';
import { SettingCard, SettingSection } from '../components/SettingRow';
import NotificationSetting from '../components/NotificationSetting';
import AppLockSetting from '../components/AppLockSetting';
import EditSetting from '../components/EditSetting';
import PinScreen from '../components/PinScreen';
import AppLockReauth from '../components/AppLockReauth';
import ActionToast from '../../shared/ActionToast';
import EditorModal from '../../editor/components/controls/EditorModal';
import { appLockScope, appLockSupported, checkAppLockStatus, clearAppLock, readAppLockState, setAppLock } from '../../shared/appLock';
import { appLockRecoveryAction } from '../components/appLockRecovery';
import { colors } from '../../shared/theme';
import { confirmAction, notify } from '../../shared/dialogs';
import DioButton from '../../shared/DioButton';
import WithdrawDialog from '../../auth/WithdrawDialog';
import { pickProfilePhoto } from '../../auth/profilePhoto';
import { nicknameError, normalizeNickname } from '../../auth/validation';
import DiaryActionBubble from '../components/DiaryActionBubble';
import PasswordResetScreen from '../../auth/PasswordResetScreen';
import NotificationSettingsScreen from './NotificationSettingsScreen';
import { NOTIFICATION_SETTINGS_TITLE } from '../../shared/featureFlags';
import AppIcon from '../../shared/AppIcon';
import DefaultAvatar from '../../shared/DefaultAvatar';
import { useLoginEntry } from '../../auth/loginGate';
import { placesLoginBelow, showsInlineSettings } from '../components/profileNavigationModel';
import BlockedUsersPage from '../../safety/BlockedUsersPage';

// 마이페이지는 프로필·계정, 설정은 알림·보안·편집(그리기 입력)·앱 정보로 분리한다. 두 화면은 잠금·알림 세부 화면만 공통으로 쓴다.
const PROVIDER_NAMES = { email: '이메일', kakao: '카카오', google: '구글', apple: '애플' };

export default function ProfileScreen({ guestImport = null, section = 'profile', compact = false, onBack = null, previewUser, onEndPreview, onClearSession = onEndPreview, onWithdrawn = onClearSession, onUpdatePreview, registerLeaveGuard, getProfilePhotoSource, accountService, onOpenBlockedUsers, pushIssue = null, photoPicker = pickProfilePhoto }) {
  // home · password(비밀번호 재설정 4단계) · notifications(서버 알림 설정, 회원) · blocks(태블릿 차단 목록)
  // 따로 있던 프로필 수정 화면은 없앴다(지라 842): 사진은 프로필 오른쪽 아래 펜, 닉네임은 `수정`을 눌러 그 자리에서 고친다
  const [route, setRoute] = useState('home');
  const [withdrawing, setWithdrawing] = useState(false); // 회원 탈퇴 확인 창(계정 구역 '회원 탈퇴' 줄)
  const settingsPage = section === 'settings';
  // 폰은 마이페이지 안에 설정을 펼친다. 태블릿은 설정 화면(settingsPage)이 따로 있다.
  const settingsBody = settingsPage || showsInlineSettings({ compact, section });
  const openLogin = useLoginEntry();
  const windowSize = useWindowDimensions();
  const [failedPhoto, setFailedPhoto] = useState(null);
  const photoUri = previewUser?.photoUri;
  const photoSource = photoUri
    ? (getProfilePhotoSource ? getProfilePhotoSource(photoUri) : { uri: photoUri }) : null;
  // 실패 상태는 계정·사진·접근 인증에 묶는다. 인증 변경 후 같은 사진도 다시 시도한다.
  // 인증 값은 메모리 비교에만 사용하고 캐시 키·로그에는 넣지 않는다.
  const photoIdentity = JSON.stringify([previewUser?.userId || previewUser?.accountId || 'guest', photoUri, photoSource?.headers || null]);
  const photoCacheKey = JSON.stringify(['profile', previewUser?.userId || previewUser?.accountId || 'guest', photoUri]);
  // 게스트(로그인 전 방문자)는 설정만 연다. 마이페이지는 사이드바에서 로그인으로 대신한다.
  const authenticatedUser = previewUser?.mode === 'authenticated';
  const guest = !authenticatedUser && previewUser?.provider === 'guest';
  // 앱 잠금: locked는 확인된 상태만 표시한다. pin은 열려 있는 비밀번호 화면
  // ({ mode: 'setup' } 새로 켜기 · 바꾸기 2단계 | { mode: 'verify', next: 'off' | 'change' })
  const lockScope = appLockScope(previewUser);
  const [lockRead, setLockRead] = useState(null);
  const [lockAttempt, setLockAttempt] = useState(0);
  const currentLockRead = lockRead?.scope === lockScope ? lockRead : null;
  const lockState = currentLockRead?.state ?? null;
  const lockReadFailed = lockState === 'storage';
  const locked = lockState === null || lockReadFailed ? null : lockState !== 'off';
  const [pin, setPin] = useState(null);
  const reloadLock = () => {
    setLockRead({ scope: lockScope, state: null });
    setLockAttempt(attempt => attempt + 1);
  };
  useEffect(() => {
    let alive = true;
    readAppLockState(lockScope).catch(() => 'storage')
      .then(state => { if (alive) setLockRead({ scope: lockScope, state }); });
    return () => { alive = false; };
  }, [lockScope, lockAttempt]);
  // 앱 잠금은 회원만 쓴다(지라 799): 4자리는 이 기기 · 이 계정에 묶인 정보라 잊으면 계정으로 되찾는다. 게스트는 줄 자체를 두지 않는다
  // (예전에 켜 둔 게스트 잠금은 앱을 열 때 맞는 4자리로 열면 꺼진다 — App.js unlockWithPin)
  const canEnableLock = appLockSupported && authenticatedUser;
  const showLockSetting = authenticatedUser && (canEnableLock || locked || lockReadFailed || (currentLockRead && lockState === null));
  // 결과 알약: 이 기기에만 걸리는 설정이라 '이 기기'를 넣어 알린다(다른 기기에서는 꺼져 보인다)
  const [settingsNotice, setSettingsNotice] = useState(null); // 결과 알약(앱 잠금 · 프로필 저장 · 이메일 복사)
  useEffect(() => {
    if (!settingsNotice) return undefined;
    const timer = setTimeout(() => setSettingsNotice(current => current === settingsNotice ? null : current), 2000);
    return () => clearTimeout(timer);
  }, [settingsNotice]);
  // 프로필 그 자리 수정(지라 842). nameDraft 가 문자열이면 닉네임 입력 중
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const [nameDraft, setNameDraft] = useState(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [nameFailure, setNameFailure] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  // 사진 말풍선: { anchor, closing }. iOS 는 말풍선 모달이 다 닫힌 뒤 앨범을 연다(공방 추가 메뉴와 같은 이유)
  const [photoMenu, setPhotoMenu] = useState(null);
  const penRef = useRef(null), afterPhotoMenu = useRef(null), photoMenuTimer = useRef(null);
  // 닉네임 · 사진 저장은 서로의 지금 값을 함께 보내므로 한 번에 하나만 한다(앞 저장이 끝나기 전 값이 섞여 되돌아가지 않게)
  const profileSaving = useRef(false);
  useEffect(() => () => clearTimeout(photoMenuTimer.current), []);
  // 계정이 바뀌면 입력 중이던 닉네임은 버린다
  useEffect(() => { setNameDraft(null); setNameFailure(''); setPhotoMenu(null); }, [previewUser?.userId]);
  // 지금 비밀번호를 잊었을 때: 회원은 계정으로 다시 확인(reauth), 게스트는 저장값 손상일 때만 초기화(읽기 오류는 다시 읽기).
  // 새 비밀번호를 정하는 setup 화면에는 두지 않는다.
  const [reauth, setReauth] = useState(null); // 계정 확인 뒤 할 일: 'off' | 'change'
  // 계정 확인은 확인할 수단(accountService.verifyAccount)이 있을 때만 연다 — 없으면 '잊었어요' 칸을 비운다(눌러도 아무 일 없는 칸을 두지 않게, 리뷰 !495).
  // 확인 뒤 할 일은 누른 순간의 PIN 화면 목적(끄기 · 바꾸기)을 그대로 쓴다
  const canReauth = authenticatedUser && typeof accountService?.verifyAccount === 'function';
  // PIN 화면이 닫히면(돌아가기 · 안드로이드 뒤로 키) 계정 확인도 함께 닫는다 — 다음에 PIN 화면을 열 때 계정 확인이 바로 뜨지 않게(리뷰 !495)
  useEffect(() => { if (!pin) setReauth(null); }, [pin]);
  const recoverAppLock = appLockRecoveryAction({
    member: authenticatedUser, state: lockState, scope: lockScope, onReauth: canReauth ? () => setReauth(pin?.next === 'off' ? 'off' : 'change') : undefined,
    onCleared: () => { setPin(null); reloadLock(); },
    onStateChange: state => setLockRead({ scope: lockScope, state }),
  });
  // 내 공간에 들어올 때 서버 회원정보(GET /me)로 로그인 시점 값을 갱신한다. 실패하면 로그인 응답 값을 그대로 보여 주고 다시 들어올 때 재시도한다.
  const userId = authenticatedUser ? previewUser.userId : null;
  useEffect(() => {
    if (settingsPage || !userId || route !== 'home' || typeof accountService?.getProfile !== 'function') return undefined;
    let active = true;
    accountService.getProfile(previewUser)
      .then(profile => { if (active) onUpdatePreview?.(profile); })
      .catch(() => {});
    return () => { active = false; };
    // previewUser 는 갱신 결과로 바뀌므로 계정 · 화면 전환 때만 다시 불러온다.
  }, [userId, route, settingsPage]); // eslint-disable-line react-hooks/exhaustive-deps
  // 폰 마이페이지의 알림 설정 하위 화면: 안드로이드 뒤로 키는 마이페이지 본문으로 돌아온다(다른 하위 화면과 같은 규칙)
  // 태블릿 차단한 사용자 페이지도 같은 규칙(뒤로 키 → 마이페이지 본문)
  // 차단 목록 페이지는 태블릿 전용이다. 연 채로 창이 폰 배치로 줄면 마이페이지 처음으로 돌린다(뒤로 가기 가드도 함께 풀린다, 리뷰 !489)
  useEffect(() => { if (compact && route === 'blocks') setRoute('home'); }, [compact, route]);
  const notificationsOpen = route === 'notifications' || route === 'blocks';
  useEffect(() => {
    if (!notificationsOpen || !registerLeaveGuard) return undefined;
    return registerLeaveGuard(move => move(), () => setRoute('home'));
  }, [notificationsOpen, registerLeaveGuard]);
  // 비밀번호 변경 화면: 뒤로 키는 마이페이지 본문으로 돌아온다
  const passwordOpen = route === 'password';
  useEffect(() => {
    if (!passwordOpen || !registerLeaveGuard) return undefined;
    return registerLeaveGuard(move => move(), () => setRoute('home'));
  }, [passwordOpen, registerLeaveGuard]);
  // 회원 설정은 서버 인증이 끝난 세션이나 게스트만 연다(이전 체험 세션 값은 그리지 않는다)
  if (!authenticatedUser && !guest) return null;
  // 비밀번호 화면은 앱 전체(왼쪽 메뉴 · 아래 탭까지)를 덮는 전체 화면이다. 내 공간 본문 안에 두면 잘리고 메뉴가 남는다.
  let pinScreen = null;
  if (pin) {
    const done = async value => {
      if (pin.mode === 'verify' && pin.next === 'change') { setPin({ mode: 'setup', next: 'change' }); return; }
      // 저장이 실패하면 잠금 상태를 다시 읽어 실제 값으로 되돌리고 실패를 알린다(켜졌다고 오해하지 않게)
      try {
        if (pin.mode === 'verify') await clearAppLock(lockScope);
        else await setAppLock(lockScope, value);
        setSettingsNotice({ message: pin.mode === 'verify' ? '이 기기의 앱 잠금을 껐어요'
          : pin.next === 'change' ? '이 기기의 앱 잠금 비밀번호를 바꿨어요' : '이 기기에 앱 잠금을 켰어요' });
      } catch { notify('앱 잠금', '앱 잠금을 바꾸지 못했어요. 다시 시도해 주세요.'); }
      reloadLock();
      setPin(null);
    };
    // 계정 확인을 통과하면: 끄려던 거면 바로 끄고, 바꾸려던 거면 새 4자리로 넘어간다
    const verified = async () => {
      const next = reauth;
      setReauth(null);
      if (next === 'change') { setPin({ mode: 'setup', next: 'change' }); return; }
      try { await clearAppLock(lockScope); setSettingsNotice({ message: '이 기기의 앱 잠금을 껐어요' }); }
      catch { notify('앱 잠금', '앱 잠금을 바꾸지 못했어요. 다시 시도해 주세요.'); }
      reloadLock();
      setPin(null);
    };
    pinScreen = (
      <EditorModal visible animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => { if (reauth) setReauth(null); else setPin(null); }}>
        <PinScreen key={`${pin.mode}:${pin.next || ''}`} mode={pin.mode} user={previewUser} getProfilePhotoSource={getProfilePhotoSource}
          check={value => checkAppLockStatus(lockScope, value)} onDone={done} onCancel={() => setPin(null)} onForgot={pin.mode === 'verify' ? recoverAppLock : undefined} />
        {reauth && canReauth && <AppLockReauth user={previewUser} getProfilePhotoSource={getProfilePhotoSource}
          verify={input => accountService.verifyAccount(input)} onVerified={verified} onCancel={() => setReauth(null)} />}
      </EditorModal>
    );
  }
  const editService = authenticatedUser && accountService ? accountService : null;
  // 비밀번호 변경 · 탈퇴는 서버가 모든 세션을 폐기하므로 로그아웃 요청을 또 보내지 않고 이 기기의 세션만 정리한다(onClearSession)
  if (route === 'password' && authenticatedUser && accountService) return <PasswordResetScreen change compact={compact} email={previewUser?.email || ''} service={accountService} backLabel="마이페이지로 돌아가기" onClose={() => setRoute('home')} onComplete={onClearSession} />;
  // 태블릿: 차단한 사용자도 알림 설정처럼 본문 자리 페이지로 연다(모달 아님, 2026-11-09 지라 537). 폰은 전체 화면 차단 목록 그대로
  if (route === 'blocks' && !compact && authenticatedUser && onOpenBlockedUsers) return <BlockedUsersPage onClose={() => setRoute('home')} />;
  if (route === 'notifications' && authenticatedUser) return <NotificationSettingsScreen compact={compact} userId={userId} accountService={accountService} pushIssue={pushIssue} backLabel={settingsPage ? '설정으로 돌아가기' : '마이페이지로 돌아가기'} onClose={() => setRoute('home')} />;

  // 판 오른쪽 끝은 계정 상태의 대표 행동: 게스트는 `로그인 · 회원가입`, 회원은 닉네임 `수정` 윤곽 버튼.
  // 로그인 화면은 지금 화면 위에 덮어 뜨고, 회원가입은 로그인 화면에서 이어 간다
  // 폰도 이름 옆이 기본이고, 좁은 창 · 큰 글자 설정에서 이름이 잘리면 이름 아래 전폭으로 내린다
  const loginBelow = placesLoginBelow({ guest, compact, width: windowSize.width, fontScale: windowSize.fontScale });
  const loginButton = guest ? <DioButton variant="filled" label="로그인 · 회원가입" onPress={openLogin} block={loginBelow} style={loginBelow ? local.loginCompact : compact ? local.loginInline : local.login} /> : null;
  // 게스트는 프로필을 고치지 않는다(사용자 결정 2026-11-05). 회원만 사진 펜 · 닉네임 수정이 있다
  const canEditProfile = !guest && typeof editService?.updateProfile === 'function';
  const memberPhone = compact && !guest;
  // 닉네임만 또는 사진만 바꿔도 나머지는 지금 값 그대로 보낸다(서버 회원정보는 닉네임 · 사진만 받는다)
  const saveProfile = async changes => {
    const saved = await editService.updateProfile(previewUser, { nickname: previewUser.nickname, photoUri: previewUser.photoUri || null, ...changes });
    onUpdatePreview?.(saved);
    return saved;
  };
  const editingName = nameDraft !== null;
  const draftError = editingName && nameDraft ? nicknameError(normalizeNickname(nameDraft)) : '';
  const profileBusy = nameBusy || photoBusy;
  const nameReady = editingName && !profileBusy && !!nameDraft && !draftError;
  const startName = () => { setNameFailure(''); setNameDraft(previewUser?.nickname || ''); };
  const cancelName = () => { if (!nameBusy) { setNameDraft(null); setNameFailure(''); } };
  const saveName = async () => {
    if (!nameReady || profileSaving.current) return;
    const next = normalizeNickname(nameDraft);
    if (next === previewUser?.nickname) { setNameDraft(null); return; }
    profileSaving.current = true;
    setNameBusy(true); setNameFailure('');
    try {
      await saveProfile({ nickname: next });
      if (!alive.current) return;
      setNameDraft(null);
      setSettingsNotice({ message: '닉네임을 바꿨어요' });
    } catch (error) {
      if (alive.current) setNameFailure(error?.message || '닉네임을 바꾸지 못했어요. 다시 시도해 주세요.');
    } finally {
      profileSaving.current = false;
      if (alive.current) setNameBusy(false);
    }
  };
  // next: undefined 면 앨범에서 고르고, null 이면 기본 이미지로 되돌린다
  const changePhoto = async next => {
    if (profileSaving.current) return;
    profileSaving.current = true;
    setPhotoBusy(true);
    try {
      const uri = next === undefined ? await photoPicker() : next;
      if (!alive.current || (next === undefined && !uri)) return; // 앨범을 그냥 닫았다
      await saveProfile({ photoUri: uri });
      if (alive.current) setSettingsNotice({ message: uri ?'프로필 사진을 바꿨어요' : '기본 이미지로 바꿨어요' });
    } catch (error) {
      if (alive.current) notify('프로필 사진', error?.message || '프로필 사진을 바꾸지 못했어요. 다시 시도해 주세요.');
    } finally {
      profileSaving.current = false;
      if (alive.current) setPhotoBusy(false);
    }
  };
  const openPhotoMenu = () => {
    if (profileBusy) return;
    const node = penRef.current;
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => setPhotoMenu({ anchor: { x, y, width, height } }));
    else setPhotoMenu({ anchor: null });
  };
  const closePhotoMenu = () => { clearTimeout(photoMenuTimer.current); afterPhotoMenu.current = null; setPhotoMenu(null); };
  const runAfterPhotoMenu = action => {
    if (Platform.OS !== 'ios') { closePhotoMenu(); action(); return; }
    afterPhotoMenu.current = action;
    setPhotoMenu(menu => menu && { ...menu, closing: true });
    // 닫힘 알림이 오지 않으면 그대로 닫는다(사용자가 다시 누를 수 있게)
    photoMenuTimer.current = setTimeout(closePhotoMenu, 2000);
  };
  const photoMenuDismissed = () => {
    const action = afterPhotoMenu.current;
    clearTimeout(photoMenuTimer.current);
    afterPhotoMenu.current = null;
    setPhotoMenu(null);
    action?.();
  };
  const avatarSize = compact ? (memberPhone ? local.avatarMemberPhone : local.avatarCompact) : null;
  const nameActions = !canEditProfile ? null : editingName ? (
    <View style={[local.nameActions, memberPhone && local.nameActionsBelow]}>
      <DioButton variant="ghost" label="닉네임 수정 취소" text="취소" disabled={nameBusy} onPress={cancelName} style={local.nameButton} />
      <DioButton variant="filled" label="닉네임 저장" text="저장" disabled={!nameReady} loading={nameBusy} onPress={saveName} style={local.nameButton} />
    </View>
  ) : (
    <DioButton variant="ghost" outline label="닉네임 수정" text="수정" icon="edit" disabled={photoBusy} onPress={startName} style={local.editButton} />
  );

  // 로그인 계정 · 비밀번호 변경은 없앤 프로필 수정 화면에서 옮겨 왔다(지라 842). 비밀번호 변경은 이메일 가입 회원만
  const providerName = PROVIDER_NAMES[previewUser?.provider] || '소셜';
  const accountName = previewUser?.provider === 'email' ? previewUser?.email
    : previewUser?.email ? `${providerName} · ${previewUser.email}` : `${providerName} 계정`;
  const accountRow = authenticatedUser && accountName ? (
    <View accessible accessibilityLabel={`로그인 계정: ${accountName}`} style={local.linkRow}>
      <Text style={local.infoLabel}>로그인 계정</Text>
      <Text selectable numberOfLines={1} style={local.infoValue}>{accountName}</Text>
    </View>
  ) : null;
  const passwordRow = authenticatedUser && accountService && previewUser?.provider === 'email' ? (
    <Pressable accessibilityRole="button" accessibilityLabel="비밀번호 변경" onPress={() => setRoute('password')} style={local.linkRow}>
      <Text style={local.linkLabel}>비밀번호 변경</Text>
      <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />
    </Pressable>
  ) : null;

  // 계정 구역(로그인한 사용자만): 로그아웃 · 회원 탈퇴를 다른 설정과 같은 목록 줄로 둔다(지라 597, 탈퇴는 회원정보 수정에서 옮겨 왔다)
  const canWithdraw = !guest && typeof editService?.withdraw === 'function';
  const logout = onEndPreview && !guest ? (
    <Pressable accessibilityRole="button" accessibilityLabel="로그아웃" onPress={() => confirmAction({ title: '로그아웃할까요?', message: '', confirmLabel: '로그아웃', danger: false, onConfirm: onEndPreview })} style={local.linkRow}>
      <Text style={local.linkLabel}>로그아웃</Text>
    </Pressable>
  ) : null;
  const withdrawRow = canWithdraw ? (
    <Pressable accessibilityRole="button" accessibilityLabel="회원 탈퇴" onPress={() => setWithdrawing(true)} style={local.linkRow}>
      <Text style={[local.linkLabel, local.dangerLabel]}>회원 탈퇴</Text>
    </Pressable>
  ) : null;
  // 회원만: 현재 제공되는 알림 설정으로 가는 줄.
  const serverNotifications = authenticatedUser ? (
    <Pressable accessibilityRole="button" accessibilityLabel={NOTIFICATION_SETTINGS_TITLE} onPress={() => setRoute('notifications')} style={local.linkRow}>
      <Text style={local.linkLabel}>{NOTIFICATION_SETTINGS_TITLE}</Text>
      <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />
    </Pressable>
  ) : null;

  return (
    <>
    <ScrollView style={local.root} contentContainerStyle={[s.screen, compact && s.screenCompact, local.content]} showsVerticalScrollIndicator={false}>
      {/* 설정 본문은 다른 화면처럼 좌우 여백까지 꽉 채운다(760 제한은 실기기에서 오른쪽만 비어 좌우가 맞지 않았다). 조작은 모두 오른쪽 끝선 */}
      <View style={local.column}>
      <Header title={settingsPage ? '설정' : '마이페이지'} icon={settingsPage ? 'settings' : 'person'} compact={compact}
        left={onBack ? <BackButton label="마이페이지로 돌아가기" onPress={onBack} /> : undefined} />
      {!settingsPage && <View style={[local.identity, compact && local.identityCompact, guest && compact && !loginBelow && local.identityGuestInline]}>
        <View style={[local.identityRow, memberPhone && local.identityRowPhone]}>
          <View style={[local.avatarWrap, avatarSize]}>
            <View style={[local.avatar, avatarSize, photoBusy && local.avatarBusy]}>
              {photoUri && failedPhoto !== photoIdentity
                ? <Image source={{ ...photoSource, cacheKey: photoCacheKey }}
                    contentFit="cover" cachePolicy="memory"
                    onError={() => {
                      setFailedPhoto(photoIdentity);
                    }} accessibilityLabel="프로필 사진" style={[local.photo, avatarSize]} />
                // 사진이 없을 때의 기본 프로필: 계정 색 동그라미에 모아의 표정(메뉴 아래 프로필과 같은 그림)
                : <DefaultAvatar user={previewUser} accessibilityLabel="기본 프로필 사진" style={[local.photo, avatarSize]} />}
            </View>
            {/* 오른쪽 아래 펜: 앨범에서 선택 · 기본 이미지로 변경 말풍선 */}
            {canEditProfile && <Pressable ref={penRef} accessibilityRole="button" accessibilityLabel="프로필 사진 변경" accessibilityState={{ expanded: !!photoMenu, disabled: profileBusy }}
              disabled={profileBusy} onPress={openPhotoMenu} hitSlop={8} style={local.pen}>
              <AppIcon name="edit" size={14} forText={12} color={colors.primaryStrong} />
            </Pressable>}
          </View>
          <View style={local.identityText}>
            {editingName ? (
              <TextInput accessibilityLabel="닉네임" value={nameDraft} onChangeText={value => { setNameDraft(value); setNameFailure(''); }}
                editable={!nameBusy} autoFocus maxLength={12} autoCapitalize="none" autoCorrect={false} autoComplete="off"
                returnKeyType="done" onSubmitEditing={saveName}
                style={[local.name, local.nameInput, Platform.OS === 'web' && { outlineStyle: 'none' }]} />
            ) : (
              <View style={local.nameRow}>
                <Text numberOfLines={1} style={[local.name, compact && local.nameCompact, local.nameShrink]}>{previewUser?.nickname || '나'}</Text>
              </View>
            )}
            {editingName && !!(draftError || nameFailure) && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={local.nameError}>{draftError || nameFailure}</Text>}
          </View>
          {!(memberPhone && editingName) && nameActions}
          {!loginBelow && loginButton}
        </View>
        {/* 폰 회원: 입력 중에는 취소 · 저장을 이름 줄 아래 오른쪽에. 폰 게스트: 이름 줄 아래 판 안에 전폭 한 줄 */}
        {memberPhone && editingName && nameActions}
        {loginBelow && loginButton}
      </View>}
      <View style={local.cards}>
        {!settingsPage && authenticatedUser && <SettingCard compact={compact}>
          <SettingSection title="사용자 관리">
            <Pressable accessibilityRole="button" accessibilityLabel="차단한 사용자" onPress={compact ? onOpenBlockedUsers : () => setRoute('blocks')} disabled={!onOpenBlockedUsers} style={local.linkRow}>
              <Text style={local.linkLabel}>차단한 사용자</Text>
              <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />
            </Pressable>
          </SettingSection>
        </SettingCard>}
        {settingsBody && <SettingCard compact={compact}>
          <NotificationSetting compact={compact}>{serverNotifications}</NotificationSetting>
          {/* 게스트는 새로 켤 수 없다. 이미 켠 게스트는 끌 수 있게 끄기만 남긴다 */}
          {showLockSetting && <AppLockSetting compact={compact} locked={locked} readFailed={lockReadFailed} onRetry={reloadLock} canEnable={canEnableLock} onTurnOn={() => setPin({ mode: 'setup' })} onTurnOff={() => setPin({ mode: 'verify', next: 'off' })} onChange={() => setPin({ mode: 'verify', next: 'change' })} />}
          <EditSetting compact={compact} accountId={userId == null ? null : String(userId)} />
          <AppInformation onCopyNotice={message => {
            setSettingsNotice(current => message ? { source: 'copy', message } : current?.source === 'copy' ? null : current);
          }} />
        </SettingCard>}
        {/* 기기 다이어리를 계정으로 옮기고 원본을 지우는 계정 · 데이터 동작이라 보관함이 아니라 여기 둔다(사용자 결정 2026-11-05) */}
        {!settingsPage && guestImport && <SettingCard compact={compact}>
          <SettingSection title="이 기기">
            <Pressable accessibilityRole="button" accessibilityLabel={`이 기기의 다이어리 ${guestImport.count}권 옮기기`} onPress={guestImport.open} style={local.linkRow}>
              <Text style={local.linkLabel}>{`이 기기의 다이어리 ${guestImport.count}권 옮기기`}</Text>
              <AppIcon name="chevron-right" size={18} forText={16} color={colors.textMuted} />
            </Pressable>
          </SettingSection>
        </SettingCard>}
        {!settingsPage && logout && <SettingCard compact={compact}>
          <SettingSection title="계정">{accountRow}{passwordRow}{logout}{withdrawRow}</SettingSection>
        </SettingCard>}
      </View>
      </View>
    </ScrollView>
    {pinScreen}
    {photoMenu && <DiaryActionBubble visible={!photoMenu.closing} onDismiss={photoMenuDismissed} anchor={photoMenu.anchor} title="프로필 사진" onClose={closePhotoMenu} actions={[
      { id: 'pick', label: '앨범에서 선택', text: '앨범에서 선택', icon: 'image', onPress: () => runAfterPhotoMenu(() => changePhoto()) },
      { id: 'default', label: '기본 이미지로 변경', text: '기본 이미지로 변경', icon: 'person', disabled: !photoUri, onPress: () => { closePhotoMenu(); changePhoto(null); } },
    ]} />}
    {settingsNotice && <ActionToast compact={compact} bottom={24} message={settingsNotice.message} />}
    {/* 탈퇴는 서버가 모든 세션을 폐기하므로 이 기기의 세션만 정리한다(onClearSession) */}
    {withdrawing && editService && <WithdrawDialog service={editService} user={previewUser} onClose={() => setWithdrawing(false)} onEndSession={onWithdrawn} />}
    </>
  );
}

const local = StyleSheet.create({
  // 카드 대신 앱 바탕(surfaceSoft) 위에 바로 놓는다(공방과 같다)
  root: { flex: 1, backgroundColor: colors.surfaceSoft },
  content: { paddingBottom: 36 },
  // 정체성 판(원 페이저 12): 옅은 면(surfaceMuted) + 모서리 16 한 장, 테두리 없음. 화면에서 면이 있는 판은 이것 하나다
  identity: { minHeight: 112, justifyContent: 'center', gap: 16, padding: 20, borderRadius: 16, backgroundColor: colors.surfaceMuted },
  identityCompact: { padding: 16 },
  identityGuestInline: { minHeight: 80 }, // 폰 게스트: 아바타 48 · 버튼 48 한 줄
  editButton: { minHeight: 32, minWidth: 92, paddingHorizontal: 12, borderColor: colors.secondary, backgroundColor: colors.surface },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  identityText: { flex: 1, minWidth: 0, gap: 2 },
  avatarWrap: { width: 72, height: 72 },
  avatar: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 36, backgroundColor: colors.primaryStrong }, // 동그라미(메뉴 아래 프로필 그림과 같은 모양)
  photo: { width: 72, height: 72, borderRadius: 36 },
  avatarCompact: { width: 48, height: 48, borderRadius: 24 }, // 폰 게스트: 48(원 페이저 12)
  identityRowPhone: { gap: 14 },
  avatarMemberPhone: { width: 64, height: 64, borderRadius: 32 }, // 폰 회원 64
  avatarBusy: { opacity: 0.6 },
  // 사진 펜: 아바타 오른쪽 아래에 걸친 흰 동그라미 28(터치는 hitSlop 으로 44)
  pen: { position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.cardBorder },
  // 닉네임 입력: 글자 크기 · 굵기는 이름 그대로, 아래 2px 선만 둔다
  nameInput: { paddingVertical: 2, paddingHorizontal: 0, borderBottomWidth: 2, borderBottomColor: colors.primaryStrong },
  nameError: { marginTop: 4, color: colors.dangerStrong, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  nameActions: { flexDirection: 'row', gap: 8 },
  nameButton: { minHeight: 32, minWidth: 72, paddingHorizontal: 12 }, // 수정 버튼과 같은 높이 32, 면은 버튼 종류(고스트 · 채움) 그대로
  nameActionsBelow: { justifyContent: 'flex-end' },
  name: { color: colors.text, fontSize: 20, lineHeight: 26, fontWeight: '800', letterSpacing: -0.4 },
  nameCompact: { fontSize: 20, lineHeight: 26 },
  // 게스트: 로그인 · 회원가입 채움 48
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  nameShrink: { flexShrink: 1 },
  login: { minHeight: 48, minWidth: 160, marginLeft: 8 }, // 정체성 묶음과 최소 24(줄 간격 16 + 8)
  loginInline: { minHeight: 48, flexShrink: 0 },
  loginCompact: { minHeight: 48, marginTop: -4 }, // 판 안 간격 16 에서 4 당겨 첫 줄과 12
  // 설정 줄(SettingRow)과 같은 48 · 위아래 8 · 이름 16/600 · cardBorder 구분선(구역마다 줄 높이가 달라 보이지 않게, 2026-11-08)
  linkRow: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: colors.cardBorder },
  linkLabel: { flex: 1, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  dangerLabel: { color: colors.dangerStrong },
  infoLabel: { flexShrink: 0, color: colors.text, fontSize: 16, lineHeight: 22, fontWeight: '600' }, // linkLabel 과 같은 글자, 늘어나지 않고 값 칸이 남는 폭을 쓴다
  infoValue: { flex: 1, textAlign: 'right', color: colors.textMuted, fontSize: 15, lineHeight: 22, fontWeight: '500' },
  cards: { marginTop: 8 },
  column: { width: '100%', maxWidth: 1040, alignSelf: 'center' },
});
