import { openCopyIfSafe } from './src/notifications/editorInvitationGuard';
import MemberTrashNotice from './src/diary/components/MemberTrashNotice';
import MemberLibraryNotice from './src/diary/components/MemberLibraryNotice';
import { memberLibraryQuery } from './src/diary/services/memberLibraryQuery';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import EditorScreen from './src/editor/screens/EditorScreen';
import { editorDocKey, loadEditorDoc, prepareEditor, rememberEditorDoc, saveEditorDoc } from './src/editor/services/editorDocs';
import AuthScreen from './src/auth/AuthScreen';
import { authService } from './src/auth/authService';
import { useSharing } from './src/sharing/useSharing';
import SharingHub from './src/sharing/SharingHub';
import { AuthenticatedNotificationProvider, useOptionalSharedNotifications } from './src/notifications/NotificationProvider';
import AuthenticatedNotificationDialog from './src/notifications/AuthenticatedNotificationDialog';
import { isSessionDocumentKey } from './src/editor/services/sessionDocuments.js';
import { C, DEFAULT_FILTER } from './src/diary/constants';
import { useDiaries } from './src/diary/hooks/useDiaries';
import { useMemberDiaries } from './src/diary/hooks/useMemberDiaries';
import MemberRequestNotice from './src/diary/components/MemberRequestNotice';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import SideRail, { RAIL_WIDTH } from './src/diary/components/SideRail';
import BottomTabs from './src/diary/components/BottomTabs';
import DeskBackdrop from './src/diary/components/DeskBackdrop';
import { DESK_COLORS } from './src/diary/utils/deskLight';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ConnectedDiaryLibrary from './src/diary/screens/ConnectedDiaryLibrary';
import MockLibraryApp from './src/diary/screens/MockLibraryApp';
import { useLibraryMetadata } from './src/diary/hooks/useLibraryMetadata';
import { parseSort, queryDiaries } from './src/diary/utils/libraryQuery';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import DecorationStudioScreen from './src/diary/screens/DecorationStudioScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { styles as s } from './src/diary/styles';
import { confirmAction, notify } from './src/shared/dialogs';
import { normalizePaperAppearance } from './src/editor/templates/appearance.js';
import { fitTabletFrame } from './src/shared/layout';
import { useFormFactor } from './src/shared/useFormFactor';
import { CAN_LOCK_ORIENTATION, useOrientationLock } from './src/shared/useOrientationLock';
import { useHiddenNavigationBar } from './src/shared/useHiddenNavigationBar';
import { normalizeTemplateConfig } from './src/editor/templates/creation.js';
import { createDefaultDoc } from './src/editor/state/defaultDoc.js';
import { saveJSON, STORAGE_KEYS } from './src/editor/services/storage';
import { randomUUID } from 'expo-crypto';
import { createId, setUuidGenerator } from './src/editor/utils/common';
import HandwritingStudio from './src/handwriting/HandwritingStudio';

// 네이티브에는 전역 crypto가 없어 다이어리·페이지·요소 UUID를 expo-crypto로 만든다.
if (Platform.OS !== 'web') setUuidGenerator(randomUUID);

// 속지 캐시(16개)를 넘지 않도록 앞쪽 다이어리만 미리 준비한다.
const PREFETCH_DIARIES = 8;
const PREFETCH_DELAY_MS = 400;
// 편집기 진입 전 준비를 기다리는 최대 시간. 보통은 이보다 훨씬 빨리 끝난다.
const EDITOR_PREPARE_LIMIT_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  const [previewSession, setPreviewSession] = useState(null);
  const endSession = async () => {
    try {
      if (previewSession?.mode === 'authenticated') await authService.logout();
    } catch (error) { notify('로그아웃', `${error.message} 이 기기의 로그인 정보는 지웠어요.`); }
    finally { setPreviewSession(current => current === previewSession || (current?.accountId && current.accountId === previewSession?.accountId) ? null : current); }
  };
  // 지난 실행에서 공유하고 남은 PDF 임시 파일을 정리한다. (공유 모듈은 불러오지 않는다)
  useEffect(() => { cleanupPdfShareCache().catch(() => {}) }, []);
  useHiddenNavigationBar();
  const SessionDiaryApp = previewSession?.mode === 'authenticated' ? MemberDiaryApp : LocalDiaryApp;
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
        previewSession ? <SessionDiaryApp key={`${previewSession.mode}:${previewSession.userId || 'preview'}`} previewUser={previewSession}
          onUpdatePreview={updated => setPreviewSession(current => current?.mode === updated.mode &&
            (current?.mode === 'authenticated' ? String(current.userId) === String(updated.userId) : current?.accountId === updated.accountId) ? updated : current)}
          onEndPreview={endSession} /> : <AuthScreen onContinue={setPreviewSession} />
      )}
      <HandwritingStudio />

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
  const content = <DiaryAppContent {...props} sharing={sharing} />;
  return props.previewUser.mode === 'authenticated'
    ? <AuthenticatedNotificationProvider auth={authService} userId={props.previewUser.userId} createInvitations={createInvitations}>{content}</AuthenticatedNotificationProvider>
    : content;
}
const DESK_ON_PHONE = false;

