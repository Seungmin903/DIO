import { openCopyIfSafe } from './src/notifications/editorInvitationGuard';
import { describeSharingInvitations } from './src/notifications/describeSharingInvitations';
import MemberTrashNotice from './src/diary/components/MemberTrashNotice';
import MemberLibraryNotice from './src/diary/components/MemberLibraryNotice';
import { memberLibraryQuery } from './src/diary/services/memberLibraryQuery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Linking, Platform, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import PinScreen from './src/diary/components/PinScreen';
import { appLockGraceOver, appLockScope, checkAppLockStatus, clearAppLock, readAppLockState, setAppLock } from './src/shared/appLock';
import AppLockReauth from './src/diary/components/AppLockReauth';
import { appLockRecoveryAction } from './src/diary/components/appLockRecovery';
import { SafeAreaProvider, initialWindowMetrics, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import documentStorage from './src/editor/services/documentStorage';
import EditorScreen from './src/editor/screens/EditorScreen';
import { editorDocKey, loadEditorDoc, prefetchEditors, prepareEditor, rememberEditorDoc, saveEditorDoc } from './src/editor/services/editorDocs';
import AuthScreen from './src/auth/AuthScreen';
import SessionRestoreScreen from './src/auth/SessionRestoreScreen';
import { apiConfigurationError, authService } from './src/auth/authService';
import ApiConfigurationErrorScreen from './src/shared/ApiConfigurationErrorScreen';
import { guestProfile } from './src/auth/guestProfileDevice';
import { LoginGateProvider, useLoginGate } from './src/auth/loginGate';
import { useSharing } from './src/sharing/useSharing';
import { isSharingDiaryId } from './src/sharing/sharingApi';
import SharingHub from './src/sharing/SharingHub';
import EditorModal from './src/editor/components/controls/EditorModal';
import SafetyProvider, { useSafety } from './src/safety/SafetyProvider';
import { createSharingGate } from './src/sharing/sharingGate';
import { AuthenticatedNotificationProvider, useOptionalSharedNotifications } from './src/notifications/NotificationProvider';
import HomeNotificationFlow from './src/notifications/HomeNotificationFlow';
import { subscribeMemberInviteLinks } from './src/sharing/memberInviteLink';
import { isSessionDocumentKey } from './src/editor/services/sessionDocuments.js';
import { startPushRuntime } from './src/notifications/pushRuntime';
import { C, DEFAULT_FILTER } from './src/diary/constants';
import { useDiaries } from './src/diary/hooks/useDiaries';
import { useMemberDiaries } from './src/diary/hooks/useMemberDiaries';
import MemberRequestNotice from './src/diary/components/MemberRequestNotice';
import { LoadingSpot } from './src/diary/components/EmptyState';
import DioButton from './src/shared/DioButton';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import { withPdfPages } from './src/diary/utils/pdfImport';
import { coverTabPaint } from './src/diary/utils/coverDesign';
import SideRail, { RAIL_WIDTH } from './src/diary/components/SideRail';
import BottomTabs from './src/diary/components/BottomTabs';
import { backTarget, createRouteMemory } from './src/diary/utils/routeMemory';
import { PhoneBellProvider } from './src/diary/components/PhoneBell';
import { normalizePageForFormFactor } from './src/diary/components/profileNavigationModel';
import SharingEntry from './src/sharing/SharingEntry';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ConnectedDiaryLibrary from './src/diary/screens/ConnectedDiaryLibrary';
import MockLibraryApp from './src/diary/screens/MockLibraryApp';
import { clearMockLibrary } from './src/diary/services/legacyMockCleanup';
import { useLibraryMetadata } from './src/diary/hooks/useLibraryMetadata';
import { parseSort, queryDiaries, sortMovedByCreated } from './src/diary/utils/libraryQuery';
import { savedLibraryView } from './src/diary/utils/libraryView';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import ProfileCropHost from './src/auth/ProfileCropHost';
import DecorationStudioScreen from './src/diary/screens/DecorationStudioScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { GuestImportHost } from './src/diary/components/GuestImportDialog';
import { StickerLibrarySyncHost } from './src/diary/components/StickerLibrarySyncHost';
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
import { createPushIssueMemory, pushIssueOf } from './src/notifications/pushIssue';
// 기기 알림 연결 문제 팝업을 띄운 마지막 상태(pushIssue.signature)의 기기 기록 키
const PUSH_ISSUE_NOTIFIED_KEY = 'dio-push-issue-notified-v1';
import { randomUUID } from 'expo-crypto';
import { createId, setUuidGenerator } from './src/editor/utils/common';
import HandwritingStudio from './src/handwriting/HandwritingStudio';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import BootSplash, { SPLASH } from './src/shared/BootSplash';
import { createAfterIntroGate } from './src/shared/bootIntro';
import { PRETENDARD_FILES } from './src/shared/pretendardFiles';
import { preloadTextFonts } from './src/editor/services/textFonts';
import { loadRemoteCatalog } from './src/shared/remoteAssets/remoteCatalogService';
import ActionToast, { ACTION_TOAST_MS } from './src/shared/ActionToast';
import { BULK_TRASH_DONE_MS, bulkTrashNeedsLogin, bulkTrashToastMessage } from './src/diary/utils/bulkTrashToast';

// 텍스트 글꼴은 쓰일 때 불러온다(textFonts.js). 앱이 켜진 뒤 잠잠해지면 기본 글꼴과 내 폰트 목록만 먼저 준비한다.
preloadTextFonts();
// 앱 배포 없이 추가한 글꼴 · 스티커 목록(에셋 저장소의 catalog.json). 저장본을 먼저 쓰고 새 목록을 받는다. 실패해도 앱에는 영향이 없다.
loadRemoteCatalog();

// 네이티브에는 전역 crypto가 없어 다이어리·페이지·요소 UUID를 expo-crypto로 만든다.
if (Platform.OS !== 'web') setUuidGenerator(randomUUID);

// 속지 캐시(16개)를 넘지 않도록 앞쪽 다이어리만 미리 준비한다.
const PREFETCH_DIARIES = 8;
const PREFETCH_DELAY_MS = 400;
// 편집기 진입 전 준비를 기다리는 최대 시간. 보통은 이보다 훨씬 빨리 끝난다.
const EDITOR_PREPARE_LIMIT_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// 시작 애니메이션이 끝나면 앱 화면으로 전환한다. 세션 준비가 남으면 아래 준비 안내를 표시한다.
// JS 시작 화면의 이미지가 준비되면 네이티브 시작 화면을 내린다
// (안드로이드는 네이티브 시작 화면에 로고 없이 바탕색만 둔다: plugins/withSplashWindowBackground.js).
// 무엇이 실패해도 로고에 갇히지 않도록 SPLASH_LIMIT_MS 뒤에는 내린다.
const SPLASH_LIMIT_MS = 8000;
const DOCUMENT_MIGRATION_DELAY_MS = 3000;
// 개발 빌드의 목업 화면(EXPO_PUBLIC_DIARY_SOURCE): mock = 연결 검증 보관함, mock-library = 보관함 · 알림 모의, mock-sharing = 공유 모의
const MOCK_SCREENS = ['mock', 'mock-library', 'mock-sharing', 'mock-safety'];
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
  // 예전 저장소에 남은 다이어리 문서를 페이지별 파일로 옮기는 일은 첫 화면과 인트로 손글씨(JS 스레드)를 피해서 시작한다:
  // 켜고 DOCUMENT_MIGRATION_DELAY_MS 가 지나고 + 손글씨가 끝났거나 시작 화면이 닫힌 뒤, 한 번만.
  const migrationGate = useRef(null);
  if (!migrationGate.current) migrationGate.current = createAfterIntroGate(() => { documentStorage.migrateLegacyDocuments().catch(() => {}) });
  const introWritten = useCallback(() => migrationGate.current.introDone(), []);
  const finishBoot = useCallback(() => { setBooting(false); hideSplash(); migrationGate.current.introDone(); }, []);
  // 로그인이 필요한 기능에서 연 로그인 화면 { feature, action }. 지금 화면 위에 겹쳐 띄워, 닫아도 보던 화면이 그대로 남는다.
  const [loginRequest, setLoginRequest] = useState(null);
  const [restoreState, setRestoreState] = useState({ status: 'loading', error: null });
  // failed: 마지막 복원 실패. 복구 화면에서 다시 시도해 저장 로그인이 없다고 나와도 이 실패를 유지한다(S15P31F106-718)
  const restoration = useRef({ active: false, busy: false, job: 0, failed: null });
  const openLogin = request => setLoginRequest(current => current?.sessionExpired
    ? { ...request, sessionExpired: true } : request);
  const closeLogin = () => {
    setLoginRequest(null);
    setMailInvitation(null);
    const current = sessionRef.current;
    if (current?.mode === 'authenticated' && !authService.getSessionKey() &&
        authService.getMemberSessionKey(current.userId) === memberSessionKey) startGuest();
  };
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
  const restoreLogin = async () => {
    const control = restoration.current;
    if (!control.active || control.busy) return;
    control.busy = true;
    const job = ++control.job;
    const current = () => control.active && control.job === job;
    setRestoreState(previous => ({ ...previous, status: 'loading' }));
    try {
      const restored = await authService.restoreSession();
      if (!current()) return;
      if (restored) setPreviewSession(restored);
      // 저장된 로그인이 없을 때만 자동으로 게스트가 된다. 단, 복구 화면에서 다시 시도한 경우는 예외다:
      // 만료 처리가 저장 토큰을 지운 뒤의 재시도는 회원 다이어리가 사라진 것처럼 보이므로 앞선 실패(만료) 안내를 유지하고,
      // 게스트 전환은 '게스트로 계속'을 골랐을 때만 한다(S15P31F106-718).
      else if (control.failed) { setRestoreState({ status: 'error', error: control.failed }); return; }
      else await startGuest();
      control.failed = null;
      if (current()) setRestoreState({ status: 'done', error: null });
    } catch (error) {
      if (!current()) return;
      control.failed = error;
      setRestoreState({ status: 'error', error });
      if (__DEV__ && error?.code === 'DEVELOPMENT_ACCESS_REQUIRED') setLoginRequest({ restoreSession: true });
      else if (error?.status === 401 && error.code === 'INVALID_TOKEN') setLoginRequest({ sessionExpired: true });
    } finally { if (current()) control.busy = false; }
  };
  const continueAsGuest = async () => {
    const control = restoration.current;
    if (control.busy) return;
    control.busy = true;
    const job = ++control.job;
    setRestoreState(previous => ({ ...previous, status: 'guest' }));
    try {
      await startGuest();
      if (control.active && control.job === job) setRestoreState({ status: 'done', error: null });
    } finally { if (control.job === job) control.busy = false; }
  };
  useEffect(() => {
    if (apiConfigurationError || mockSource) return;
    const control = restoration.current;
    control.active = true;
    restoreLogin();
    return () => { control.active = false; control.job++; control.busy = false; };
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
  // 회원 탈퇴를 마치면 게스트 홈으로 돌아가며 보관함이 통째로 바뀌므로, 완료 토스트는 바뀌지 않는 앱 맨 위에서 띄운다(지라 670)
  const [accountToast, setAccountToast] = useState(null);
  const withdrawSession = () => { clearSession(); setAccountToast({ key: Date.now(), message: '회원 탈퇴가 완료됐어요.' }); };
  const endSession = async () => {
    try {
      if (authenticatedSession) await authService.logout();
    } catch (error) {
      const localMessage = error.code === 'LOGOUT_INCOMPLETE' ? error.message : `${error.message} 이 기기의 로그인 정보는 지웠어요.`;
      notify('로그아웃', `${localMessage} 서버에서 로그아웃을 확인하지 못해 이 계정의 알림이 계속 올 수 있어요. 네트워크 연결 후 다시 로그인하고 로그아웃해 주세요.`);
    }
    finally { clearSession(); }
  };
  const [mailInvitation, setMailInvitation] = useState(null);
  useEffect(() => {
    if (Platform.OS === 'web' || apiConfigurationError || mockSource) return;
    return subscribeMemberInviteLinks(
      Linking,
      inviteId => setMailInvitation({ inviteId }),
      link => setMailInvitation({ link }),
    );
  }, [apiConfigurationError, mockSource]);
  useEffect(() => {
    if (mailInvitation && !authenticatedSession && !loginRequest && !booting
        && ['done', 'error'].includes(restoreState.status)) setLoginRequest({});
  }, [mailInvitation, authenticatedSession, loginRequest, booting, restoreState.status]);
  const switchInvitationAccount = async inviteId => {
    await endSession();
    setLoginRequest({});
    setMailInvitation(current => current ?? { inviteId });
  };
  const consumeMailInvitation = useCallback(request => {
    setMailInvitation(current => current === request ? null : current);
  }, []);
  // 로그인하면 게스트 보관함(LocalDiaryApp)이 회원 보관함(MemberDiaryApp)으로 통째로 바뀐다. 누른 기능(loginRequest.action)은
  // 사라진 게스트 화면의 것이라 실행하지 않는다. 게스트가 기기에 만든 다이어리는 회원 보관함에서 옮길지 묻고 옮긴다(GuestImportHost, 다 옮긴 원본은 기기에서 지운다).
  const continueFromLogin = session => { restoration.current.job++; restoration.current.busy = false; setRestoreState({ status: 'done', error: null }); setLoginRequest(null); startSession(session).catch(() => setPreviewSession(session)); };
  // 지난 실행에서 공유하고 남은 PDF 임시 파일을 정리한다. (공유 모듈은 불러오지 않는다)
  useEffect(() => { cleanupPdfShareCache().catch(() => {}) }, []);
  // 예전 문서 옮기기: 시간 조건(위 migrationGate 참고)
  useEffect(() => {
    const timer = setTimeout(() => migrationGate.current.due(), DOCUMENT_MIGRATION_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  useHiddenNavigationBar();
  useEffect(() => { const timer = setTimeout(finishBoot, SPLASH_LIMIT_MS); return () => clearTimeout(timer); }, [finishBoot]);
  // BootSplash 이미지 로드 완료(실패 포함) 뒤 네이티브 시작 화면을 내린다.
  // 이미지가 응답하지 않는 경우에도 기존 8초 제한으로 앱 진입을 보장한다.
  // 개발용 목업 화면은 보관함 로딩을 거치지 않으니 글꼴만 준비되면 내린다
  useEffect(() => { if ((fontsLoaded || fontError) && mockSource) finishBoot(); }, [fontsLoaded, fontError, finishBoot]); // eslint-disable-line react-hooks/exhaustive-deps
  // API 설정 오류도 앱이 그린 안내 화면이므로 네이티브 시작 화면을 즉시 내린다.
  useEffect(() => { if (apiConfigurationError && (fontsLoaded || fontError)) finishBoot(); }, [apiConfigurationError, fontsLoaded, fontError, finishBoot]);
  const SessionDiaryApp = authenticatedSession ? MemberDiaryApp : LocalDiaryApp;
  const restoreFailed = !previewSession && !mockSource && Boolean(restoreState.error);
  // 글꼴 로딩이 멈춰도 8초 제한 뒤에는 기본 글꼴로 앱을 표시한다.
  // 글꼴을 기다리는 동안에도 시작 화면 바탕을 깐다. null 이면 네이티브 시작 화면과 인트로 사이에 창의 흰 바탕이 비친다
  // (실기기: 갤럭시 S20 0.12초 · 탭 SM-X510 0.4초 흰 화면)
  if (!fontsLoaded && !fontError && booting) {
    return <View style={[s.provider, { backgroundColor: SPLASH.backgroundColor }]} />;
  }
  if (apiConfigurationError) return <SafeAreaProvider style={s.provider}><ApiConfigurationErrorScreen /></SafeAreaProvider>;
  if (__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock-safety') {
    const SafetyPreview = require('./src/safety/SafetyPreview').default;
    return <SafetyPreview />;
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock-sharing') {
    const SharingFixture = require('./tests/fixtures/diary-sharing.fixture').default;
    return <SharingFixture />;
  }
  if (__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock-library') {
    return <SafeAreaProvider style={s.provider}><MockLibraryApp /><HandwritingStudio /></SafeAreaProvider>;
  }
  return (
    // initialMetrics 가 없으면 SafeAreaProvider 는 기기가 안전 영역 값을 보낼 때까지 첫 프레임을 비워 바탕(흰색)만 보인다.
    // 시작 화면(보라) → 흰 화면 → 인트로(보라)로 깜박였다(실기기 S20 · 탭 SM-X510). 시작값을 주고, 시작 중에는 바탕도 보라로 둔다
    <SafeAreaProvider style={[s.provider, booting && { backgroundColor: SPLASH.backgroundColor }]} initialMetrics={initialWindowMetrics}>
      <StatusBar hidden />
      {__DEV__ && process.env.EXPO_PUBLIC_DIARY_SOURCE === 'mock' ? <ConnectedDiaryLibrary /> : (
        previewSession ? <LoginGateProvider authenticated={!!authenticatedSession && !loginRequest?.sessionExpired} onLogin={openLogin}><SessionDiaryApp key={authenticatedSession ? `authenticated:${memberSessionKey || authenticatedSession.userId}` : 'preview'} previewUser={previewSession} loginOverlayOpen={Boolean(loginRequest)}
          onUpdatePreview={updated => setPreviewSession(current => current?.mode === updated.mode &&
            (current?.mode === 'authenticated' ? String(current.userId) === String(updated.userId) : current?.accountId === updated.accountId) ? updated : current)}
          mailInvitation={mailInvitation && !booting && authenticatedSession && authService.getSessionKey() ? mailInvitation : null}
          onConsumeMailInvitation={consumeMailInvitation} onSwitchInvitationAccount={switchInvitationAccount}
          onEndPreview={endSession} onClearSession={clearSession} onWithdrawn={withdrawSession} /></LoginGateProvider> : null
      )}
      {!booting && !previewSession && !mockSource && !restoreFailed && (
        <View style={[s.provider, { backgroundColor: SPLASH.backgroundColor }]}>
          <LoadingSpot centered label="로그인 정보를 확인하고 있어요." />
        </View>
      )}
      {!booting && restoreFailed && <SessionRestoreScreen error={restoreState.error} busy={restoreState.status !== 'error'} onRetry={restoreLogin}
        onLogin={() => setLoginRequest({ sessionExpired: restoreState.error?.sessionExpired === true,
          restoreSession: __DEV__ && restoreState.error?.code === 'DEVELOPMENT_ACCESS_REQUIRED' })} onGuest={continueAsGuest} />}
      {!booting && loginRequest && <EditorModal visible transparent animationType="none" onRequestClose={closeLogin}><View style={[StyleSheet.absoluteFill, { zIndex: 10 }]}><AuthScreen key={loginRequest.sessionExpired ? 'expired' : 'login'} sessionExpired={loginRequest.sessionExpired === true} initialEmail={authenticatedSession?.email || ''} resumeSession={loginRequest.restoreSession === true} onContinue={continueFromLogin} onClose={closeLogin} /></View></EditorModal>}
      {accountToast && <AccountToast key={accountToast.key} message={accountToast.message} onDone={() => setAccountToast(null)} />}
      <HandwritingStudio />
      {/* 프로필 사진 자르기(동그라미 틀). 로그인 화면 · 프로필 수정 모두 쓰므로 앱 맨 위에 하나 둔다 */}
      <ProfileCropHost />
      {booting && <BootSplash onReady={hideSplash} onWritten={introWritten} onComplete={finishBoot} />}
    </SafeAreaProvider>
  );
}

// 계정 작업(회원 탈퇴 등) 완료 알약. 세션이 바뀌어도 사라지지 않게 앱 맨 위에 두고 2초 뒤 스스로 닫는다
// (ActionToast · useSafeAreaInsets · useFormFactor · useRef · useEffect 는 파일 위에서 이미 불러온다)
function AccountToast({ message, onDone }) {
  const insets = useSafeAreaInsets();
  const { isPhone } = useFormFactor();
  // onDone 은 App 이 그릴 때마다 새 함수라 의존성에 두면 타이머가 처음부터 다시 돈다(AI 리뷰) — 최신 것을 ref 로 들고 message 로만 센다
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => { const timer = setTimeout(() => done.current?.(), 2000); return () => clearTimeout(timer); }, [message]);
  return <ActionToast compact={isPhone} bottom={(isPhone ? 76 : 96) + insets.bottom} message={message} />;
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
  const safetySession = props.previewUser?.mode === 'authenticated' ? authService.getSessionKey() : 'guest';
  const content = <SafetyProvider key={`${props.previewUser?.userId || 'guest'}:${safetySession}`} user={props.previewUser} sharingRuntime={sharing.runtime}>
    <DiaryAppContent {...props} sharing={sharing} />
  </SafetyProvider>;
  return props.previewUser.mode === 'authenticated'
    ? <AuthenticatedNotificationProvider auth={authService} userId={props.previewUser.userId} createInvitations={createInvitations} describeInvitations={describeInvitations}>{content}</AuthenticatedNotificationProvider>
    : content;
}

// 세션 교체 뒤 돌아갈 화면(위 주석 참고). 앱을 새로 켜면 보관함이다
const HOME_ROUTE = { page: 'library', filter: DEFAULT_FILTER };
const routeMemory = createRouteMemory(HOME_ROUTE);

function DiaryAppContent({ previewUser, onEndPreview, onClearSession, onWithdrawn, onUpdatePreview, onReady, diaryState, sharing,
  loginOverlayOpen = false, mailInvitation, onConsumeMailInvitation, onSwitchInvitationAccount }) {
  const safety = useSafety();
  const member = diaryState.source === 'member-api';
  const [guestImport, setGuestImport] = useState(null);
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
  const [appForeground, setAppForeground] = useState(() => !AppState.currentState || AppState.currentState === 'active');
  const lockRead = useRef(0);
  useEffect(() => {
    let awayAt = AppState.currentState === 'background' ? Date.now() : null;
    const readLock = async () => {
      const read = ++lockRead.current;
      setAppLocked(null);
      const state = await readAppLockState(lockScope).catch(() => 'storage');
      if (lockRead.current !== read) return;
      setAppLockState(state);
      setAppLocked(state !== 'off');
    };
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'background') awayAt ??= Date.now();
      if (state === 'active') {
        if (appLockGraceOver(awayAt)) readLock();
        awayAt = null;
      }
      setAppForeground(state === 'active');
    });
    readLock();
    return () => { lockRead.current++; subscription.remove(); };
  }, [lockScope]);
  const checkedLock = lockRead.current;
  const unlockApp = () => { if (lockRead.current === checkedLock) setAppLocked(false); };
  // 회원은 비밀번호를 잊으면 계정으로 다시 확인하고(AppLockReauth) 새 4자리를 정한 뒤 들어온다(지라 799). 앱 잠금은 이 기기 · 이 계정에 묶인 정보다.
  // 게스트는 앱 잠금을 쓸 수 없다: 예전에 켜 둔 잠금은 맞는 4자리로 열면 끄고 들어온다. 저장값 손상으로 PIN을 확인할 수 없을 때만 초기화를 연다.
  const lockMember = previewUser.mode === 'authenticated';
  const [lockRecovery, setLockRecovery] = useState(null); // null | 'reauth'(계정 확인) | 'setup'(새 4자리)
  const [lockNotice, setLockNotice] = useState(null);
  useEffect(() => { setLockRecovery(null); }, [lockScope]);
  useEffect(() => {
    if (!lockNotice) return undefined;
    const timer = setTimeout(() => setLockNotice(null), 2000);
    return () => clearTimeout(timer);
  }, [lockNotice]);
  const unlockWithPin = async () => {
    if (!lockMember) await clearAppLock(lockScope).catch(() => {});
    unlockApp();
  };
  const finishLockRecovery = async pin => {
    try { await setAppLock(lockScope, pin); }
    catch { notify('앱 잠금', '앱 잠금을 바꾸지 못했어요. 다시 시도해 주세요.'); return; }
    setLockRecovery(null);
    setLockNotice({ key: createId(), message: '이 기기의 앱 잠금 비밀번호를 바꿨어요' });
    unlockApp();
  };
  // 계정 비밀번호까지 잊었으면 로그아웃: 다시 로그인(비밀번호 찾기)으로 이어지고, 이 기기의 이 계정 잠금은 지운다(예전 '잊었어요'와 같다)
  const logoutFromLock = async () => {
    try { await clearAppLock(lockScope); }
    catch { notify('앱 잠금', '앱 잠금을 초기화하지 못했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setLockRecovery(null);
    onEndPreview();
  };
  const forgotAppLock = appLockRecoveryAction({
    member: lockMember, state: appLockState, scope: lockScope, onReauth: () => setLockRecovery('reauth'),
    onCleared: () => { if (lockRead.current === checkedLock) { setAppLockState('off'); unlockApp(); } },
    onStateChange: state => { if (lockRead.current === checkedLock) { setAppLockState(state); if (state === 'off') unlockApp(); } },
  });
  const [sharingRequest, setSharingRequest] = useState(null);
  // 공유 모달은 PIN 화면보다 위에 그려진다. 백그라운드에서부터 숨겨 복귀 직후의 잠금 조회도 기다린다.
  const sharingVisible = appForeground && appLocked === false;
  useEffect(() => {
    if (!mailInvitation || loginOverlayOpen || !sharingVisible) return;
    setSharingRequest(mailInvitation.link
      ? { mode: 'invitation', link: mailInvitation.link }
      : { mode: 'invitation', inviteId: mailInvitation.inviteId, fromMail: true });
    onConsumeMailInvitation(mailInvitation);
  }, [mailInvitation, loginOverlayOpen, sharingVisible, onConsumeMailInvitation]);
  const openSafetyParticipants = (diary, target, action) => {
    const previous = sharingRequest;
    setSharingRequest(null);
    safety.openParticipants(diary, { target, action, onClosed: () => setSharingRequest(previous) });
  };
  const [pendingPush, setPendingPush] = useState(null);
  const deliveredPush = useRef(null);
  // 기기 알림 연결에서 앱이 복구하지 못하는 문제(S15P31F106-719): 상태는 알림 설정 화면에 줄로 보여 주고(pushIssue),
  // 팝업은 같은 상태에 한 번만 띄운다 — 띄운 기록을 기기에 남겨 앱을 다시 실행해도 홈 진입을 거듭 막지 않는다.
  const [pushIssue, setPushIssue] = useState(null);
  const pushIssueMemory = useRef(null);
  if (!pushIssueMemory.current) pushIssueMemory.current = createPushIssueMemory({ load: () => loadJSON(PUSH_ISSUE_NOTIFIED_KEY, null), save: value => saveJSON(PUSH_ISSUE_NOTIFIED_KEY, value) });
  useEffect(() => {
    if (previewUser.mode !== 'authenticated') return;
    const sessionKey = authService.getSessionKey();
    let disposed = false, stop = () => {}, noticed = null;
    setPushIssue(null);
    const onPushError = error => {
      if (__DEV__) console.warn('푸시 연결 오류', /^PUSH_[A-Z_]+$/.test(error?.message || '') ? error.message : 'UNKNOWN');
      const issue = pushIssueOf(error, previewUser.userId);
      if (!issue || disposed) return;
      setPushIssue(issue);
      if (noticed === issue.signature) return;
      noticed = issue.signature;
      pushIssueMemory.current.notifyOnce(issue).then(first => { if (first && !disposed) notify(issue.title, issue.message); }).catch(() => {});
    };
    startPushRuntime({ auth: authService, userId: previewUser.userId, invitations: sharing.runtime.invitationGateway,
      onInvitation: ({ inviteId }) => { if (!disposed) setPendingPush({ inviteId, sessionKey }); },
      onSynced: () => { if (!disposed) setPushIssue(null); },
      onError: onPushError }).then(cleanup => { if (disposed) cleanup(); else stop = cleanup; }).catch(error => { if (!disposed) onPushError(error); });
    return () => { disposed = true; stop(); };
  }, [previewUser.mode, previewUser.userId, sharing.runtime]);
  // 공유는 로그인한 사용자만 쓴다. 게스트는 편집 화면에 함께하는 사람을 띄우지 않고, 공유를 누르면 로그인 안내부터 본다.
  const signedIn = previewUser.mode === 'authenticated';
  const loginGate = useLoginGate();
  const sharingGate = useMemo(() => createSharingGate({ authenticated: signedIn, loginGate, open: setSharingRequest,
    beforeOpen: run => { if (profileLeaveGuard.current) profileLeaveGuard.current(run); else run(); } }), [signedIn, loginGate]);
  useEffect(() => {
    if (!pendingPush || !sharingVisible || loginOverlayOpen || deliveredPush.current === pendingPush) return;
    deliveredPush.current = pendingPush;
    setPendingPush(null);
    if (pendingPush.sessionKey && authService.getSessionKey() === pendingPush.sessionKey) {
      sharingGate.pushInvitation(pendingPush.inviteId);
    }
  }, [pendingPush, sharingVisible, loginOverlayOpen, sharingGate]);
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
  // 로그인 · 로그아웃으로 세션이 바뀌면 본문(SessionDiaryApp)이 새로 그려진다. 기능 가드에서 로그인한 뒤 보관함으로 튕기지 않도록
  // 마지막 화면 · 범위를 모듈 변수에 두고 다음 본문이 그 자리에서 시작한다(편집기는 열린 다이어리가 없어 제외)
  const routeOwner = member ? (previewUser?.userId || previewUser?.accountId || 'member') : null;
  const [routePage, setPage] = useState(() => routeMemory.read(routeOwner).page);
  const rawPage = !signedIn && routePage === 'studio' ? HOME_ROUTE.page : routePage;
  // 폰에는 별도 설정 화면이 없다(마이페이지 안에 설정이 펼쳐진다). 저장된 마지막 화면 · 분할 화면 전환으로 settings 가 남아도 마이페이지로 읽는다
  const page = normalizePageForFormFactor(rawPage, isPhone);
  const [railCollapsed, setRailCollapsed] = useState(true);  // 메뉴가 다 열리거나 닫혔을 때의 폭. 캐러셀은 '줄 폭 + 이 값'(메뉴와 상관없이 같은 값)으로 목록 폭을 정해,
  // 메뉴에 밀려 함께 움직이는 동안과 멈춘 뒤에도 목록 폭이 바뀌지 않게 한다. 다시 그리지 않도록 ref로 넘긴다.
  const railWidthRef = useRef(RAIL_WIDTH.collapsed);
  // 메뉴는 메인 화면 위에 겹쳐 열리므로 메인 화면을 비켜 주는 폭은 늘 접힌 폭이다.
  // 보관함 필터: 범위(내 다이어리 · 공유된 다이어리) + 즐겨찾기 여부 (libraryQuery.filterScope · filterFavorite)
  const [filter, setFilter] = useState(() => routeMemory.read(routeOwner).filter);
  useEffect(() => { routeMemory.remember({ page, filter }, routeOwner); }, [page, filter, routeOwner]);
  // navigate 를 거치지 않고 휴지통에서 시작하면 목록도 여기서 불러온다
  useEffect(() => { if (member && page === 'trash') diaryState.store.loadTrash().catch(()=>{}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
    libraryReadFailed,
    retryLibraryRead,
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
  // Keep the editor's participant chips current even when the sharing sheet is closed.
  useEffect(() => {
    const diaryId = active?.sharedDiaryId || active?.id;
    if (!member || !isSharingDiaryId(diaryId) || !sharing.runtime.server || typeof sharing.runtime.watchDiary !== 'function') return undefined;
    return sharing.runtime.watchDiary(diaryId, { onUnavailable: message => notify('공유 상태 변경', message) });
  }, [member, active?.id, active?.sharedDiaryId, sharing.runtime]);
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
  const enterEditor = useCallback(async (diary, { canLeave, onOpened } = {}) => {
    if (canLeave && !canLeave()) return 'blocked';
    const request = {};
    opening.current = request;
    try {
      if (!await safety.canOpenDiary(diary) || opening.current !== request) return false;
      if (member) {
        const opened = await diaryState.store.open(diary.id);
        if (opening.current !== request) return false;
        diary = opened.diary;
        rememberEditorDoc(editorDocKey(diary), opened.doc, { overwrite: false });
      }
      await Promise.race([prepareEditor(diary), wait(EDITOR_PREPARE_LIMIT_MS)]);
      if (opening.current !== request) return false;
      // 권한 확인·페이지 로딩 중 필기나 저장이 시작됐으면 이동을 보류한다.
      if (canLeave && !canLeave()) { opening.current = null; return 'blocked'; }
      opening.current = null;
      const current = diary.sharedDiaryId ? sharedLibraryRef.current.find(item => item.id === diary.id) : diary;
      if (!current) return false;
      setEditorOrientation(null);
      setActive(current);
      setTabIds(current => current.includes(diary.id) ? current : [...current, diary.id]);
      setPage('editor');
      onOpened?.();
      return true;
    } catch (error) {
      if (opening.current !== request) return false;
      opening.current = null;
      notify('다이어리를 열지 못했어요', error.message);
      return false;
    }
  }, [member, diaryState.store, safety.canOpenDiary]);
  const open = enterEditor;
  const openSharedDiary = useCallback(async (id) => {
    const diary = member ? { id, isShared: true } : sharedLibraryRef.current.find(item => item.sharedDiaryId === id);
    if (!diary) return false;
    const opened = await enterEditor(diary, {
      canLeave: () => !invitationLeaveGuard.current || invitationLeaveGuard.current(),
      onOpened: () => setSharingRequest(null),
    });
    if (opened === 'blocked') throw new Error('입력·자르기와 저장을 마친 뒤 다이어리를 열어 주세요.');
    // 검색·필터는 유지하고 서버 보관함만 갱신한다. 조회 실패는 열기를 되돌리지 않는다.
    if (member && opened) Promise.resolve().then(() => diaryState.store.reload()).catch(error => {
      if (error.code !== 'STALE_ACCOUNT') notify('공유 목록을 확인하지 못했어요', error.message);
    });
    return opened;
  }, [member, diaryState.store, enterEditor]);

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
      setRailCollapsed(true); // 태블릿: 펼친 메뉴(오버레이)는 목적지를 고르면 닫힌다(Material modal drawer). 폰은 늘 true
      if (next === 'library') {
        setMemberSearchOpen(false); setMemberSearch('');
        setFilter(nextFilter || DEFAULT_FILTER);
        setCarousel(0);
      }
      setPage(next);
    };
    const leaveThenMove = () => {
      if (next !== 'profile' && profileLeaveGuard.current) profileLeaveGuard.current(move);
      else move();
    };
    if (next === 'studio') loginGate('꾸미기 공방', leaveThenMove);
    else leaveThenMove();
  }, [member, diaryState.store, loginGate]);

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
      if (!isPhone && !railCollapsed) {
        setRailCollapsed(true);
        return true;
      }
      const target = backTarget({ page, filter }, HOME_ROUTE);
      if (!target) return false;
      navigate(target.page, target.filter);
      return true;
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
      message: `“${diary.title}”는 휴지통에서 30일 동안 복원할 수 있으며 이후 영구 삭제돼요.`,
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
      title: `${ids.length}권을 휴지통으로 옮길까요?`,
      message: member ? '선택한 다이어리를 각각 휴지통으로 옮겨요. 삭제 시각부터 30일 동안 복원할 수 있어요.' : '고른 다이어리는 휴지통에서 30일 동안 복원할 수 있으며 이후 영구 삭제돼요.',
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
          if (!member) setGuestTrashDone({ key: createId(), count: ids.length });
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
    const received = memberLibraryMatches ? diaryState.library.items : [];
    const items = parseSort(librarySort).key === 'created' ? sortMovedByCreated(received) : received;
    if (!sortReversed) return items;
    return fullLoadPending ? [] : [...items].reverse();
  }, [member, memberLibraryMatches, diaryState.library?.items, librarySort, sortReversed, fullLoadPending, visibleDiaries]);
  const libraryReady = diaryState.library?.ready, libraryBusy = diaryState.library?.loading, libraryFailed = diaryState.library?.error, libraryCursor = diaryState.library?.nextCursor;
  // 남은 페이지는 버튼 없이 한 페이지씩 뒤에서 이어 받는다('다음 다이어리 불러오기' 버튼을 없앴다, 2026-11-07). 오류가 나면 멈추고, 알림 칸의 다시 불러오기가 재개한다.
  const libraryHasMore = Boolean(member && memberLibraryMatches && diaryState.library?.hasNext);
  useEffect(() => {
    if (page === 'library' && libraryHasMore && libraryReady && !libraryBusy && !libraryFailed) diaryState.store.loadMoreLibrary().catch(() => {});
  }, [page, libraryHasMore, libraryReady, libraryBusy, libraryFailed, libraryCursor, diaryState.store]);
  // 편집기에서 페이지를 지우거나 더한 뒤 보관함으로 돌아오면 서버 목록(카드 페이지 수)을 다시 받는다.
  // 게스트는 위의 useLibraryMetadata 가 기기에 저장된 문서에서 다시 읽는다.
  const previousPage = useRef(page);
  useEffect(() => {
    const left = previousPage.current === 'editor' && page === 'library';
    previousPage.current = page;
    if (left && member) Promise.resolve().then(() => diaryState.store.reload()).catch(() => {});
  }, [page, member, diaryState.store]);
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

  const memberListFailed = member && Boolean(diaryState.error || (memberLibraryMatches && libraryFailed));
  const libraryLoading = !loaded || (member && (libraryBusy || (!memberListFailed
    && (fullLoadPending || !memberLibraryMatches || !libraryReady || diaryState.refreshing))));
  const localListFailed = !member && libraryReadFailed;
  const libraryScreen = useMemo(() => (
    <LibraryScreen
      compact={isPhone}
      guestImport={guestImport}
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
      onCreate={loaded && !localListFailed ? create : undefined}
      railWidthRef={isPhone ? null : railWidthRef}
      selection={selection}
      onSelectionChange={setSelection}
      onTrashSelected={moveSelectedToTrash}
      trashing={trashing || (member && Boolean(diaryState.bulkTrash?.busy))}
      remoteQuery={remoteQuery}
      historyKey={member ? diaryState.store.keys.searchHistory : undefined}
      hasMore={member && memberLibraryMatches && diaryState.library.hasNext}
      requestNotice={member ? <><MemberLibraryNotice library={diaryState.library} pending={!memberLibraryMatches} bulk={diaryState.bulkTrash}
        onRetry={()=>diaryState.store.retryLibrary().catch(()=>{})}
/><MemberTrashNotice state={diaryState} onReload={()=>diaryState.store.loadTrash().catch(()=>{})} onRetry={()=>diaryState.store.retryLifecycle().catch(()=>{})}/><MemberRequestNotice pending={diaryState.pending} error={diaryState.error} busy={saving} refreshing={diaryState.refreshing}
        onReload={() => diaryState.store.load().catch(() => {})}
        onArchiveExpired={() => confirmAction({title:'이전 요청을 정리할까요?',message:'보관함 목록을 다시 확인한 뒤 이전 생성 요청을 정리해요. 이미 만들어진 다이어리는 지우지 않아요.',confirmLabel:'정리',onConfirm:async()=>{
          if(savingRef.current) return; savingRef.current=true;setSaving(true);
          try {await diaryState.store.archiveExpiredCreation();} catch(error) {notify('요청을 정리하지 못했어요',error.message);} finally {savingRef.current=false;setSaving(false);}
        }})}
        onRetry={async () => {
          if (savingRef.current) return;
          savingRef.current = true; setSaving(true);
          try { const d = await diaryState.retryCreation(); setCreateOpen(false); await enterEditor(d); }
          catch (error) { notify('이전 생성을 확인하지 못했어요', error.message); }
          finally { savingRef.current = false; setSaving(false); }
        }} /></> : localListFailed ? <View style={{ padding: 12, gap: 8 }} accessibilityLiveRegion="polite">
          {loaded && <Text accessibilityRole="alert" style={s.cardMeta}>기기에 저장된 다이어리 목록을 불러오지 못했어요.</Text>}
          <DioButton label={loaded ? '다시 불러오기' : '불러오는 중…'} disabled={!loaded} onPress={retryLibraryRead} style={s.noticeAction} />
        </View> : null}
      suppressEmpty={libraryLoading || memberListFailed || localListFailed}
      loading={libraryLoading}
    />
  ), [guestImport, carousel, navigate, changeCarousel, changeFilter, changeView, changeLibrarySort, create, edit, favorite, filter, isPhone, tabletPortrait,libraryMetadata, librarySort, moveDiaryToTrash, moveSelectedToTrash, open, selection, trashing, view, libraryDiaries, member, memberLibraryMatches, remoteQuery, diaryState.library, diaryState.bulkTrash, diaryState.pending, diaryState.error, diaryState.refreshing, diaryState.lifecycle, diaryState.trashLoading, diaryState.trashError, diaryState.store, saving, enterEditor, loaded, localListFailed, retryLibraryRead, libraryLoading, memberListFailed]);

  // 보관함(libraryScreen)처럼 요소를 memo 해 둔다. 사이드 메뉴를 여닫느라 App 이 다시 그려져도 휴지통 목록은 다시 그리지 않는다.
  const trashScreen = useMemo(() => (
    <TrashScreen
      serverMode={member}
      busy={member && Boolean(diaryState.lifecycle?.busy || diaryState.bulkTrash?.busy)}
      suppressEmpty={member && Boolean(diaryState.trashLoading || diaryState.trashError)}
      loading={member && Boolean(diaryState.trashLoading && !diaryState.trashLoaded && !diaryState.trash?.length)}
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
        if (failed) notify('복원하지 못한 다이어리가 있어요', `${failed}권을 복원하지 못했어요. 보관 기한이 지났거나 영구 삭제 중일 수 있어요.`);
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
            if (failed) notify('삭제하지 못한 다이어리가 있어요', `${failed}권을 삭제하지 못했어요. 저장소를 확인한 뒤 다시 시도해 주세요.`);
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

  let content = libraryScreen;
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
        onMembersChanged={() => { const diaryId = active?.sharedDiaryId || active?.id; if (isSharingDiaryId(diaryId)) { sharing.runtime.invalidateMemberPhotos?.(); sharing.runtime.refreshMembers?.(diaryId)?.catch(() => sharing.runtime.setWatchingRealtime?.(diaryId, false)); } }}
        onCollaborationStateChange={(diaryId, connected) => sharing.runtime.setWatchingRealtime?.(diaryId, connected)}
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
    content = <ProfileScreen onOpenBlockedUsers={safety.openBlocks} key="profile" guestImport={guestImport} compact={isPhone} diaries={visibleDiaries} previewUser={previewUser} onEndPreview={onEndPreview} onClearSession={onClearSession} onWithdrawn={onWithdrawn} onUpdatePreview={onUpdatePreview} registerLeaveGuard={registerProfileLeaveGuard}
      accountService={previewUser?.mode === 'authenticated' ? authService : undefined} pushIssue={pushIssue}
      getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined} />;
  } else if (page === 'settings') {
    content = <ProfileScreen onOpenBlockedUsers={safety.openBlocks} key="settings" section="settings" registerLeaveGuard={registerProfileLeaveGuard} compact={isPhone} previewUser={previewUser} onEndPreview={onEndPreview} onClearSession={onClearSession} onWithdrawn={onWithdrawn} onUpdatePreview={onUpdatePreview}
      accountService={previewUser?.mode === 'authenticated' ? authService : undefined} pushIssue={pushIssue}
      getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined} />;
  }

  // 새 다이어리를 만든 뒤 내 표지 · 속지 저장만 실패하면, 작업대가 닫힌 뒤(편집기로 들어간 뒤) 알약으로 알리고 다시 시도하게 한다.
  // 다시 시도해 성공하면 완료 알약을 2초 띄운다.
  const [libraryNotice, setLibraryNotice] = useState(null);
  const libraryTarget = kinds => kinds.length > 1 ? '표지와 속지를 내 표지 · 속지에' : kinds[0] === 'cover' ? '표지를 내 표지에' : '속지를 내 속지에';
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
  // 앱 잠금 4자리를 계정 확인으로 새로 정한 뒤의 결과 알약(지라 799). 알약은 같은 자리에 하나만
  const lockToast = lockNotice && <ActionToast key={lockNotice.key} compact={isPhone} bottom={(page === 'editor' ? 112 : isPhone ? 76 : 96) + insets.bottom} message={lockNotice.message} />;
  const libraryToast = libraryNotice && (
    <ActionToast key={libraryNotice.key} compact={isPhone}
      bottom={(page === 'editor' ? 112 : isPhone ? 76 : 96) + insets.bottom}
      message={libraryNotice.done ? `${libraryNotice.done} 추가했어요.` : `${libraryTarget(libraryNotice.kinds)} 추가하지 못했어요.`}
      actionLabel={libraryNotice.done ? undefined : '다시 시도'} busy={libraryNotice.busy} onAction={retryLibrarySave} />
  );

  // 여러 권을 휴지통으로 옮긴 결과는 목록 위 칸이 아니라 알약 토스트로 알린다(지라 619). 목록이 밀리지 않고 닫기 버튼이 없어도 된다.
  // 성공은 2초, 실패는 '다시 시도'를 달아 6초 보인 뒤 사라진다. 다시 로그인해야 하는 실패만 목록 위(MemberLibraryNotice)에 남긴다.
  const bulkTrash = member ? diaryState.bulkTrash : null;
  const bulkTrashAuth = bulkTrashNeedsLogin(bulkTrash);
  // 다시 시도를 누른 순간부터 store 가 busy 로 바뀌기 전까지도 버튼을 막는다(연속으로 눌러도 한 번만 보낸다)
  const [bulkTrashRetrying, setBulkTrashRetrying] = useState(false);
  const bulkTrashRetryingRef = useRef(false);
  const retryBulkTrash = async () => {
    if (bulkTrashRetryingRef.current) return;
    bulkTrashRetryingRef.current = true; setBulkTrashRetrying(true);
    try {
      const result = await diaryState.store.retryBulkTrash(); const moved = new Set(result.succeeded);
      setActive(current => current && moved.has(current.id) ? null : current); setTabIds(current => current.filter(id => !moved.has(id)));
      setSelection(result.failed.length ? result.failed.map(item => item.id) : null);
    } catch (error) { notify('휴지통으로 옮기지 못했어요', error.message); }
    finally { bulkTrashRetryingRef.current = false; setBulkTrashRetrying(false); }
  };
  const bulkTrashMessage = bulkTrashToastMessage(bulkTrash);
  const bulkTrashSettled = Boolean(bulkTrash && !bulkTrash.busy && !bulkTrashAuth);
  const bulkTrashFailed = Boolean(bulkTrash?.failed?.length || bulkTrash?.refreshError);
  useEffect(() => {
    if (!bulkTrashSettled) return undefined;
    const timer = setTimeout(() => diaryState.store.dismissBulkTrash(), bulkTrashFailed ? ACTION_TOAST_MS : BULK_TRASH_DONE_MS);
    return () => clearTimeout(timer);
  }, [bulkTrash, bulkTrashSettled, bulkTrashFailed, diaryState.store]);
  const [guestTrashDone, setGuestTrashDone] = useState(null);
  useEffect(() => {
    if (!guestTrashDone) return undefined;
    const timer = setTimeout(() => setGuestTrashDone(null), BULK_TRASH_DONE_MS);
    return () => clearTimeout(timer);
  }, [guestTrashDone]);
  const trashToastMessage = bulkTrashMessage ?? (!member && guestTrashDone ? `${guestTrashDone.count}권을 휴지통으로 옮겼어요.` : null);
  // 보조 저장 알약의 시간은 휴지통 알약에 가려져 있는 동안 멈춘다(가려진 채 만료돼 '다시 시도'를 놓치지 않게). 휴지통 알약이 사라지면 처음부터 다시 센다
  const libraryToastHidden = Boolean(trashToastMessage);
  useEffect(() => {
    if (!libraryNotice || libraryNotice.busy || libraryToastHidden) return undefined;
    const timer = setTimeout(() => setLibraryNotice(null), libraryNotice.done ? 2000 : ACTION_TOAST_MS);
    return () => clearTimeout(timer);
  }, [libraryNotice, libraryToastHidden]);
  const trashToast = trashToastMessage && (
    <ActionToast compact={isPhone} bottom={(page === 'editor' ? 112 : isPhone ? 76 : 96) + insets.bottom} message={trashToastMessage}
      actionLabel={bulkTrashSettled && bulkTrash.canRetry ? '다시 시도' : undefined} busy={bulkTrashRetrying} onAction={retryBulkTrash} />
  );

  const createModal = createOpen && (
    <DiaryCreateModal
      key={editingDiaryId ?? 'new'}
      serverPapers={member && !editingDiaryId}
      sheet={isPhone}
      topInset={isPhone ? insets.top : 0}
      bottomInset={insets.bottom}
      diary={editingDiaryId ? diaries.find(item => item.id === editingDiaryId) : null}
      saving={saving}
      onSubmit={save}
      onLibrarySaveFailed={showLibraryFailure}
      onCancel={() => { if (savingRef.current) return; setCreateOpen(false); setEditingDiaryId(null); }}
    />
  );

  const phoneSurface = C.canvas;
  let shell;
  if (page === 'editor') {
    shell = content;
  } else {
    // 폰은 하단 탭, 태블릿은 왼쪽 메뉴. 접이식 · 분할 화면에서 배치가 바뀌어도 쓰던 화면이 새로 그려져 입력이 사라지지 않도록 트리 자리를 같게 둔다.
    shell = (
      <View style={isPhone ? s.phoneShell : s.shell}>
        {isPhone ? null : <SideRail
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
        />}
        <View style={[s.workspace, !isPhone && { paddingBottom: insets.bottom }]}>
          <PhoneBellProvider value={isPhone ? <SharingEntry notifications notificationCount={authenticatedNotifications?.count}
            notificationLabel={authenticatedNotifications ? '알림' : '받은 초대'} compact
            count={unreadInvites} onPress={openInvitations} /> : null}>
            {content}
          </PhoneBellProvider>
          {createModal}
        </View>
        {isPhone ? <BottomTabs
          page={page}
          filter={filter}
          navigate={navigate}
          bottomInset={insets.bottom}
        /> : null}
      </View>
    );
  }

  // 위: 폰 편집기 세로는 흰 상단 바, 그 밖은 앱 바탕(C.canvas). 좌우도 앱 바탕.
  const safeAreaColors = {
    top: page === 'editor' && !isLandscape ? C.white : C.canvas,
    left: !isPhone && page !== 'editor' ? C.white : C.canvas, // 태블릿 좌측 바와 이어진다
    right: C.canvas,
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
        ? <HomeNotificationFlow visible={sharingVisible} onOpenParticipants={openSafetyParticipants} request={sharingRequest} model={authenticatedNotifications} sharing={sharing} onRequest={setSharingRequest}
            onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }}
            onOpenDiary={openSharedDiary} onOpenCopy={diary => openCopyIfSafe(diary, invitationLeaveGuard.current, () => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }, enterEditor)} />
        : <SharingHub visible={sharingVisible} onOpenParticipants={openSafetyParticipants} onOpenCopy={diary => openCopyIfSafe(diary, invitationLeaveGuard.current, () => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }, enterEditor)} onOpenDiary={openSharedDiary} request={sharingRequest} runtime={sharing.runtime} model={sharing.notifications}
            onSwitchInvitationAccount={inviteId => { setSharingRequest(null); onSwitchInvitationAccount(inviteId); }}
            onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }} />}
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
      {/* 알약은 같은 자리에 하나만: 방금 한 휴지통 결과를 먼저 보이고, 그동안 보조 저장 실패 알약은 가린다(타이머는 그대로 돈다) */}
      {lockToast || trashToast || libraryToast}
      {/* 잠금 여부를 읽는 1~3프레임 덮개: 흰색이면 번쩍여 보여 앱 바탕(surfaceSoft)과 같은 색으로 둔다 */}
      {appLocked === null && <View style={[StyleSheet.absoluteFill, { zIndex: 100, backgroundColor: C.canvas }]} />}
      {appLocked && <PinScreen mode="unlock" user={previewUser} getProfilePhotoSource={previewUser.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined}
        check={value => checkAppLockStatus(lockScope, value)} onDone={unlockWithPin} onForgot={forgotAppLock} />}
      {appLocked && lockMember && lockRecovery === 'reauth' && <AppLockReauth user={previewUser} getProfilePhotoSource={authService.getProfilePhotoSource}
        verify={input => authService.verifyAccount(input)} onVerified={() => setLockRecovery('setup')} onCancel={() => setLockRecovery(null)} onLogout={logoutFromLock} />}
      {appLocked && lockMember && lockRecovery === 'setup' && <View style={[StyleSheet.absoluteFill, { zIndex: 110 }]}>
        <PinScreen mode="setup" user={previewUser} getProfilePhotoSource={authService.getProfilePhotoSource} onDone={finishLockRecovery} onCancel={() => setLockRecovery(null)} />
      </View>}
      {/* 꾸미기 공방 스티커 · 테이프 보관함을 계정 서버와 맞춘다(다른 기기 · 재설치에서도 같은 구성) */}
      {member && signedIn && <StickerLibrarySyncHost key={`${previewUser.userId}:${authService.getSessionKey()}`} accountId={String(previewUser.userId)} enabled={appLocked === false} />}
      {member && signedIn && <GuestImportHost key={`${previewUser.userId}:${authService.getSessionKey()}`} accountId={String(previewUser.userId)} enabled={appLocked === false} onImported={() => diaryState.store.reload().catch(() => {})} onEntry={setGuestImport} />}
      <DialogHost />
    </>
  );
}
