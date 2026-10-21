import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import EditorScreen from './src/editor/screens/EditorScreen';
import { prepareEditor, rememberEditorDoc } from './src/editor/services/editorDocs';
import { DEFAULT_FILTER } from './src/diary/constants';
import { useDiaries } from './src/diary/hooks/useDiaries';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import SideRail from './src/diary/components/SideRail';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { styles as s } from './src/diary/styles';
import { confirmAction, notify } from './src/shared/dialogs';
import { fitTabletFrame } from './src/shared/layout';
import { normalizePaperAppearance } from './src/editor/templates/appearance.js';
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
    loaded,
    moveToTrash,
    restoreFromTrash,
    deletePermanently,
    renameDiary,
  } = useDiaries();
  const [active, setActive] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const pendingCreateId = useRef(null);

  const tablet = fitTabletFrame(viewport.width, viewport.height);

  // 편집 문서·첫 속지·사진을 기기 저장소에서 미리 준비한 뒤 편집기로 넘어가 로딩 화면이 보이지 않게 한다.
  // 준비가 늦어져도 정해진 시간 안에는 넘어가고, 그사이 다른 다이어리를 고르면 마지막 요청을 연다.
  const opening = useRef(null);
  const enterEditor = useCallback((diary) => {
    const request = {};
    opening.current = request;
    Promise.race([prepareEditor(diary), wait(EDITOR_PREPARE_LIMIT_MS)]).finally(() => {
      if (opening.current !== request) return;
      opening.current = null;
      setActive(diary);
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

  const remove = () => {
    if (savingRef.current) return;
    const diary = diaries.find((item) => item.id === editingDiaryId);
    if (!diary) return;

    confirmAction({
      title: '휴지통으로 옮길까요?',
      message: `“${diary.title}”는 휴지통에서 복원하거나 영구 삭제할 수 있어요.`,
      confirmLabel: '휴지통으로',
      onConfirm: () => {
        moveToTrash(diary.id);
        setActive((current) => (current?.id === diary.id ? null : current));
        setCreateOpen(false);
        setEditingDiaryId(null);
      },
    });
  };

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
        if (!await saveJSON(STORAGE_KEYS.diaries, [...diaries, diary])) throw new Error('보관함을 저장하지 못했어요. 다시 시도해 주세요.');
        rememberEditorDoc(STORAGE_KEYS.doc + ':' + diary.id, doc);
      } catch (failure) {
        return failure.message;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    setDiaries((current) => (original
      ? current.map((item) => (item.id === diary.id ? diary : item))
      : [...current, diary]));
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

  // 편집하던 다이어리를 모든 다이어리 목록에서 찾아 홈의 중심 카드로 복원한다.
  const returnToLibrary = useCallback(() => {
    const index = visibleDiaries.findIndex(diary => diary.id === active?.id);
    setFilter(DEFAULT_FILTER);
    setCarousel(Math.max(0, index));
    setPage('library');
  }, [active?.id, visibleDiaries]);

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
      onCreate={create}
    />
  ), [carousel, changeFilter, create, edit, favorite, filter, open, view, visibleDiaries]);

  // 저장된 목록을 읽기 전에는 빈 보관함 안내가 깜빡이지 않게 비워 둔다.
  let content = loaded ? libraryScreen : null;
  if (page === 'editor') {
    content = (
      <EditorScreen
        key={active?.id || 'new'}
        diary={active}
        onHome={returnToLibrary}
        onRenameDiary={(title) => active?.id && renameDiary(active.id, title)}
      />
    );
  } else if (page === 'trash') {
    content = (
      <TrashScreen
        diaries={trashedDiaries}
        onRestore={restoreFromTrash}
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
    content = <ProfileScreen diaries={visibleDiaries} />;
  }

  const measureViewport = ({ nativeEvent: { layout } }) => {
    const { width: nextWidth, height: nextHeight } = layout;
    setViewport((current) => (
      current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight }
    ));
  };

  return (
    <>
      <StatusBar hidden />
      <SafeAreaView style={s.safe} edges={['left', 'right']}>
        <View style={s.viewport} onLayout={measureViewport}>
          <View style={[s.app, { width: tablet.width, height: tablet.height }]}>
            {page === 'editor' ? content : (
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
                <View style={[s.workspace, { paddingBottom: insets.bottom }]}>
                  {content}
                  {createOpen && (
                    <DiaryCreateModal
                      key={editingDiaryId ?? 'new'}
                      diary={editingDiaryId ? diaries.find(item => item.id === editingDiaryId) : null}
                      saving={saving}
                      onSubmit={save}
                      onDelete={remove}
                      onCancel={() => { if (savingRef.current) return; setCreateOpen(false); setEditingDiaryId(null); }}
                    />
                  )}
                </View>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
