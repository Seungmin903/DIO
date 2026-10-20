import { useCallback, useState } from 'react';
import { Alert, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorScreen from './src/editor/screens/EditorScreen';
import { useDiaries } from './src/diary/hooks/useDiaries';
import DiaryCreateModal from './src/diary/components/DiaryCreateModal';
import SideRail from './src/diary/components/SideRail';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import TrashScreen from './src/diary/screens/TrashScreen';
import { styles as s } from './src/diary/styles';
import { fitTabletFrame } from './src/shared/layout';

export default function App() {
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
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('carousel');
  const [carousel, setCarousel] = useState(0);
  const { diaries, setDiaries, loaded } = useDiaries();
  const [active, setActive] = useState(null);
  // null이면 모달 닫힘, { diary: null }이면 새로 만들기, { diary }면 수정.
  const [form, setForm] = useState(null);

  const tablet = fitTabletFrame(viewport.width, viewport.height);

  // 하위 컴포넌트가 memo로 다시 그리기를 건너뛸 수 있도록 콜백은 안정된 참조로 유지한다.
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
      setFilter(nextFilter || 'all');
      setCarousel(0);
    }
    setPage(next);
  }, []);

  const goHome = useCallback(() => navigate('library', 'all'), [navigate]);
  const create = useCallback(() => setForm({ diary: null }), []);
  const edit = useCallback((diary) => setForm({ diary }), []);
  const closeForm = useCallback(() => setForm(null), []);
  const toggleRail = useCallback(() => setRailCollapsed((current) => !current), []);
  const changeFilter = useCallback((nextFilter) => {
    setFilter(nextFilter);
    setCarousel(0);
  }, []);

  const editingDiary = form?.diary || null;

  const remove = useCallback(() => {
    if (!editingDiary) return;

    Alert.alert(
      '다이어리를 삭제할까요?',
      `“${editingDiary.title}”와 연결된 로컬 기록을 삭제합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setDiaries((current) => current.filter((item) => item.id !== editingDiary.id));
            setActive((current) => (current?.id === editingDiary.id ? null : current));
            setForm(null);
          },
        },
      ],
    );
  }, [editingDiary, setDiaries]);

  // 저장에 실패하면 모달에 보여줄 오류 문구를 돌려준다.
  const save = useCallback(({ title, color, pattern, pageSize, firstPage }) => {
    const original = editingDiary ? diaries.find((diary) => diary.id === editingDiary.id) : null;
    if (editingDiary && !original) return '수정할 다이어리를 찾지 못했어요. 목록에서 다시 시도해 주세요.';

    const updatedAt = new Date().toISOString();
    const diary = original
      // 페이지 크기·첫 페이지 서식은 만들 때만 정한다.
      ? { ...original, title, color, pattern, updatedAt }
      : {
        id: `diary-${Date.now()}`,
        title,
        color,
        pattern,
        pageSize,
        firstPage,
        type: '개인',
        favorite: false,
        updatedAt,
      };
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    setDiaries((current) => (original
      ? current.map((item) => (item.id === diary.id ? diary : item))
      : [...current, diary]));
    setActive((current) => (current?.id === diary.id ? diary : current));
    setForm(null);
    if (!original) {
      setActive(diary);
      setCarousel(0);
      setPage('editor');
    }
    return null;
  }, [diaries, editingDiary, setDiaries]);

  const libraryScreen = (
    <LibraryScreen
      diaries={diaries}
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
  );

  // 저장된 목록을 읽기 전에는 빈 보관함 안내가 깜빡이지 않게 비워 둔다.
  let content = loaded ? libraryScreen : null;
  if (page === 'editor') {
    content = <EditorScreen key={active?.id || 'new'} diary={active} onHome={goHome} />;
  } else if (page === 'trash') {
    content = <TrashScreen />;
  } else if (page === 'profile') {
    content = <ProfileScreen diaries={diaries} />;
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
                  onToggle={toggleRail}
                />
                <View style={[s.workspace, { paddingBottom: insets.bottom }]}>
                  {content}
                  {form && (
                    <DiaryCreateModal
                      diary={editingDiary}
                      onSubmit={save}
                      onDelete={remove}
                      onCancel={closeForm}
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
