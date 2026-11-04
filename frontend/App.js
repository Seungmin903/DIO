import { openCopyIfSafe } from './src/notifications/editorInvitationGuard';
import { describeSharingInvitations } from './src/notifications/describeSharingInvitations';
import MemberTrashNotice from './src/diary/components/MemberTrashNotice';
import MemberLibraryNotice from './src/diary/components/MemberLibraryNotice';
import { memberLibraryQuery } from './src/diary/services/memberLibraryQuery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Platform, StatusBar, StyleSheet, View, useWindowDimensions } from 'react-native';
import PinScreen from './src/diary/components/PinScreen';
import { appLockGraceOver, appLockScope, checkAppLockStatus, readAppLockState } from './src/shared/appLock';
import { appLockRecoveryAction } from './src/diary/components/appLockRecovery';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import documentStorage from './src/editor/services/documentStorage';
import EditorScreen from './src/editor/screens/EditorScreen';
import { editorDocKey, loadEditorDoc, prefetchEditors, prepareEditor, rememberEditorDoc, saveEditorDoc } from './src/editor/services/editorDocs';
import AuthScreen from './src/auth/AuthScreen';
import { apiConfigurationError, authService } from './src/auth/authService';
import ApiConfigurationErrorScreen from './src/shared/ApiConfigurationErrorScreen';
import { guestProfile } from './src/auth/guestProfileDevice';
import { LoginGateProvider, useLoginGate } from './src/auth/loginGate';
import { useSharing } from './src/sharing/useSharing';
import SharingHub from './src/sharing/SharingHub';
import { createSharingGate } from './src/sharing/sharingGate';
import { AuthenticatedNotificationProvider, useOptionalSharedNotifications } from './src/notifications/NotificationProvider';
import HomeNotificationFlow from './src/notifications/HomeNotificationFlow';
import { isSessionDocumentKey } from './src/editor/services/sessionDocuments.js';
import { startPushRuntime } from './src/notifications/pushRuntime';
import { C, DEFAULT_FILTER, DESK_COLOR } from './src/diary/constants';
import { useDiaries } from './src/diary/hooks/useDiaries';
import { useMemberDiaries } from './src/diary/hooks/useMemberDiaries';
import MemberRequestNotice from './src/diary/components/MemberRequestNotice';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import { withPdfPages } from './src/diary/utils/pdfImport';
import { coverTabPaint } from './src/diary/utils/coverDesign';
import SideRail, { RAIL_WIDTH } from './src/diary/components/SideRail';
import BottomTabs from './src/diary/components/BottomTabs';
import { createProfileSettingsNavigation } from './src/diary/components/profileNavigationModel';
import SharingEntry from './src/sharing/SharingEntry';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ConnectedDiaryLibrary from './src/diary/screens/ConnectedDiaryLibrary';
import MockLibraryApp from './src/diary/screens/MockLibraryApp';
import { clearMockLibrary } from './src/diary/services/legacyMockCleanup';
import { useLibraryMetadata } from './src/diary/hooks/useLibraryMetadata';
import { parseSort, queryDiaries } from './src/diary/utils/libraryQuery';
import { savedLibraryView } from './src/diary/utils/libraryView';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import ProfileCropHost from './src/auth/ProfileCropHost';
import DecorationStudioScreen from './src/diary/screens/DecorationStudioScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { GuestImportHost } from './src/diary/components/GuestImportDialog';
import { styles as s } from './src/diary/styles';
import { confirmAction, notify } from './src/shared/dialogs';
import DialogHost from './src/shared/DialogHost';
import { normalizePaperAppearance } from './src/editor/templates/appearance.js';
import { fitTabletFrame } from './src/shared/layout';
import { useFormFactor } from './src/shared/useFormFactor';
import { CAN_LOCK_ORIENTATION, useOrientationLock } from './src/shared/useOrientationLock';
import { useHiddenNavigationBar } from './src/shared/useHiddenNavigationBar';
import { normalizeTemplateConfig } from './src/editor/templates/creation.js';
import { createDefaultDoc } from './src/editor/state/defaultDoc.js';
import { loadJSON, saveJSON, STORAGE_KEYS } from './src/editor/services/storage';
import { randomUUID } from 'expo-crypto';
import { createId, setUuidGenerator } from './src/editor/utils/common';
import HandwritingStudio from './src/handwriting/HandwritingStudio';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import BootSplash from './src/shared/BootSplash';
import { PRETENDARD_FILES } from './src/shared/pretendardFiles';
import { preloadTextFonts } from './src/editor/services/textFonts';
import ActionToast, { ACTION_TOAST_MS } from './src/shared/ActionToast';

// 텍스트 글꼴은 쓰일 때 불러온다(textFonts.js). 앱이 켜진 뒤 잠잠해지면 기본 글꼴과 내 폰트 목록만 먼저 준비한다.
preloadTextFonts();

// 네이티브에는 전역 crypto가 없어 다이어리·페이지·요소 UUID를 expo-crypto로 만든다.
if (Platform.OS !== 'web') setUuidGenerator(randomUUID);

// 속지 캐시(16개)를 넘지 않도록 앞쪽 다이어리만 미리 준비한다.
const PREFETCH_DIARIES = 8;
const PREFETCH_DELAY_MS = 400;
// 편집기 진입 전 준비를 기다리는 최대 시간. 보통은 이보다 훨씬 빨리 끝난다.
const EDITOR_PREPARE_LIMIT_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 시작 화면(로고)은 보관함이 다 그려질 때까지 둔다. 첫 렌더에 바로 내려가면 글꼴 · 게스트 · 보관함을 읽는 동안 빈 화면이 보인다.
// 로고는 JS 시작 화면(BootSplash, 벡터)이 그린다. 네이티브 시작 화면은 BootSplash 가 처음 그려지면 바로 내린다
// (안드로이드는 네이티브 시작 화면에 로고 없이 바탕색만 둔다: plugins/withSplashWindowBackground.js).
// 무엇이 실패해도 로고에 갇히지 않도록 SPLASH_LIMIT_MS 뒤에는 내린다.
const SPLASH_LIMIT_MS = 8000;
const DOCUMENT_MIGRATION_DELAY_MS = 3000;
// 개발 빌드의 목업 화면(EXPO_PUBLIC_DIARY_SOURCE): mock = 연결 검증 보관함, mock-library = 보관함 · 알림 모의, mock-sharing = 공유 모의
const MOCK_SCREENS = ['mock', 'mock-library', 'mock-sharing'];
SplashScreen.preventAutoHideAsync().catch(() => {});
const hideSplash = () => { SplashScreen.hideAsync().catch(() => {}); };

