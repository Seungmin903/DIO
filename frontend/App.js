import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Platform, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import EditorScreen from './src/editor/screens/EditorScreen';
import { prepareEditor, rememberEditorDoc } from './src/editor/services/editorDocs';
import { DEFAULT_FILTER } from './src/diary/constants';
import { useDiaries } from './src/diary/hooks/useDiaries';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import SideRail from './src/diary/components/SideRail';
import BottomTabs from './src/diary/components/BottomTabs';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { styles as s } from './src/diary/styles';
import { confirmAction, notify } from './src/shared/dialogs';
import { fitTabletFrame } from './src/shared/layout';
import { normalizePaperAppearance } from './src/editor/templates/appearance.js';
import { useFormFactor } from './src/shared/useFormFactor';
import { CAN_LOCK_ORIENTATION, useOrientationLock } from './src/shared/useOrientationLock';
import { normalizeTemplateConfig } from './src/editor/templates/creation.js';
import { createDefaultDoc } from './src/editor/state/defaultDoc.js';
import { saveJSON, STORAGE_KEYS } from './src/editor/services/storage';

// 속지 캐시(16개)를 넘지 않도록 앞쪽 다이어리만 미리 준비한다.
const PREFETCH_DIARIES = 8;
const PREFETCH_DELAY_MS = 400;
// 편집기 진입 전 준비를 기다리는 최대 시간. 보통은 이보다 훨씬 빨리 끝난다.
const EDITOR_PREPARE_LIMIT_MS = 500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  // 지난 실행에서 공유하고 남은 PDF 임시 파일을 정리한다. (공유 모듈은 불러오지 않는다)
  useEffect(() => { cleanupPdfShareCache().catch(() => {}) }, []);
  return (
    <SafeAreaProvider style={s.safe}>
      <DiaryApp />
    </SafeAreaProvider>
  );
}