function DiaryAppContent({ previewUser, onEndPreview, onUpdatePreview, diaryState, sharing }) {
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
  const [sharingRequest, setSharingRequest] = useState(null);
  const unreadInvites = (authenticatedNotifications ?? sharing.notifications).count.data?.actionableUnreadCount || 0;
  const openInvitations = useCallback(() => {
    const open = () => setSharingRequest({ mode: previewUser.mode === 'authenticated' ? 'notifications' : 'invitations' });
    if (profileLeaveGuard.current) profileLeaveGuard.current(open); else open();
  }, [previewUser.mode]);
  const insets = useSafeAreaInsets();
  // 폰·태블릿 모두 현재 안전 영역을 직접 채운다. 데이터·상태는 두 배치가 함께 쓴다.
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 폰 배치는 유지하고 태블릿 바깥 프레임도 측정한 안전 영역 전체를 쓴다. 속지 좌표계는 그대로다.
  const { isPhone, isLandscape } = useFormFactor();
  const tabletPortrait = !isPhone && !isLandscape;
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });
  const [page, setPage] = useState('library');
  const [deskSize, setDeskSize] = useState(null); // 책상이 깔릴 영역(작업 영역)의 크기
  const [railCollapsed, setRailCollapsed] = useState(true);  // 메뉴가 다 열리거나 닫혔을 때의 폭. 캐러셀은 '줄 폭 + 이 값'(메뉴와 상관없이 같은 값)으로 목록 폭을 정해,
  // 메뉴에 밀려 함께 움직이는 동안과 멈춘 뒤에도 목록 폭이 바뀌지 않게 한다. 다시 그리지 않도록 ref로 넘긴다.
  const railWidthRef = useRef(RAIL_WIDTH.collapsed);
  // 메뉴는 메인 화면 위에 겹쳐 열리므로 메인 화면을 비켜 주는 폭은 늘 접힌 폭이다.
  // FILTERS에 없는 all을 초기값으로 쓰면 새 다이어리 카드가 제외되어 빈 안내만 보인다.
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [view, setView] = useState('carousel');
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
  const remoteQuery = useMemo(() => member ? { supportsShared: true, query: memberSearch, searchOpen: memberSearchOpen,
    onQueryChange: value => { setSelection(current => current === null ? null : []); setMemberSearch(value); setCarousel(0); },
    onSearchOpenChange: value => { setSelection(null); setMemberSearchOpen(value); if (!value) setMemberSearch(''); setCarousel(0); } } : null, [member, memberSearch, memberSearchOpen]);
  const [trashing, setTrashing] = useState(false);
  const trashingRef = useRef(false);
  const [active, setActive] = useState(null);
  useEffect(() => { if (active?.id && !member && !sharing.runtime.server) sharing.runtime.registerDiary(active); }, [active, sharing.runtime, member]);
  const sharedLibraryRef = useRef(sharing.library);
  sharedLibraryRef.current = sharing.library;
  const sharingMembers = sharing.diaries.find(value => value.id === (active?.sharedDiaryId || active?.id))?.members || [];
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
    if (member) { notify('즐겨찾기', '회원 즐겨찾기 변경 연결을 준비하고 있어요.'); return; }
    const shared = sharedLibraryRef.current.find(item => item.id === id);
    if (shared) { sharing.runtime.toggleFavorite(shared.sharedDiaryId || shared.id); return; }
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, favorite: !diary.favorite } : diary)));
    setActive((current) => (current?.id === id ? { ...current, favorite: !current.favorite } : current));
  }, [member, setDiaries, sharing.runtime]);

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
    if (Platform.OS !== 'android' || page === 'editor') return undefined;
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
      if (page !== 'library' || filter !== DEFAULT_FILTER) {
        navigate('library', DEFAULT_FILTER);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [createOpen, filter, isPhone, navigate, page, railCollapsed, selection]);

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
      confirmAction({title:'휴지통으로 옮길까요?',message:`“${diary.title}”는 삭제한 시각부터 30일 동안 복원할 수 있어요.`,confirmLabel:'휴지통으로',onConfirm:async()=>{
        try {await moveToTrash(diary.id);setActive(current=>current?.id===diary.id?null:current);setTabIds(current=>current.filter(id=>id!==diary.id));setCreateOpen(false);setEditingDiaryId(null);}
        catch(error){notify('휴지통 변경을 확인하지 못했어요',error.message);}
      }});return;
    }

    confirmAction({
      title: '휴지통으로 옮길까요?',
      message: `“${diary.title}”는 휴지통에서 30일 동안 복원할 수 있으며 이후 영구 삭제돼요. 앱이 꺼져 있으면 다음 실행 시 정리해요.`,
      confirmLabel: '휴지통으로',
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
        const doc = createDefaultDoc(diary);
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
    // 수정에서 속지 스타일을 바꾸면 새 페이지에 쓸 색을 바꾸고, '모든 페이지'면 이미 있는 페이지도 칠한다.
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
    // 다이어리 목록의 표지 색 이름은 color (편집 문서에서는 coverColor)
    .map((diary) => ({ id: diary.id, title: diary.title, coverColor: diary.color })), [tabIds, visibleDiaries]);

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
  useEffect(() => {
    if (!loaded || page !== 'library') return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      for (const diary of prefetchRef.current) {
        if (cancelled) return;
        await prepareEditor(diary, { media: false });
      }
    }, PREFETCH_DELAY_MS);
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
      onViewChange={setView}
      onCarouselChange={changeCarousel}
      onOpen={open}
      onFavorite={member ? undefined : favorite}
      onEdit={edit}
      onDelete={moveDiaryToTrash}
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
  ), [carousel, changeCarousel, changeFilter, changeLibrarySort, create, edit, favorite, filter, isPhone, tabletPortrait,libraryMetadata, librarySort, moveDiaryToTrash, moveSelectedToTrash, open, selection, trashing, view, libraryDiaries, member, memberLibraryMatches, remoteQuery, diaryState.library, diaryState.bulkTrash, diaryState.pending, diaryState.error, diaryState.refreshing, diaryState.lifecycle, diaryState.trashLoading, diaryState.trashError, diaryState.store, saving, enterEditor]);

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
          try { if ((await restoreFromTrash(id)) === false) failed += 1; } catch { failed += 1; }
        }
        if (failed) notify('복원하지 못한 다이어리가 있어요', `${failed}개를 복원하지 못했어요. 보관 기한이 지났거나 영구 삭제 중일 수 있어요.`);
      }}
      onDeleteMany={(items) => {
        confirmAction({
          title: '영구 삭제할까요?',
          message: member ? `선택한 ${items.length}개의 다이어리와 페이지는 복구할 수 없어요. 보관함의 공용 미디어 원본은 유지돼요.` : `선택한 ${items.length}개의 페이지와 로컬 기록은 복구할 수 없어요.`,
          confirmLabel: '영구 삭제',
          onConfirm: async () => {
            let failed = 0;
            for (const item of items) {
              try { if ((await deletePermanently(item.id)) === false) failed += 1; } catch { failed += 1; }
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
        diary={active}
        compact={isPhone}
        landscape={isLandscape}
        bottomInset={insets.bottom}
        onToggleOrientation={isPhone && CAN_LOCK_ORIENTATION ? () => setEditorOrientation(isLandscape ? 'portrait' : 'landscape') : undefined}
        onHome={returnToLibrary}
        registerInvitationLeaveGuard={registerInvitationLeaveGuard}
        onOpenSharing={() => setSharingRequest({ diary: active })}
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
    content = <ProfileScreen compact={isPhone} diaries={visibleDiaries} previewUser={previewUser} onEndPreview={onEndPreview} onUpdatePreview={onUpdatePreview} registerLeaveGuard={registerProfileLeaveGuard}
      accountService={previewUser?.mode === 'authenticated' ? authService : undefined}
      getProfilePhotoSource={previewUser?.mode === 'authenticated' ? authService.getProfilePhotoSource : undefined} />;
  }

  const createModal = createOpen && (
    <DiaryCreateModal
      key={editingDiaryId ?? 'new'}
      blankOnly={member && !editingDiaryId}
      sheet={isPhone}
      bottomInset={insets.bottom}
      diary={editingDiaryId ? diaries.find(item => item.id === editingDiaryId) : null}
      saving={saving}
      onSubmit={save}
      onCancel={() => { if (savingRef.current) return; setCreateOpen(false); setEditingDiaryId(null); }}
    />
  );

  // 다이어리 홈은 '햇살 책상' 위에 놓인다. 사이드 메뉴는 흰 판 그대로, 책상은 작업 영역 뒤(폰은 아래 탭 뒤까지)에 깔린다.
  // 햇살 책상은 태블릿(가로)만 쓴다. 폰(세로)은 가로형과 같은 빛 경험을 실기로 검증하지 못해 잠가 둔다(DESK_ON_PHONE).
  const desk = page === 'library' && loaded && (!isPhone || DESK_ON_PHONE);
  // 태블릿은 사이드 메뉴를 여닫는 동안 작업 영역 폭이 프레임마다 바뀐다. 책상은 접힌 폭(가장 넓은 폭) 밑으로는 줄지 않으므로
  // 그보다 좁은 폭은 접힌 폭으로 보고 값을 바꾸지 않는다. 안 그러면 프레임마다 App · 책상(햇빛 · 마스크)이 다시 그려져 끊긴다.
  const deskLayout = event => {
    const { width: rawWidth, height } = event.nativeEvent.layout;
    const width = isPhone ? rawWidth : Math.max(rawWidth, windowWidth - insets.left - insets.right - RAIL_WIDTH.collapsed);
    setDeskSize(current => (current && current.width === width && current.height === height ? current : { width, height }));
  }
  // 태블릿 책상은 사이드바가 접힌(가장 넓은) 작업 영역 크기로 고정하고 오른쪽 끝에 붙인다. 사이드바를 여닫는 동안 작업 영역 폭이
  // 프레임마다 바뀌어도 책상(원목 · 창빛)은 다시 그려지지도 움직이지도 않고, 넓어질 때 뒤 바탕(흰색)이 비치지도 않는다.
  const tabletDeskSize = useMemo(() => deskSize && {
    width: Math.max(deskSize.width, windowWidth - insets.left - insets.right - RAIL_WIDTH.collapsed),
    // 높이도 화면 높이 아래로는 줄지 않게 한다. 처음 잰 작업 영역이 화면보다 낮으면(세로) 상판 아래가 이미지 없이 단색으로 비었다.
    height: Math.max(deskSize.height, windowHeight - insets.top - insets.bottom),
  }, [deskSize, windowWidth, windowHeight, insets.left, insets.right, insets.top, insets.bottom]);
  let shell;
  if (page === 'editor') {
    shell = content;
  } else if (isPhone) {
    // 폰: 사이드 메뉴 대신 하단 탭. 새 다이어리 시트는 탭까지 덮도록 셸 위에 띄운다.
    shell = (
      <View style={s.phoneShell} onLayout={deskLayout}>
        {desk && <DeskBackdrop compact size={deskSize} />}
        <View style={[s.workspace, desk && s.workspaceDesk, desk && s.deskAbove]}>{content}</View>
        <BottomTabs floating={desk} notificationCount={authenticatedNotifications?.count} notificationLabel={authenticatedNotifications ? '알림' : '받은 초대'} onNotifications={openInvitations} invitationCount={unreadInvites} page={page} filter={filter} navigate={navigate} bottomInset={insets.bottom} />
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
          collapsed={railCollapsed}          onToggle={() => setRailCollapsed((current) => !current)}
        />
        <View style={[s.workspace, { paddingBottom: insets.bottom }, desk && { overflow: 'hidden' }]} onLayout={deskLayout}>
          {desk && <DeskBackdrop anchorRight size={tabletDeskSize} />}
          {desk ? <View style={s.deskAbove}>{content}</View> : content}
            {createModal}
        </View>
      </View>
    );
  }

  // 위: 폰 편집기 세로는 흰 상단 바, 그 밖은 보관함 바탕. 왼쪽: 태블릿 보관함은 흰 사이드 메뉴. 오른쪽: 보관함·편집기 바탕.
  const safeAreaColors = {
    top: page === 'editor' && !isLandscape ? C.white : desk ? DESK_COLORS.base : C.canvas,
    left: !isPhone && page !== 'editor' ? C.white : desk ? DESK_COLORS.base : C.canvas,
    right: desk ? DESK_COLORS.base : C.canvas,
  };

  const measureViewport = ({ nativeEvent: { layout } }) => {
    const { width: nextWidth, height: nextHeight } = layout;
    setViewport((current) => (
      current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }
    ));
  };

  return (
    <>
      {authenticatedNotifications && sharingRequest?.mode === 'notifications'
        ? <AuthenticatedNotificationDialog model={authenticatedNotifications} onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }} onInvitationReady={value => setSharingRequest({ mode: 'invitation', inviteId: value.inviteId })} />
        : <SharingHub onOpenCopy={diary => openCopyIfSafe(diary, invitationLeaveGuard.current, () => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }, enterEditor)} onOpenDiary={openSharedDiary} request={sharingRequest} runtime={sharing.runtime} model={sharing.notifications} onClose={() => { setSharingRequest(null); if(member)diaryState.store.reload().catch(error=>notify('공유 목록을 확인하지 못했어요',error.message)); }} />}
      {/* 폰 세로 화면은 노치·다이내믹 아일랜드 아래부터 그린다. 안전 영역은 바로 옆(아래) 화면과 같은 색으로 칠해 경계가 보이지 않게 한다. */}
      <View style={s.safe}>
        {isPhone && insets.top > 0 && <View style={{ height: insets.top, backgroundColor: safeAreaColors.top }} />}
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
    </>
  );
}
