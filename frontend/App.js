import { useCallback, useEffect, useMemo, useState } from 'react';
import { StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { cleanupPdfShareCache } from './src/editor/utils/savePdfFile';
import EditorScreen from './src/editor/screens/EditorScreen';
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
  const [editingDiary, setEditingDiary] = useState(null);

  const tablet = fitTabletFrame(viewport.width, viewport.height);

  const open = useCallback((diary) => {
    setActive(diary);
    setPage('editor');
  }, []);

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
    setEditingDiary(null);
    setCreateOpen(true);
  }, []);

  const edit = useCallback((diary) => {
    setEditingDiary(diary);
    setCreateOpen(true);
  }, []);

  const remove = () => {
    const diary = diaries.find((item) => item.id === editingDiary?.id);
    if (!diary) return;

    confirmAction({
      title: '휴지통으로 옮길까요?',
      message: `“${diary.title}”는 휴지통에서 복원하거나 영구 삭제할 수 있어요.`,
      confirmLabel: '휴지통으로',
      onConfirm: () => {
        moveToTrash(diary.id);
        setActive((current) => (current?.id === diary.id ? null : current));
        setCreateOpen(false);
        setEditingDiary(null);
      },
    });
  };

  const save = (values) => {
    const original = editingDiary ? diaries.find((diary) => diary.id === editingDiary.id) : null;
    if (editingDiary && !original) return '수정할 다이어리를 찾지 못했어요. 목록에서 다시 시도해 주세요.';

    const updatedAt = new Date().toISOString();
    const diary = original
      ? { ...original, ...values, firstPage: original.firstPage, firstPageDate: original.firstPageDate, updatedAt }
      : {
        id: `diary-${Date.now()}`,
        ...values,
        type: '개인',
        favorite: false,
        updatedAt,
        trashedAt: null,
      };
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    setDiaries((current) => (original
      ? current.map((item) => (item.id === diary.id ? diary : item))
      : [...current, diary]));
    setActive((current) => (current?.id === diary.id ? diary : current));
    setCreateOpen(false);
    setEditingDiary(null);
    if (!original) {
      setActive(diary);
      setCarousel(0);
      setPage('editor');
    }
    return undefined;
  };

  const changeFilter = useCallback((nextFilter) => {
    setFilter(nextFilter);
    setCarousel(0);
  }, []);

  const visibleDiaries = useMemo(() => diaries.filter((diary) => !diary.trashedAt), [diaries]);
  const trashedDiaries = useMemo(() => diaries.filter((diary) => diary.trashedAt), [diaries]);

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
        onHome={() => navigate('library', DEFAULT_FILTER)}
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
                      key={editingDiary?.id ?? 'new'}
                      diary={editingDiary}
                      onSubmit={save}
                      onDelete={remove}
                      onCancel={() => { setCreateOpen(false); setEditingDiary(null); }}
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