function DiaryApp() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // 폰은 화면 전체를 쓰고, 태블릿만 16:10 프레임 안에 맞춘다. 데이터·상태는 두 배치가 함께 쓴다.
  const { isPhone, isLandscape } = useFormFactor();
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });
  const [page, setPage] = useState('library');
  const [railCollapsed, setRailCollapsed] = useState(true);
  // FILTERS에 없는 all을 초기값으로 쓰면 새 다이어리 카드가 제외되어 빈 안내만 보인다.
  const [filter, setFilter] = useState(DEFAULT_FILTER);
  const [view, setView] = useState('carousel');
  const [carousel, setCarousel] = useState(0);
  const {
    diaries,
    setDiaries,
    addDiary,
    loaded,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
    trashNow,
    trashError,
    cleanupTrash,
  } = useDiaries();
  const [active, setActive] = useState(null);
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
  const enterEditor = useCallback((diary) => {
    const request = {};
    opening.current = request;
    Promise.race([prepareEditor(diary), wait(EDITOR_PREPARE_LIMIT_MS)]).finally(() => {
      if (opening.current !== request) return;
      opening.current = null;
      setEditorOrientation(null);
      setActive(diary);
      setTabIds((current) => (current.includes(diary.id) ? current : [...current, diary.id]));
      setPage('editor');
    });
  }, []);
  const open = enterEditor;

  const favorite = useCallback((id) => {
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, favorite: !diary.favorite } : diary)));
    setActive((current) => (current?.id === id ? { ...current, favorite: !current.favorite } : current));
  }, [setDiaries]);

  const navigate = useCallback((next, nextFilter) => {
    if (next === 'library') {
      setFilter(nextFilter || DEFAULT_FILTER);
      setCarousel(0);
    }
    setPage(next);
  }, []);

  // 모든 화면 규격의 Android 시스템 뒤로가기: 시트 → 보조 화면 → 기본 보관함 순서로 한 단계씩 돌아간다.
  // 편집기는 열린 도구·패널을 먼저 닫아야 하므로 EditorScreen에서 별도로 처리한다.
  useEffect(() => {
    if (Platform.OS !== 'android' || page === 'editor') return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
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
  }, [createOpen, filter, isPhone, navigate, page, railCollapsed]);

  const create = useCallback(() => {
    if (savingRef.current) return;
    pendingCreateId.current = null;
    setEditingDiaryId(null);
    setCreateOpen(true);
  }, []);

  const edit = useCallback((diary) => {
    if (savingRef.current) return;
    setEditingDiaryId(diary.id);
    setCreateOpen(true);
  }, []);

  const moveDiaryToTrash = useCallback((diary) => {
    if (savingRef.current) return;
    if (!diary) return;

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
  }, [moveToTrash]);

  const save = async (form) => {
    if (savingRef.current) return;
    const title = form.title.trim();
    if (!title) return '다이어리 이름을 입력해 주세요.';

    const original = editingDiaryId ? diaries.find((diary) => diary.id === editingDiaryId) : null;
    if (editingDiaryId && !original) {
      return '수정할 다이어리를 찾지 못했어요. 목록에서 다시 시도해 주세요.';
    }

    let config;
    if (!original) {
      try { config = normalizeTemplateConfig(form.templateConfig, form.pageSize); }
      catch (failure) { return failure.message; }
    }
    const updatedAt = new Date().toISOString();
    const diary = original
      ? { ...original, title, color: form.color, pattern: form.pattern, updatedAt }
      : {
        id: pendingCreateId.current ?? `diary-${Date.now()}`,
        templateConfig: config,
        paperAppearance: normalizePaperAppearance(form.paperAppearance),
        title,
        color: form.color,
        pattern: form.pattern,
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
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    if (original) setDiaries((current) => current.map((item) => (item.id === diary.id ? diary : item)));
    setActive((current) => (current?.id === diary.id ? diary : current));
    setCreateOpen(false);
    setEditingDiaryId(null);
    if (!original) {
      setCarousel(0);
      enterEditor(diary);
    }
    return undefined;
  };

  const changeFilter = useCallback((nextFilter) => {
    setFilter(nextFilter);
    setCarousel(0);
  }, []);

  const visibleDiaries = useMemo(() => diaries.filter((diary) => !diary.trashedAt), [diaries]);
  const trashedDiaries = useMemo(() => diaries.filter((diary) => diary.trashedAt), [diaries]);

  // 열린 탭 (휴지통으로 간 다이어리는 뺀다)
  const tabs = useMemo(() => tabIds
    .map((id) => visibleDiaries.find((diary) => diary.id === id))
    .filter(Boolean)
    // 다이어리 목록의 표지 색 이름은 color (편집 문서에서는 coverColor)
    .map((diary) => ({ id: diary.id, title: diary.title, coverColor: diary.color })), [tabIds, visibleDiaries]);

  // 편집하던 다이어리를 모든 다이어리 목록에서 찾아 홈의 중심 카드로 복원한다.
  const returnToLibrary = useCallback(() => {
    const index = visibleDiaries.findIndex(diary => diary.id === active?.id);
    setFilter(DEFAULT_FILTER);
    setCarousel(Math.max(0, index));
    setPage('library');
  }, [active?.id, visibleDiaries]);

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
      diaries={visibleDiaries}
      filter={filter}
      view={view}
      carousel={carousel}
      onFilterChange={changeFilter}
      onViewChange={setView}
      onCarouselChange={setCarousel}
      onOpen={open}
      onFavorite={favorite}
      onEdit={edit}
      onDelete={moveDiaryToTrash}
      onCreate={create}
    />
  ), [carousel, changeFilter, create, edit, favorite, filter, isPhone, moveDiaryToTrash, open, view, visibleDiaries]);

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
        onRenameDiary={(title) => active?.id && renameDiary(active.id, title)}
        tabs={tabs}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
      />
    );
  } else if (page === 'trash') {
    content = (
      <TrashScreen
        compact={isPhone}
        diaries={trashedDiaries}
        now={trashNow}
        cleanupError={trashError}
        onRetryCleanup={cleanupTrash}
        onRestore={(id) => {
          if (!restoreFromTrash(id)) notify('복원할 수 없어요', '보관 기한이 지났거나 영구 삭제 중인 다이어리예요.');
        }}
        onDeletePermanently={(diary) => {
          confirmAction({
            title: '영구 삭제할까요?',
            message: `“${diary.title}”의 페이지와 로컬 기록은 복구할 수 없어요.`,
            confirmLabel: '영구 삭제',
            onConfirm: async () => {
              if (!await deletePermanently(diary.id)) notify('삭제하지 못했어요', '저장소를 확인한 뒤 다시 시도해 주세요.');
            },
          });
        }}
      />
    );
  } else if (page === 'profile') {
    content = <ProfileScreen compact={isPhone} diaries={visibleDiaries} />;
  }

  const measureViewport = ({ nativeEvent: { layout } }) => {
    const { width: nextWidth, height: nextHeight } = layout;
    setViewport((current) => (
      current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }
    ));
  };

  const createModal = createOpen && (
    <DiaryCreateModal
      key={editingDiaryId ?? 'new'}
      sheet={isPhone}
      bottomInset={insets.bottom}
      diary={editingDiaryId ? diaries.find(item => item.id === editingDiaryId) : null}
      saving={saving}
      onSubmit={save}
      onCancel={() => { if (savingRef.current) return; setCreateOpen(false); setEditingDiaryId(null); }}
    />
  );

  let shell;
  if (page === 'editor') {
    shell = content;
  } else if (isPhone) {
    // 폰: 사이드 메뉴 대신 하단 탭. 새 다이어리 시트는 탭까지 덮도록 셸 위에 띄운다.
    shell = (
      <View style={s.phoneShell}>
        <View style={s.workspace}>{content}</View>
        <BottomTabs page={page} filter={filter} navigate={navigate} bottomInset={insets.bottom} />
        {createModal}
      </View>
    );
  } else {
    shell = (
      <View style={s.shell}>
        <SideRail
          page={page}
          filter={filter}
          navigate={navigate}
          create={create}
          bottomInset={insets.bottom}
          collapsed={railCollapsed}
          onToggle={() => setRailCollapsed((current) => !current)}
        />
        <View style={s.workspace}>
          {content}
          {createModal}
        </View>
      </View>
    );
  }

  return (
    <>
      <StatusBar hidden />
      {/* 폰은 하단 탭에서 시스템 바 여백을 처리하고, 태블릿은 16:10 프레임 자체를 시스템 바 위에 둔다. */}
      <SafeAreaView style={s.safe} edges={isPhone ? ['top', 'left', 'right'] : ['left', 'right', 'bottom']}>
        <View style={s.viewport} onLayout={measureViewport}>
          <View style={[s.app, frame ? { width: frame.width, height: frame.height } : s.appFill]}>
            {shell}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