export default function App() {
  // 앱 UI 글꼴(Pretendard)을 처음 그리기 전에 불러온다. 못 불러오면(fontError) 기본 글꼴로 그대로 연다
  const [fontsLoaded, fontError] = useFonts(PRETENDARD_FILES);
  const [previewSession, updatePreviewSession] = useState(null);
  const sessionRef = useRef(previewSession);
  // All session writes originate in callbacks/effects. Publish the latest
  // intended session synchronously, without mutating refs during rendering or
  // waiting for passive effects before rejecting an older callback.
  const setPreviewSession = useCallback(value => {
    const next = typeof value === 'function' ? value(sessionRef.current) : value;
    sessionRef.current = next;
    updatePreviewSession(next);
  }, []);
  const authenticatedSession = previewSession?.mode === 'authenticated' ? previewSession : null;
  const memberSessionKey = authenticatedSession ? authService.getMemberSessionKey(authenticatedSession.userId) : null;
  const [booting, setBooting] = useState(true);
  const finishBoot = useCallback(() => { setBooting(false); hideSplash(); }, []);
  // 로그인이 필요한 기능에서 연 로그인 화면 { feature, action }. 지금 화면 위에 겹쳐 띄워, 닫아도 보던 화면이 그대로 남는다.
  const [loginRequest, setLoginRequest] = useState(null);
  const openLogin = request => setLoginRequest(current => current?.sessionExpired
    ? { ...request, sessionExpired: true } : request);
  // 개발용 목업 화면은 세션 없이 그리므로 게스트로 시작하지 않는다. 아래에서 따로 그리는 세 값만 목업으로 본다
  // (다른 mock* 값은 세션 분기로 내려가므로 게스트로 시작해야 빈 화면이 되지 않는다)
  const mockSource = __DEV__ && MOCK_SCREENS.includes(process.env.EXPO_PUBLIC_DIARY_SOURCE || '');
  // 게스트는 지난번에 고친 프로필(닉네임 · 한 줄 소개 · 사진)을 이어서 시작한다
  const startSession = async session => setPreviewSession(session?.provider === 'guest' ? await guestProfile.start(session) : session);
  // 로그인 화면 없이 게스트(방문자)로 시작한다. 로그인은 로그인이 필요한 기능을 누를 때만 묻는다(loginGate).
  const startGuest = async () => {
    const target = sessionRef.current;
    const targetKey = target?.mode === 'authenticated' ? authService.getMemberSessionKey(target.userId) : null;
    const stillCurrent = () => sessionRef.current === target && !authService.getSessionKey() &&
      (targetKey === null || authService.getMemberSessionKey(target.userId) === targetKey);
    const session = { mode: 'preview', provider: 'guest', nickname: '방문자' };
    // 예전 개발자 모드(개발 빌드 전용)가 넣던 예시 다이어리가 개발 기기에 남아 있으면 지운다(사용자 다이어리는 건드리지 않는다).
    // 운영 빌드에는 생길 수 없어 저장소를 건드리지 않는다. 보관함이 정리 전 목록을 읽어 다시 저장하지 않게 끝날 때까지 기다린다
    if (__DEV__) await clearMockLibrary().catch(() => {});
    // 지난 프로필을 못 읽어도 빈 화면에 갇히지 않게 기본 게스트로 시작한다
    if (!stillCurrent()) return;
    try {
      const guest = await guestProfile.start(session);
      if (stillCurrent()) setPreviewSession(guest);
    } catch { if (stillCurrent()) setPreviewSession(session); }
  };
  useEffect(() => {
    if (apiConfigurationError || mockSource) return;
    let active = true;
    (async () => {
      let restored = null;
      try { restored = await authService.restoreSession(); }
      catch (error) {
        // Development gateway credentials intentionally do not survive process restarts.
        // Reuse its existing prompt, then resume refresh without asking for the member password.
        if (active && __DEV__ && error?.code === 'DEVELOPMENT_ACCESS_REQUIRED') setLoginRequest({ restoreSession: true });
        else if (active && error?.status === 401 && error.code === 'INVALID_TOKEN') setLoginRequest({ sessionExpired: true });
      }
      if (!active) return;
      if (restored) setPreviewSession(restored);
      else await startGuest();
    })();
    return () => { active = false; };
  }, [apiConfigurationError, mockSource]);
  // 비밀번호 재설정 완료는 서버 세션이 이미 폐기됐을 수 있어, 별도 로그아웃 요청 없이
  // 이 기기의 메모리 세션만 지운다. 세션이 끝나면 로그인 화면이 아니라 게스트로 돌아간다.
  // 늦게 온 콜백(비밀번호 재설정 완료 등)이 그사이 바뀐 세션을 지우지 않게, 지금 세션이 지우려던 세션일 때만 끝낸다
  useEffect(() => authService.subscribeSessionExpired?.(expired => {
    const current = sessionRef.current;
    if (current?.mode !== 'authenticated' || String(current.userId) !== expired.userId || authService.getSessionKey() ||
        authService.getMemberSessionKey(current.userId) !== expired.sessionKey) return;
    // Keep the current document mounted beneath the existing login overlay.
    setLoginRequest({ sessionExpired: true });
  }), []);
  const clearSession = () => {
    const target = previewSession, current = sessionRef.current;
    if (!(current === target || (current?.accountId && current.accountId === target?.accountId))) return;
    if (target?.mode === 'authenticated' && (authService.getSessionKey() ||
        authService.getMemberSessionKey(target.userId) !== memberSessionKey)) return;
    // 세션을 비우지 않고 게스트 세션으로 바로 바꾼다(그사이 빈 화면이 없다)
    startGuest();
  };
  const endSession = async () => {
    try {
      if (authenticatedSession) await authService.logout();
    } catch (error) {
      const localMessage = error.code === 'LOGOUT_INCOMPLETE' ? error.message : `${error.message} 이 기기의 로그인 정보는 지웠어요.`;
      notify('로그아웃', `${localMessage} 서버에서 로그아웃을 확인하지 못해 이 계정의 알림이 계속 올 수 있어요. 네트워크 연결 후 다시 로그인하고 로그아웃해 주세요.`);
    }
    finally { clearSession(); }
  };
  // 로그인하면 게스트 보관함(LocalDiaryApp)이 회원 보관함(MemberDiaryApp)으로 통째로 바뀐다. 누른 기능(loginRequest.action)은
  // 사라진 게스트 화면의 것이라 실행하지 않는다. 게스트가 기기에 만든 다이어리는 회원 보관함에서 가져올지 묻고 복사한다(GuestImportHost, 기기에는 남는다).
  const continueFromLogin = session => { setLoginRequest(null); startSession(session).catch(() => setPreviewSession(session)); };
  // 지난 실행에서 공유하고 남은 PDF 임시 파일을 정리한다. (공유 모듈은 불러오지 않는다)
  useEffect(() => { cleanupPdfShareCache().catch(() => {}) }, []);
  // 예전 저장소에 남은 다이어리 문서를 페이지별 파일로 옮긴다. 첫 화면과 겹치지 않게 조금 뒤에 시작한다.
  useEffect(() => {
    const timer = setTimeout(() => { documentStorage.migrateLegacyDocuments().catch(() => {}) }, DOCUMENT_MIGRATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  useHiddenNavigationBar();
  useEffect(() => { const timer = setTimeout(finishBoot, SPLASH_LIMIT_MS); return () => clearTimeout(timer); }, [finishBoot]);
  // 첫 화면(BootSplash)이 그려졌으니 네이티브 시작 화면을 내린다. 로고는 BootSplash 에서 한 번만 보인다
  useEffect(() => { hideSplash(); }, []);
  // 개발용 목업 화면은 보관함 로딩을 거치지 않으니 글꼴만 준비되면 내린다
  useEffect(() => { if ((fontsLoaded || fontError) && mockSource) finishBoot(); }, [fontsLoaded, fontError, finishBoot]); // eslint-disable-line react-hooks/exhaustive-deps
  // API 설정 오류도 앱이 그린 안내 화면이므로 네이티브 시작 화면을 즉시 내린다.
  useEffect(() => { if (apiConfigurationError && (fontsLoaded || fontError)) finishBoot(); }, [apiConfigurationError, fontsLoaded, fontError, finishBoot]);
  const SessionDiaryApp = authenticatedSession ? MemberDiaryApp : LocalDiaryApp;
  if (!fontsLoaded && !fontError) return <SafeAreaProvider style={s.provider}><BootSplash /></SafeAreaProvider>;
  if (apiConfigurationError) return <SafeAreaProvider style={s.provider}><ApiConfigurationErrorScreen /></SafeAreaProvider>;
  if (__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock-sharing') {
    const SharingFixture = require('./tests/fixtures/diary-sharing.fixture').default;
    return <SharingFixture />;
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock-library') {
    return <SafeAreaProvider style={s.provider}><MockLibraryApp /><HandwritingStudio /></SafeAreaProvider>;
  }
  return (
    <SafeAreaProvider style={s.provider}>
      <StatusBar hidden />
      {__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock' ? <ConnectedDiaryLibrary /> : (
        previewSession ? <LoginGateProvider authenticated={!!authenticatedSession && !loginRequest?.sessionExpired} onLogin={openLogin}><SessionDiaryApp key={authenticatedSession ? `authenticated:${memberSessionKey || authenticatedSession.userId}` : 'preview'} previewUser={previewSession} loginOverlayOpen={Boolean(loginRequest)}
          onUpdatePreview={updated => setPreviewSession(current => current?.mode === updated.mode &&
            (current?.mode === 'authenticated' ? String(current.userId) === String(updated.userId) : current?.accountId === updated.accountId) ? updated : current)}
          onEndPreview={endSession} onClearSession={clearSession} onReady={finishBoot} /></LoginGateProvider> : null
      )}
      {loginRequest && <View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}><AuthScreen key={loginRequest.sessionExpired ? 'expired' : 'login'} sessionExpired={loginRequest.sessionExpired === true} resumeSession={loginRequest.restoreSession === true} onContinue={continueFromLogin} onClose={() => {
        setLoginRequest(null);
        const current = sessionRef.current;
        if (current?.mode === 'authenticated' && !authService.getSessionKey() &&
            authService.getMemberSessionKey(current.userId) === memberSessionKey) startGuest();
      }} /></View>}
      <HandwritingStudio />
      {/* 프로필 사진 자르기(동그라미 틀). 로그인 화면 · 프로필 수정 모두 쓰므로 앱 맨 위에 하나 둔다 */}
      <ProfileCropHost />
      {(booting || (!previewSession && !mockSource)) && <BootSplash />}
    </SafeAreaProvider>
  );
}

function LocalDiaryApp(props) {
  const diaryState = useDiaries();
  return <DiaryApp {...props} diaryState={diaryState} />;
}
function MemberDiaryApp(props) {
  const diaryState = useMemberDiaries(String(props.previewUser.userId));
  return <DiaryApp {...props} diaryState={diaryState} />;
}
function DiaryApp(props) {
  const sharing = useSharing(props.previewUser);
  const createInvitations = useCallback(() => sharing.runtime.invitationGateway, [sharing.runtime]);
  const describeInvitations = useCallback((ids, options) => describeSharingInvitations(sharing.runtime.notificationApi, ids, options), [sharing.runtime]);
  const content = <DiaryAppContent {...props} sharing={sharing} />;
  return props.previewUser.mode === 'authenticated'
    ? <AuthenticatedNotificationProvider auth={authService} userId={props.previewUser.userId} createInvitations={createInvitations} describeInvitations={describeInvitations}>{content}</AuthenticatedNotificationProvider>
    : content;
}

function DiaryAppContent({ previewUser, onEndPreview, onClearSession, onUpdatePreview, onReady, diaryState, sharing, loginOverlayOpen = false }) {
  const member = diaryState.source === 'member-api';
  const invitationLeaveGuard = useRef(null);
  const registerInvitationLeaveGuard = useCallback(guard => { invitationLeaveGuard.current = guard; return () => { if (invitationLeaveGuard.current === guard) invitationLeaveGuard.current = null; }; }, []);
  const profileLeaveGuard = useRef(null);
  const studioBackHandler = useRef(null);
  const registerStudioBackHandler = useCallback(handler => {
    studioBackHandler.current = handler;
    return () => { if (studioBackHandler.current === handler) studioBackHandler.current = null; };
  }, []);
  const profileBackHandler = useRef(null);
  const registerProfileLeaveGuard = useCallback((guard, onBack) => {
    profileLeaveGuard.current = guard;
    profileBackHandler.current = onBack;
    return () => {
      if (profileLeaveGuard.current === guard) {
        profileLeaveGuard.current = null;
        profileBackHandler.current = null;
      }
    };
  }, []);
  const authenticatedNotifications = useOptionalSharedNotifications();
  // 앱 잠금(내 공간 → 보안): 이 계정에 잠금이 있으면 세션을 열 때와 백그라운드에서 1분 넘게 있다 돌아올 때 비밀번호 화면으로 덮는다(null = 읽는 중)
  const lockScope = appLockScope(previewUser);
  const [appLocked, setAppLocked] = useState(null);
  const [appLockState, setAppLockState] = useState(null); // readAppLockState 결과(게스트 초기화 경로 판단용)
  useEffect(() => {
    let alive = true, awayAt = null;
    readAppLockState(lockScope).then(state => { if (alive) { setAppLockState(state); setAppLocked(state !== 'off'); } }).catch(() => { if (alive) setAppLocked(false); });
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') awayAt ??= Date.now();
      else if (state === 'active' && awayAt != null) {
        const over = appLockGraceOver(awayAt);
        awayAt = null;
        if (over) readAppLockState(lockScope).then(value => { if (alive && value !== 'off') { setAppLockState(value); setAppLocked(true); } }).catch(() => {});
      }
    });
    return () => { alive = false; subscription.remove(); };
  }, [lockScope]);
  // 회원은 비밀번호를 잊으면 로그아웃으로 잠금을 푼다(다시 로그인해야 들어온다).
  // 게스트는 되찾을 계정이 없어, 저장값 손상으로 PIN을 확인할 수 없을 때만 초기화를 연다. 일시적 읽기 오류는 다시 읽기만 한다.
  const forgotAppLock = appLockRecoveryAction({
    member: previewUser.mode === 'authenticated', state: appLockState, scope: lockScope, onLogout: onEndPreview,
    onCleared: () => { setAppLockState('off'); setAppLocked(false); },
    onStateChange: state => { setAppLockState(state); if (state === 'off') setAppLocked(false); },
  });
  const [sharingRequest, setSharingRequest] = useState(null);
  // 초대 푸시도 공유 입구(sharingGate)를 거친다. 효과가 다시 걸리지 않게 최신 입구를 ref로 읽는다
  const sharingGateRef = useRef(null);
  const pushWarningShown = useRef(false);
  useEffect(() => {
    if (previewUser.mode !== 'authenticated') return;
    let disposed = false, stop = () => {};
    const onPushError = error => {
      if (__DEV__) console.warn('푸시 연결 오류', /^PUSH_[A-Z_]+$/.test(error?.message || '') ? error.message : 'UNKNOWN');
      if (!pushWarningShown.current && ((error?.status === 409 && error?.message !== 'PUSH_BINDING_CONFLICT') || error?.message === 'PUSH_RECOVERY_REQUIRES_ORIGINAL_ACCOUNT')) {
        pushWarningShown.current = true;
        notify('알림 연결 확인', '이전에 사용한 계정으로 로그인해 기기 알림을 확인해 주세요.');
      }
    };
    startPushRuntime({ auth: authService, userId: previewUser.userId, invitations: sharing.runtime.invitationGateway,
      onInvitation: ({ inviteId }) => { if (!disposed) sharingGateRef.current.pushInvitation(inviteId); },
      onError: onPushError }).then(cleanup => { if (disposed) cleanup(); else stop = cleanup; }).catch(error => { if (!disposed) onPushError(error); });
    return () => { disposed = true; stop(); };
  }, [previewUser.mode, previewUser.userId, sharing.runtime]);
  // 공유는 로그인한 사용자만 쓴다. 게스트는 편집 화면에 함께하는 사람을 띄우지 않고, 공유를 누르면 로그인 안내부터 본다.
  const signedIn = previewUser.mode === 'authenticated';
  const loginGate = useLoginGate();
  const sharingGate = useMemo(() => createSharingGate({ authenticated: signedIn, loginGate, open: setSharingRequest,
    beforeOpen: run => { if (profileLeaveGuard.current) profileLeaveGuard.current(run); else run(); } }), [signedIn, loginGate]);
  sharingGateRef.current = sharingGate;
  const shareDiary = sharingGate.share;
  const unreadInvites = (authenticatedNotifications ?? sharing.notifications).count.data?.actionableUnreadCount || 0;
  const openInvitations = sharingGate.invitations;
  const insets = useSafeAreaInsets();
  // 폰·태블릿 모두 현재 안전 영역을 직접 채운다. 데이터·상태는 두 배치가 함께 쓴다.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 폰 배치는 유지하고 태블릿 바깥 프레임도 측정한 안전 영역 전체를 쓴다. 속지 좌표계는 그대로다.
  const { isPhone, isLandscape } = useFormFactor();
  const tabletPortrait = !isPhone && !isLandscape;
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });
  const [page, setPage] = useState('library');
  const [railCollapsed, setRailCollapsed] = useState(true);  // 메뉴가 다 열리거나 닫혔을 때의 폭. 캐러셀은 '줄 폭 + 이 값'(메뉴와 상관없이 같은 값)으로 목록 폭을 정해,
  // 메뉴에 밀려 함께 움직이는 동안과 멈춘 뒤에도 목록 폭이 바뀌지 않게 한다. 다시 그리지 않도록 ref로 넘긴다.
  const railWidthRef = useRef(RAIL_WIDTH.collapsed);
  // 메뉴는 메인 화면 위에 겹쳐 열리므로 메인 화면을 비켜 주는 폭은 늘 접힌 폭이다.
  // 보관함 필터: 범위(내 다이어리 · 공유된 다이어리) + 즐겨찾기 여부 (libraryQuery.filterScope · filterFavorite)
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [view, setView] = useState('carousel');
  // 사용자가 마지막으로 고른 보기(펼쳐서 · 스와이프 · 한눈에)를 기기에 남겨 다음에 열 때 그 보기로 시작한다.
  // 읽어 오는 사이에 사용자가 이미 보기를 바꿨으면 늦게 도착한 저장값으로 되돌리지 않는다.
  const viewChosen = useRef(false);
  useEffect(() => {
    let alive = true;
    loadJSON(STORAGE_KEYS.libraryView, null).then(saved => {
      const restored = savedLibraryView(saved);
      if (alive && restored && !viewChosen.current) setView(restored);
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const changeView = useCallback((next) => { viewChosen.current = true; setView(next); saveJSON(STORAGE_KEYS.libraryView, next).catch(() => {}); }, []);
  const [carousel, setCarousel] = useState(0);
  const [librarySort, setLibrarySort] = useState('updated');
  const [memberSearchOpen, setMemberSearchOpen] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const memberQuery = useMemo(() => memberLibraryQuery({ query: memberSearch, searchOpen: memberSearchOpen, sort: librarySort, filter }), [memberSearch, memberSearchOpen, librarySort, filter]);
  const returnDiaryId = useRef(null);
  const changeLibrarySort = useCallback(value => { returnDiaryId.current = null; setLibrarySort(value); }, []);
  const changeCarousel = useCallback(index => { returnDiaryId.current = null; setCarousel(index); }, []);
  const {
    diaries,
    setDiaries,
    addDiary,
    loaded,
    moveToTrash,
    moveManyToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
    trashNow,
    trashError,
    cleanupTrash,
  } = diaryState;
  // 보관함 관리 모드에서 고른 다이어리 id. null이면 관리 모드가 아니다.
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    if (!member || !loaded) return undefined;
    const timer = setTimeout(() => { diaryState.store.queryLibrary(memberQuery).catch(() => {}); }, 200);
    return () => clearTimeout(timer);
  }, [member, loaded, diaryState.store, memberQuery]);
  const memberLibraryMatches = member && JSON.stringify(memberQuery) === JSON.stringify(diaryState.library.criteria);
  const remoteQuery = useMemo(() => member ? { query: memberSearch, searchOpen: memberSearchOpen,
    onQueryChange: value => { setSelection(current => current === null ? null : []); setMemberSearch(value); setCarousel(0); },
    onSearchOpenChange: value => { setSelection(null); setMemberSearchOpen(value); if (!value) setMemberSearch(''); setCarousel(0); } } : null, [member, memberSearch, memberSearchOpen]);
  const [trashing, setTrashing] = useState(false);
  const trashingRef = useRef(false);
  const [active, setActive] = useState(null);
  useEffect(() => { if (signedIn && active?.id && !member && !sharing.runtime.server) sharing.runtime.registerDiary(active); }, [signedIn, active, sharing.runtime, member]);
  const sharedLibraryRef = useRef(sharing.library);
  sharedLibraryRef.current = sharing.library;
  const sharingMembers = (signedIn && sharing.diaries.find(value => value.id === (active?.sharedDiaryId || active?.id))?.members) || [];
  // 상단 바에 열어 둔 다이어리 탭 (id 순서대로). 다이어리를 열면 탭이 생기고, 탭을 눌러 오가며, 닫으면 옆 탭으로 간다.
  const [tabIds, setTabIds] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingCreateId = useRef(null);

  const frame = isPhone ? null : fitTabletFrame(viewport.width, viewport.height);
  // 폰 편집기에서 세로(간편)·가로(정밀) 전환 버튼으로 고른 방향. 편집기를 새로 열면 다시 기기 방향을 따른다.
  const [editorOrientation, setEditorOrientation] = useState(null);
  useOrientationLock(isPhone ? 'phone' : 'tablet', page === 'editor', editorOrientation);

  // 편집 문서·첫 속지·사진을 기기 저장소에서 미리 준비한 뒤 편집기로 넘어가 로딩 화면이 보이지 않게 한다.
  // 준비가 늦어져도 정해진 시간 안에는 넘어가고, 그사이 다른 다이어리를 고르면 마지막 요청을 연다.
  const opening = useRef(null);
  useEffect(() => () => { opening.current = null; }, []);
  const enterEditor = useCallback(async (diary) => {
    const request = {};
    opening.current = request;
    try {
      if (member) {
        const opened = await diaryState.store.open(diary.id);
        if (opening.current !== request) return;
        diary = opened.diary;
        rememberEditorDoc(editorDocKey(diary), opened.doc, { overwrite: false });
      }
      await Promise.race([prepareEditor(diary), wait(EDITOR_PREPARE_LIMIT_MS)]);
      if (opening.current !== request) return;
      opening.current = null;
      const current = diary.sharedDiaryId ? sharedLibraryRef.current.find(item => item.id === diary.id) : diary;
      if (!current) return;
      setEditorOrientation(null);
      setActive(current);
      setTabIds(current => current.includes(diary.id) ? current : [...current, diary.id]);
      setPage('editor');
    } catch (error) {
      if (opening.current !== request) return;
      opening.current = null;
      notify('다이어리를 열지 못했어요', error.message);
    }
  }, [member, diaryState.store]);
  const open = enterEditor;
  const openSharedDiary = useCallback((id) => {
    const diary = sharedLibraryRef.current.find(item => item.sharedDiaryId === id);
    if (!diary) return;
    if (invitationLeaveGuard.current && !invitationLeaveGuard.current()) return;
    setSharingRequest(null);
    enterEditor(diary);
  }, [enterEditor]);

  useEffect(() => {
    const ids = new Set(sharing.library.map(item => item.id));
    setTabIds(current => { const next = current.filter(id => !isSessionDocumentKey(id) || ids.has(id)); return next.length === current.length ? current : next; });
    if (!active?.sharedDiaryId) return;
    const current = sharing.library.find(item => item.id === active.id);
    if (current) setActive(current);
    else { opening.current = null; setActive(null); setPage(value => value === 'editor' ? 'library' : value); }
  }, [sharing.library, active?.id]);

  const favorite = useCallback((id) => {
    if (member) {
      diaryState.store.toggleFavorite(id).catch(error => {
        if (error.code !== 'STALE_ACCOUNT') notify('즐겨찾기를 저장하지 못했어요', error.message);
      });
      return;
    }
    const shared = sharedLibraryRef.current.find(item => item.id === id);
    if (shared) { sharing.runtime.toggleFavorite(shared.sharedDiaryId || shared.id); return; }
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, favorite: !diary.favorite } : diary)));
    setActive((current) => (current?.id === id ? { ...current, favorite: !current.favorite } : current));
  }, [member, diaryState.store, setDiaries, sharing.runtime]);

  const navigate = useCallback((next, nextFilter) => {
    if (member && next === 'trash') diaryState.store.loadTrash().catch(()=>{});
    const move = () => {
      setSelection(null);
      if (next === 'library') {
        setMemberSearchOpen(false); setMemberSearch('');
        setFilter(nextFilter || DEFAULT_FILTER);
        setCarousel(0);
      }
      setPage(next);
    };
    if (next !== 'profile' && profileLeaveGuard.current) profileLeaveGuard.current(move); else move();
  }, [member,diaryState.store]);

  // 모든 화면 규격의 Android 시스템 뒤로가기: 시트 → 보조 화면 → 기본 보관함 순서로 한 단계씩 돌아간다.
  // 편집기는 열린 도구·패널을 먼저 닫아야 하므로 EditorScreen에서 별도로 처리한다.
  useEffect(() => {
    if (Platform.OS !== 'android' || page === 'editor' || loginOverlayOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (studioBackHandler.current?.()) return true;
      if (profileBackHandler.current) {
        profileBackHandler.current();
        return true;
      }
      if (selection !== null) {
        if (!trashingRef.current) setSelection(null);
        return true;
      }
      if (createOpen) {
        if (savingRef.current) return true;
        setCreateOpen(false);
        setEditingDiaryId(null);
        return true;
      }
      if (!railCollapsed) {
        setRailCollapsed(true);
        return true;
      }
      if (page !== 'library' || filter !== DEFAULT_FILTER) {
        navigate('library', DEFAULT_FILTER);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [createOpen, filter, isPhone, navigate, page, railCollapsed, selection, loginOverlayOpen]);

  const create = useCallback(() => {
    if (savingRef.current) return;
    pendingCreateId.current = null;
    setEditingDiaryId(null);
    setCreateOpen(true);
  }, []);

  const edit = useCallback(async (diary) => {
    if (diary.canManage === false || savingRef.current) return;
    if (member) {
      savingRef.current = true;
      try {
        const current = await diaryState.store.refresh(diary.id);
        if (!current.canEdit) { notify('수정할 수 없어요', '소유자만 제목과 표지를 수정할 수 있어요.'); return; }
      } catch (error) { notify('다이어리를 확인하지 못했어요', error.message); return; }
      finally { savingRef.current = false; }
    }
    setEditingDiaryId(diary.id);
    setCreateOpen(true);
  }, [member, diaryState.store]);

  const moveDiaryToTrash = useCallback((diary) => {
    if (savingRef.current) return;
    if (!diary || diary.canManage === false) return;
    if(member) {
      confirmAction({title:'휴지통으로 옮길까요?',message:`“${diary.title}”는 삭제한 시각부터 30일 동안 복원할 수 있어요.`,confirmLabel:'휴지통으로',danger:false,onConfirm:async()=>{
        try {await moveToTrash(diary.id);setActive(current=>current?.id===diary.id?null:current);setTabIds(current=>current.filter(id=>id!==diary.id));setCreateOpen(false);setEditingDiaryId(null);}
        catch(error){notify('휴지통 변경을 확인하지 못했어요',error.message);}
      }});return;
    }

    confirmAction({
      title: '휴지통으로 옮길까요?',
      message: `“${diary.title}”는 휴지통에서 30일 동안 복원할 수 있으며 이후 영구 삭제돼요. 앱이 꺼져 있으면 다음 실행 시 정리해요.`,
      confirmLabel: '휴지통으로',
      danger: false, // 30일 안에 되돌릴 수 있어 위험색을 쓰지 않는다
      onConfirm: () => {
        moveToTrash(diary.id);
        setActive((current) => (current?.id === diary.id ? null : current));
        setTabIds((current) => current.filter((id) => id !== diary.id));
        setCreateOpen(false);
        setEditingDiaryId(null);
      },
    });
  }, [member,moveToTrash]);

  // 고른 다이어리를 한 번에 휴지통으로 옮긴다. 저장에 성공했을 때만 관리 모드를 끝내고, 실패하면 그대로 두고 알린다.
  const moveSelectedToTrash = useCallback((requestedIds) => {
    const ids = requestedIds.filter(id => diaries.some(diary => diary.id === id));
    if (savingRef.current || trashingRef.current || !ids.length) return;
    confirmAction({
      title: `${ids.length}개를 휴지통으로 옮길까요?`,
      message: member ? '선택한 다이어리를 각각 휴지통으로 옮겨요. 삭제 시각부터 30일 동안 복원할 수 있어요. 일부 항목을 처리하지 못하면 남은 결과를 따로 안내해요.' : '고른 다이어리는 휴지통에서 30일 동안 복원할 수 있으며 이후 영구 삭제돼요. 앱이 꺼져 있으면 다음 실행 시 정리해요.',
      confirmLabel: '휴지통으로',
      danger: false,
      onConfirm: async () => {
        if (trashingRef.current) return;
        trashingRef.current = true;
        setTrashing(true);
        try {
          const result = await moveManyToTrash(ids);
          if (!result) {
            notify('휴지통으로 옮기지 못했어요', '저장 공간과 권한을 확인한 뒤 다시 시도해 주세요. 다이어리는 그대로 남아 있어요.');
            return;
          }
          const moved = new Set(member ? result.succeeded : ids);
          setActive((current) => (current && moved.has(current.id) ? null : current));
          setTabIds((current) => current.filter((id) => !moved.has(id)));
          setSelection(member && result.failed.length ? result.failed.map(item => item.id) : null);
        } catch (error) {
          notify('휴지통으로 옮기지 못했어요', error.message);
        } finally {
          trashingRef.current = false;
          setTrashing(false);
        }
      },
    });
  }, [diaries, moveManyToTrash, member]);

  const save = async (form) => {
    if (savingRef.current) return;
    const title = form.title.trim();
    if (!title) return '다이어리 이름을 입력해 주세요.';

    const original = editingDiaryId ? diaries.find((diary) => diary.id === editingDiaryId) : null;
    if (editingDiaryId && !original) {
      return '수정할 다이어리를 찾지 못했어요. 목록에서 다시 시도해 주세요.';
    }

    if (member) {
      savingRef.current = true; setSaving(true);
      try {
        const diary = original ? await diaryState.store.update(original.id, form) : await diaryState.store.create(form);
        setActive(current => current?.id === diary.id ? diary : current);
        setCreateOpen(false); setEditingDiaryId(null);
        if (!original) { setCarousel(0); await enterEditor(diary); }
        return undefined;
      } catch (error) { return error.message; }
      finally { savingRef.current = false; setSaving(false); }
    }

    let config;
    if (!original) {
      try { config = normalizeTemplateConfig(form.templateConfig, form.pageSize); }
      catch (failure) { return failure.message; }
    }
    const updatedAt = new Date().toISOString();
    const paperAppearance = normalizePaperAppearance(form.paperAppearance);
    const diary = original
      ? { ...original, title, color: form.color, pattern: form.pattern, cover: form.cover, paperAppearance, updatedAt }
      : {
        id: pendingCreateId.current ?? createId(),
        createdAt: updatedAt,
        templateConfig: config,
        paperAppearance,
        title,
        color: form.color,
        pattern: form.pattern,
        cover: form.cover,
        pageSize: config.orientation,
        type: '개인',
        favorite: false,
        updatedAt,
        trashedAt: null,
      };
    if (!original) {
      pendingCreateId.current = diary.id;
      savingRef.current = true;
      setSaving(true);
      try {
        // PDF 로 만든 속지는 쪽마다 잠근 그림 한 장을 깐 페이지가 된다.
        const doc = withPdfPages(createDefaultDoc(diary), form.importedPages, config.orientation, paperAppearance);
        if (!await saveJSON(STORAGE_KEYS.doc + ':' + diary.id, doc)) throw new Error('다이어리를 저장하지 못했어요. 다시 시도해 주세요.');
        if (!await addDiary(diary)) throw new Error('보관함을 저장하지 못했어요. 다시 시도해 주세요.');
        rememberEditorDoc(STORAGE_KEYS.doc + ':' + diary.id, doc);
      } catch (failure) {
        return failure.message;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    // 수정에서 속지 스타일(종이 색 · 선 색 · 글꼴)을 바꾸면 새 페이지에 쓸 값을 바꾸고, '모든 페이지'면 이 다이어리에 이미 있는 페이지도 바꾼다. 다른 다이어리는 건드리지 않는다.
    if (original && JSON.stringify(normalizePaperAppearance(original.paperAppearance)) !== JSON.stringify(paperAppearance)) {
      savingRef.current = true;
      setSaving(true);
      try {
        const key = editorDocKey(original);
        const doc = await loadEditorDoc(original);
        if (doc?.pages?.length) {
          const next = { ...doc, paperAppearance, pages: form.appearanceScope === 'all' ? doc.pages.map(page => ({ ...page, paperAppearance })) : doc.pages };
          if (!await saveEditorDoc(key, next)) throw new Error('속지 스타일을 저장하지 못했어요. 다시 시도해 주세요.');
          rememberEditorDoc(key, next);
        }
      } catch (failure) {
        return failure.message;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    if (original) setDiaries((current) => current.map((item) => (item.id === diary.id ? diary : item)));
    setActive((current) => (current?.id === diary.id ? diary : current));
    setCreateOpen(false);
    setEditingDiaryId(null);
    if (!original) {
      setCarousel(0);
      // 새 문서는 위에서 이미 메모리에 올려 두었으므로 준비를 기다리지 않고 바로 편집기로 넘어간다
      opening.current = null;
      setEditorOrientation(null);
      setActive(diary);
      setTabIds((current) => (current.includes(diary.id) ? current : [...current, diary.id]));
      setPage('editor');
    }
    return undefined;
  };

  const changeFilter = useCallback((nextFilter) => {
    returnDiaryId.current = null;
    setFilter(nextFilter);
    setCarousel(0);
  }, []);

  const visibleDiaries = useMemo(() => {
    const sharedOwnedIds = new Set(sharing.diaries.filter(diary =>
      diary.members.some(member => member.id === sharing.runtime.self.id && member.role === 'OWNER') && diary.members.length > 1,
    ).map(diary => diary.id));
    return [...diaries.filter(diary => !diary.trashedAt).map(diary => ({ ...diary, isShared: member ? Boolean(diary.isShared) : sharedOwnedIds.has(diary.id) })), ...(member ? [] : sharing.library)];
  }, [diaries, sharing.diaries, sharing.library, member, sharing.runtime]);
  const libraryMetadata = useLibraryMetadata(visibleDiaries, page, member);
  // 서버는 정렬 기준마다 정해진 방향으로만 내려준다(서버 방향 지원 전까지의 임시 처리).
  // 사용자가 방향을 뒤집으면(예: title:desc) 목록을 뒤집어 보여주는데, 서버 목록은 페이지로 나뉘어 일부만 받은 채 뒤집으면 순서가 틀린다.
  // 그래서 뒤집을 때는 남은 페이지를 모두 불러온 뒤에만 보여준다(불러오는 동안은 빈 목록 + 불러오는 중 표시).
  const sortReversed = member && parseSort(librarySort).direction !== parseSort(parseSort(librarySort).key).direction;
  const fullLoadPending = Boolean(sortReversed && memberLibraryMatches && diaryState.library.hasNext);
  const libraryDiaries = useMemo(() => {
    if (!member) return visibleDiaries;
    const items = memberLibraryMatches ? diaryState.library.items : [];
    if (!sortReversed) return items;
    return fullLoadPending ? [] : [...items].reverse();
  }, [member, memberLibraryMatches, diaryState.library?.items, sortReversed, fullLoadPending, visibleDiaries]);
  const libraryReady = diaryState.library?.ready, libraryBusy = diaryState.library?.loading, libraryFailed = diaryState.library?.error, libraryCursor = diaryState.library?.nextCursor;
  useEffect(() => {
    // 한 페이지씩 이어서 불러온다. 오류가 나면 멈추고, 화면의 다시 시도 버튼이 재개한다.
    if (page === 'library' && fullLoadPending && libraryReady && !libraryBusy && !libraryFailed) diaryState.store.loadMoreLibrary().catch(() => {});
  }, [page, fullLoadPending, libraryReady, libraryBusy, libraryFailed, libraryCursor, diaryState.store]);
  useEffect(() => {
    if (page !== 'library' || !returnDiaryId.current) return;
    if (member && (!memberLibraryMatches || !diaryState.library.ready || diaryState.library.loading)) return;
    const ordered = member ? libraryDiaries : queryDiaries(visibleDiaries, { sort: librarySort, metadata: libraryMetadata });
    setCarousel(Math.max(0, ordered.findIndex(diary => diary.id === returnDiaryId.current)));
    if (member) returnDiaryId.current = null;
  }, [member, memberLibraryMatches, diaryState.library?.ready, diaryState.library?.loading, libraryDiaries, libraryMetadata, librarySort, page, visibleDiaries]);
  const trashedDiaries = useMemo(() => member ? diaryState.trash : diaries.filter((diary) => diary.trashedAt), [member,diaryState.trash,diaries]);

  // 열린 탭 (휴지통으로 간 다이어리는 뺀다)
  const tabs = useMemo(() => tabIds
    .map((id) => visibleDiaries.find((diary) => diary.id === id))
    .filter(Boolean)
    // 다이어리 목록의 표지 색 이름은 color (편집 문서에서는 coverColor). 그라데이션 · 사진 표지는 paint 가 표지에 보이는 색을 따라간다
    .map((diary) => ({ id: diary.id, title: diary.title, coverColor: diary.color, paint: coverTabPaint(diary) })), [tabIds, visibleDiaries]);

  // 편집하던 다이어리를 모든 다이어리 목록에서 찾아 홈의 중심 카드로 복원한다.
  const returnToLibrary = useCallback(() => {
    returnDiaryId.current = active?.id;
    const index = member ? 0 : queryDiaries(visibleDiaries, { sort: librarySort, metadata: libraryMetadata }).findIndex(diary => diary.id === active?.id);
    setFilter(DEFAULT_FILTER);
    setMemberSearchOpen(false); setMemberSearch('');
    setCarousel(Math.max(0, index));
    setPage('library');
  }, [active?.id, member, libraryMetadata, librarySort, visibleDiaries]);

  const selectTab = useCallback((id) => {
    if (id === active?.id) return;
    const diary = visibleDiaries.find((item) => item.id === id);
    if (diary) enterEditor(diary);
  }, [active?.id, enterEditor, visibleDiaries]);
  // 탭 닫기: 지금 보던 탭을 닫으면 오른쪽(없으면 왼쪽) 탭으로, 남은 탭이 없으면 보관함으로 간다.
  const closeTab = useCallback((id) => {
    const index = tabIds.indexOf(id);
    const rest = tabIds.filter((tabId) => tabId !== id);
    setTabIds(rest);
    if (id !== active?.id) return;
    const nextId = rest[Math.min(index, rest.length - 1)];
    const next = nextId && visibleDiaries.find((item) => item.id === nextId);
    if (next) enterEditor(next);
    else returnToLibrary();
  }, [active?.id, enterEditor, returnToLibrary, tabIds, visibleDiaries]);

  // 홈에 있는 동안 앞쪽 다이어리의 문서와 첫 속지를 차례로 미리 읽어 둔다. (사진은 열 때 준비)
  // 즐겨찾기 등 목록 내용만 바뀔 때는 다시 돌지 않도록 대상 다이어리 ID가 바뀔 때만 실행한다.
  const prefetchTargets = useMemo(() => visibleDiaries.slice(0, PREFETCH_DIARIES), [visibleDiaries]);
  const prefetchKey = prefetchTargets.map((diary) => diary.id).join(',');
  const prefetchRef = useRef(prefetchTargets);
  prefetchRef.current = prefetchTargets;
  useEffect(() => { if (loaded) onReady?.(); }, [loaded, onReady]);
  useEffect(() => {
    if (!loaded || page !== 'library') return undefined;
    let cancelled = false;
    const timer = setTimeout(() => { prefetchEditors(prefetchRef.current, { isCancelled: () => cancelled }).catch(() => {}); }, PREFETCH_DELAY_MS);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [loaded, page, prefetchKey]);

  const libraryScreen = useMemo(() => (
    <LibraryScreen
      compact={isPhone}
      portrait={tabletPortrait}
      diaries={libraryDiaries}
      metadata={libraryMetadata}
      sort={librarySort}
      onSortChange={changeLibrarySort}
      filter={filter}
      view={view}
      carousel={carousel}
      onFilterChange={changeFilter}
      onViewChange={changeView}
      onCarouselChange={changeCarousel}
      onOpen={open}
      onFavorite={favorite}
      onEdit={edit}
      onDelete={moveDiaryToTrash}
      onShare={shareDiary}
      onCreate={create}
      railWidthRef={isPhone ? null : railWidthRef}
      selection={selection}
      onSelectionChange={setSelection}
      onTrashSelected={moveSelectedToTrash}
      trashing={trashing || (member && Boolean(diaryState.bulkTrash?.busy))}
      remoteQuery={remoteQuery}
      historyKey={member ? diaryState.store.keys.searchHistory : undefined}
      hasMore={member && memberLibraryMatches && diaryState.library.hasNext}
      requestNotice={member ? <><MemberLibraryNotice library={diaryState.library} pending={!memberLibraryMatches} bulk={diaryState.bulkTrash}
        onRetry={()=>diaryState.store.retryLibrary().catch(()=>{})} onMore={()=>diaryState.store.loadMoreLibrary().catch(()=>{})}
        onDismissBulk={()=>diaryState.store.dismissBulkTrash()} onRetryBulk={async()=>{
          try { const result=await diaryState.store.retryBulkTrash(); const moved=new Set(result.succeeded);
            setActive(current=>current&&moved.has(current.id)?null:current);setTabIds(current=>current.filter(id=>!moved.has(id)));
            setSelection(result.failed.length?result.failed.map(item=>item.id):null);
          } catch(error) {notify('선택 작업을 확인하지 못했어요',error.message);}
        }}/><MemberTrashNotice state={diaryState} onReload={()=>diaryState.store.loadTrash().catch(()=>{})} onRetry={()=>diaryState.store.retryLifecycle().catch(()=>{})}/><MemberRequestNotice pending={diaryState.pending} error={diaryState.error} busy={saving} refreshing={diaryState.refreshing}
        onReload={() => diaryState.store.load().catch(() => {})}
        onArchiveExpired={() => confirmAction({title:'이전 생성 요청을 정리할까요?',message:'서버 목록을 다시 확인한 뒤 새 생성을 허용해요. 이미 생성된 다이어리는 삭제하지 않고 이전 요청은 이 계정의 기록에 보관해요.',confirmLabel:'요청 정리',onConfirm:async()=>{
          if(savingRef.current) return; savingRef.current=true;setSaving(true);
          try {await diaryState.store.archiveExpiredCreation();} catch(error) {notify('요청을 정리하지 못했어요',error.message);} finally {savingRef.current=false;setSaving(false);}
        }})}
        onRetry={async () => {
          if (savingRef.current) return;
          savingRef.current = true; setSaving(true);
          try { const d = await diaryState.retryCreation(); setCreateOpen(false); await enterEditor(d); }
          catch (error) { notify('이전 생성을 확인하지 못했어요', error.message); }
          finally { savingRef.current = false; setSaving(false); }
        }} /></> : null}
      suppressEmpty={member && Boolean(fullLoadPending || !memberLibraryMatches || diaryState.library.loading || diaryState.library.error || diaryState.error || diaryState.refreshing)}
    />
  ), [carousel, changeCarousel, changeFilter, changeView, changeLibrarySort, create, edit, favorite, filter, isPhone, tabletPortrait,libraryMetadata, librarySort, moveDiaryToTrash, moveSelectedToTrash, open, selection, trashing, view, libraryDiaries, member, memberLibraryMatches, remoteQuery, diaryState.library, diaryState.bulkTrash, diaryState.pending, diaryState.error, diaryState.refreshing, diaryState.lifecycle, diaryState.trashLoading, diaryState.trashError, diaryState.store, saving, enterEditor]);

  // 보관함(libraryScreen)처럼 요소를 memo 해 둔다. 사이드 메뉴를 여닫느라 App 이 다시 그려져도 휴지통 목록은 다시 그리지 않는다.
  const trashScreen = useMemo(() => (
    <TrashScreen
      serverMode={member}
      busy={member && Boolean(diaryState.lifecycle?.busy || diaryState.bulkTrash?.busy)}
      suppressEmpty={member && Boolean(diaryState.trashLoading || diaryState.trashError)}
      requestNotice={member?<MemberTrashNotice state={diaryState} onReload={()=>diaryState.store.loadTrash().catch(()=>{})} onRetry={()=>diaryState.store.retryLifecycle().catch(()=>{})}/>:null}
      compact={isPhone}
      portrait={tabletPortrait}
      diaries={trashedDiaries}
      now={trashNow}
      cleanupError={trashError}
      onRetryCleanup={cleanupTrash}
      onRestore={(id) => {
        if(member){restoreFromTrash(id).catch(error=>notify('복원을 확인하지 못했어요',error.message));return;}
        if (!restoreFromTrash(id)) notify('복원할 수 없어요', '보관 기한이 지났거나 영구 삭제 중인 다이어리예요.');
      }}
      // 선택 모드의 묶음 작업. 하나씩 차례로 처리하고(서버 작업은 동시에 하나만 가능) 못 한 것만 모아 알린다.
      onRestoreMany={async (ids) => {
        let failed = 0;
        for (const id of ids) {
          // 로컬은 false 가 실패, 서버(회원)는 거부(reject)가 실패다. 서버가 돌려주는 값은 성공 여부가 아니다.
          try { const result = await restoreFromTrash(id); if (!member && !result) failed += 1; } catch { failed += 1; }
        }
        if (failed) notify('복원하지 못한 다이어리가 있어요', `${failed}개를 복원하지 못했어요. 보관 기한이 지났거나 영구 삭제 중일 수 있어요.`);
      }}
      // 확인창에서 취소하면 고른 것을 그대로 두고, 지우기로 하면 선택을 끝낸다
      onDeleteMany={(items, onConfirmed) => {
        confirmAction({
          title: '영구 삭제할까요?',
          message: member ? `선택한 ${items.length}개의 다이어리와 페이지는 복구할 수 없어요. 보관함의 공용 미디어 원본은 유지돼요.` : `선택한 ${items.length}개의 페이지와 로컬 기록은 복구할 수 없어요.`,
          confirmLabel: '영구 삭제',
          onConfirm: async () => {
            onConfirmed?.();
            let failed = 0;
            for (const item of items) {
              try { if (!await deletePermanently(item.id)) failed += 1; } catch { failed += 1; }
            }
            if (failed) notify('삭제하지 못한 다이어리가 있어요', `${failed}개를 삭제하지 못했어요. 저장소를 확인한 뒤 다시 시도해 주세요.`);
          },
        });
      }}
      onDeletePermanently={(diary) => {
        confirmAction({
          title: '영구 삭제할까요?',
          message: member ? `“${diary.title}”의 다이어리와 페이지는 복구할 수 없어요. 보관함의 공용 미디어 원본은 유지돼요.` : `“${diary.title}”의 페이지와 로컬 기록은 복구할 수 없어요.`,
          confirmLabel: '영구 삭제',
          onConfirm: async () => {
            try { if (!await deletePermanently(diary.id)) notify('삭제하지 못했어요', '저장소를 확인한 뒤 다시 시도해 주세요.'); } catch(error) { notify('영구 삭제를 확인하지 못했어요',error.message); }
          },
        });
      }}
    />
  ), [member, diaryState.lifecycle, diaryState.bulkTrash, diaryState.trashLoading, diaryState.trashError, diaryState.store, isPhone, tabletPortrait, trashedDiaries, trashNow, trashError, cleanupTrash, restoreFromTrash, deletePermanently]);

  // 저장된 목록을 읽기 전에는 빈 보관함 안내가 깜빡이지 않게 비워 둔다.
  let content = loaded ? libraryScreen : null;
  if (page === 'editor') {
    content = (
      <EditorScreen
        key={active?.id || 'new'}
        backDisabled={loginOverlayOpen}
        diary={active}
        compact={isPhone}
        landscape={isLandscape}
        bottomInset={insets.bottom}
        onToggleOrientation={isPhone && CAN_LOCK_ORIENTATION ? () => setEditorOrientation(isLandscape ? 'portrait' : 'landscape') : undefined}
        onHome={returnToLibrary}
        registerInvitationLeaveGuard={registerInvitationLeaveGuard}
        onOpenSharing={() => shareDiary(active)}
        readOnly={member && active?.permissions?.canEditCanvas !== true}
        invitationCount={unreadInvites}
        sharingMembers={sharingMembers}
        onRenameDiary={async title => {
          if (!active?.id) return false;
          try {
            const updated = await renameDiary(active.id, title);
            setActive(current => current?.id === active.id ? { ...current, ...(updated || {}), title } : current);
            return true;
          } catch (error) { notify('이름을 바꾸지 못했어요', error.message); return false; }
        }}
        tabs={tabs}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
      />
    );
  } else if (page === 'trash') {
    content = trashScreen;
  } else if (page === 'studio') {
    content = <DecorationStudioScreen compact={isPhone} registerBackHandler={registerStudioBackHandler} />;
  } else if (page === 'profile') {
    content = <ProfileScreen key="profile" compact={isPhone} diaries={visibleDiaries} previewUser={previewUser} onEndPreview={onEndPreview} onClearSession={onClearSession} onUpdatePreview={onUpdatePreview} registerLeaveGuard={registerProfileLeaveGuard}
      onOpenSettings={createProfileSettingsNavigation(isPhone, navigate)}
      accountService={previewUser?.mode === 'authenticated' ? authService : undefined}
      getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined} />;
  } else if (page === 'settings') {
    content = <ProfileScreen key="settings" section="settings" compact={isPhone} previewUser={previewUser} onEndPreview={onEndPreview} onClearSession={onClearSession} onUpdatePreview={onUpdatePreview}
      accountService={previewUser?.mode === 'authenticated' ? authService : undefined}
      getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined} />;
  }

  // 새 다이어리를 만든 뒤 나의 표지 · 속지 저장만 실패하면, 작업대가 닫힌 뒤(편집기로 들어간 뒤) 알약으로 알리고 다시 시도하게 한다.
  // 다시 시도해 성공하면 완료 알약을 2초 띄운다.
  const [libraryNotice, setLibraryNotice] = useState(null);
  const libraryTarget = kinds => kinds.length > 1 ? '표지와 속지를 나의 표지 · 속지에' : kinds[0] === 'cover' ? '표지를 나의 표지에' : '속지를 나의 속지에';
  const showLibraryFailure = ({ kinds, retry }) => setLibraryNotice({ key: createId(), kinds, retry, busy: false });
  const retryLibrarySave = async () => {
    const notice = libraryNotice;
    if (!notice?.retry || notice.busy) return;
    setLibraryNotice({ ...notice, busy: true });
    // retry(kinds) 는 그중 또 실패한 것만 돌려준다
    const left = await notice.retry(notice.kinds).catch(() => notice.kinds);
    setLibraryNotice(left.length
      ? { key: createId(), kinds: left, retry: notice.retry, busy: false }
      : { key: createId(), done: libraryTarget(notice.kinds) });
  };
  useEffect(() => {
    if (!libraryNotice || libraryNotice.busy) return undefined;
    const timer = setTimeout(() => setLibraryNotice(null), libraryNotice.done ? 2000 : ACTION_TOAST_MS);
    return () => clearTimeout(timer);
  }, [libraryNotice]);
  const libraryToast = libraryNotice && (
    <ActionToast key={libraryNotice.key} compact={isPhone}
      bottom={(page === 'editor' ? 112 : isPhone ? 76 : 96) + insets.bottom}
      message={libraryNotice.done ? `${libraryNotice.done} 추가했어요.` : `${libraryTarget(libraryNotice.kinds)} 추가하지 못했어요.`}
      actionLabel={libraryNotice.done ? undefined : '다시 시도'} busy={libraryNotice.busy} onAction={retryLibrarySave} />
  );

  const createModal = createOpen && (
    <DiaryCreateModal
      key={editingDiaryId ?? 'new'}
      blankOnly={member && !editingDiaryId}
      sheet={isPhone}
      bottomInset={insets.bottom}
      diary={editingDiaryId ? diaries.find(item => item.id === editingDiaryId) : null}
      saving={saving}
      onSubmit={save}
      onLibrarySaveFailed={showLibraryFailure}
      onCancel={() => { if (savingRef.current) return; setCreateOpen(false); setEditingDiaryId(null); }}
    />
  );

  // 다이어리 홈(태블릿)은 단색 책상 바탕 위에 놓인다. 폰은 셸 바탕 그대로다.
  const desk = page === 'library' && loaded && !isPhone;
  const phoneSurface = page === 'library' ? C.canvas : C.white;
  let shell;
  if (page === 'editor') {
    shell = content;
  } else if (isPhone) {
    // 폰: 화면 전환은 하단 네비게이션 바가 맡는다. 좌측 오버레이 메뉴는 태블릿 이상에서만 쓴다.
    shell = (
      <View style={s.phoneShell}>
        <View style={[s.phoneNavigationHeader, { backgroundColor: phoneSurface }]}>
          <SharingEntry notifications notificationCount={authenticatedNotifications?.count}
            notificationLabel={authenticatedNotifications ? '알림' : '받은 초대'} compact
            count={unreadInvites} onPress={openInvitations} />
        </View>
        <View style={s.workspace}>
          {content}
        </View>
        <BottomTabs
          page={page}
          filter={filter}
          navigate={navigate}
          bottomInset={insets.bottom}
          backgroundColor={phoneSurface}
        />
        {createModal}
      </View>
    );
  } else {
    shell = (
      <View style={s.shell}>
        <SideRail
          onNotifications={openInvitations}
          notificationLabel={authenticatedNotifications ? '알림' : '받은 초대'}
          notificationCount={authenticatedNotifications?.count}
          invitationCount={unreadInvites}
          page={page}
          filter={filter}
          navigate={navigate}
          bottomInset={insets.bottom}
          user={previewUser}
          getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined}
          collapsed={railCollapsed}          onToggle={() => setRailCollapsed((current) => !current)}
        />
        <View style={[s.workspace, { paddingBottom: insets.bottom }, desk && { backgroundColor: DESK_COLOR }]}>
          {content}
            {createModal}
        </View>
      </View>
    );
  }

  // 위: 폰 편집기 세로는 흰 상단 바, 그 밖은 보관함 바탕. 왼쪽: 편집기 밖은 좌측 바와 같은 바탕(C.canvas). 오른쪽: 보관함·편집기 바탕.
  const safeAreaColors = {
    top: page === 'editor' && !isLandscape ? C.white : desk ? DESK_COLOR : C.canvas,
    left: page !== 'editor' ? C.canvas : desk ? DESK_COLOR : C.canvas,
    right: desk ? DESK_COLOR : C.canvas,
  };

  const measureViewport = ({ nativeEvent: { layout } }) => {
    const { width: nextWidth, height: nextHeight } = layout;
    setViewport((current) => (
      current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }
    ));
  };

  return (
    <>
      {authenticatedNotifications && (sharingRequest?.mode === 'notifications' || sharingRequest?.returnToNotifications)
        ? <HomeNotificationFlow request={sharingRequest} model={authenticatedNotifications} sharing={sharing} onRequest={setSharingRequest}
            onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }}
            onOpenDiary={openSharedDiary} onOpenCopy={diary => openCopyIfSafe(diary, invitationLeaveGuard.current, () => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }, enterEditor)} />
        : <SharingHub onOpenCopy={diary => openCopyIfSafe(diary, invitationLeaveGuard.current, () => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }, enterEditor)} onOpenDiary={openSharedDiary} request={sharingRequest} runtime={sharing.runtime} model={sharing.notifications} onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }} />}
      {/* 폰 세로 화면은 노치·다이내믹 아일랜드 아래부터 그린다. 안전 영역은 바로 옆(아래) 화면과 같은 색으로 칠해 경계가 보이지 않게 한다. */}
      <View style={s.safe}>
        {isPhone && insets.top > 0 && (page === 'editor'
          ? <View style={{ height: insets.top, backgroundColor: safeAreaColors.top }} />
          : <View style={{ height: insets.top, backgroundColor: phoneSurface }} />)}
        <View style={s.safeRow}>
          {insets.left > 0 && <View style={{ width: insets.left, backgroundColor: safeAreaColors.left }} />}
          <View style={s.viewport} onLayout={measureViewport}>
            <View style={[s.app, frame ? { width: frame.width, height: frame.height } : s.appFill]}>
              {shell}
            </View>
          </View>
          {insets.right > 0 && <View style={{ width: insets.right, backgroundColor: safeAreaColors.right }} />}
        </View>
      </View>
      {libraryToast}
      {appLocked === null && <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: C.white }]} />}
      {appLocked && <PinScreen mode="unlock" user={previewUser} getProfilePhotoSource={previewUser.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined}
        check={value => checkAppLockStatus(lockScope, value)} onDone={() => setAppLocked(false)} onForgot={forgotAppLock} />}
      {member && signedIn && <GuestImportHost key={`${previewUser.userId}:${authService.getSessionKey()}`} accountId={String(previewUser.userId)} enabled={appLocked === false} onImported={() => diaryState.store.reload().catch(() => {})} />}
      <DialogHost />
    </>
  );
}
