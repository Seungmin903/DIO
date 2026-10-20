import { useRef, useState } from 'react';
import { Alert, StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorScreen from './src/editor/screens/EditorScreen';
import { COLORS } from './src/diary/constants';
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
  const carouselRef = useRef(null);
  const [viewport, setViewport] = useState({ width: windowWidth, height: windowHeight });
  const [page, setPage] = useState('library');
  const [railCollapsed, setRailCollapsed] = useState(true);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('carousel');
  const [carousel, setCarousel] = useState(0);
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const { diaries, setDiaries, loaded } = useDiaries();
  const [active, setActive] = useState(null);
  const [formTitle, setFormTitle] = useState('');
  const [formColor, setFormColor] = useState(COLORS[0].value);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingDiaryId, setEditingDiaryId] = useState(null);

  const tablet = fitTabletFrame(viewport.width, viewport.height);

  const open = (diary) => {
    setActive(diary);
    setPage('editor');
  };

  const favorite = (id) => {
    setDiaries((current) => current.map((diary) => (diary.id === id ? { ...diary, favorite: !diary.favorite } : diary)));
    setActive((current) => (current?.id === id ? { ...current, favorite: !current.favorite } : current));
  };

  const navigate = (next, nextFilter) => {
    if (next === 'library') {
      setFilter(nextFilter || 'all');
      setCarousel(0);
    }
    setPage(next);
  };

  const create = () => {
    setFormTitle('');
    setFormColor(COLORS[0].value);
    setError('');
    setEditingDiaryId(null);
    setCreateOpen(true);
  };

  const edit = (diary) => {
    setFormTitle(diary.title);
    setFormColor(diary.color);
    setError('');
    setEditingDiaryId(diary.id);
    setCreateOpen(true);
  };

  const remove = () => {
    const diary = diaries.find((item) => item.id === editingDiaryId);
    if (!diary) return;

    Alert.alert(
      '다이어리를 삭제할까요?',
      `“${diary.title}”와 연결된 로컬 기록을 삭제합니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => {
            setDiaries((current) => current.filter((item) => item.id !== diary.id));
            setActive((current) => (current?.id === diary.id ? null : current));
            setCreateOpen(false);
            setEditingDiaryId(null);
          },
        },
      ],
    );
  };

  const save = () => {
    const title = formTitle.trim();
    if (!title) {
      setError('다이어리 이름을 입력해 주세요.');
      return;
    }

    const original = editingDiaryId ? diaries.find((diary) => diary.id === editingDiaryId) : null;
    if (editingDiaryId && !original) {
      setError('수정할 다이어리를 찾지 못했어요. 목록에서 다시 시도해 주세요.');
      return;
    }

    const updatedAt = new Date().toISOString();
    const diary = original
      ? { ...original, title, color: formColor, updatedAt }
      : {
        id: `diary-${Date.now()}`,
        title,
        color: formColor,
        type: '개인',
        favorite: false,
        updatedAt,
      };
    // 먼저 만든 다이어리가 앞(왼쪽)에 오도록 새 다이어리는 뒤에 붙인다.
    setDiaries((current) => (original
      ? current.map((item) => (item.id === diary.id ? diary : item))
      : [...current, diary]));
    setActive((current) => (current?.id === diary.id ? diary : current));
    setCreateOpen(false);
    setEditingDiaryId(null);
    if (!original) {
      setActive(diary);
      setCarousel(0);
      setPage('editor');
    }
  };

  const libraryScreen = (
    <LibraryScreen
      diaries={diaries}
      filter={filter}
      view={view}
      carousel={carousel}
      carouselRef={carouselRef}
      carouselViewportWidth={carouselViewportWidth}
      onFilterChange={(nextFilter) => { setFilter(nextFilter); setCarousel(0); }}
      onViewChange={setView}
      onCarouselChange={setCarousel}
      onCarouselViewportLayout={setCarouselViewportWidth}
      onOpen={open}
      onFavorite={favorite}
      onEdit={edit}
      onCreate={create}
    />
  );

  // 저장된 목록을 읽기 전에는 빈 보관함 안내가 깜빡이지 않게 비워 둔다.
  let content = loaded ? libraryScreen : null;
  if (page === 'editor') {
    content = <EditorScreen key={active?.id || 'new'} diary={active} onHome={() => navigate('library', 'all')} />;
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
                  onToggle={() => setRailCollapsed((current) => !current)}
                />
                <View style={[s.workspace, { paddingBottom: insets.bottom }]}>
                  {content}
                  {createOpen && (
                    <DiaryCreateModal
                      title={formTitle}
                      color={formColor}
                      error={error}
                      editing={Boolean(editingDiaryId)}
                      onTitleChange={(value) => { setFormTitle(value); setError(''); }}
                      onColorChange={setFormColor}
                      onSave={save}
                      onDelete={remove}
                      onCancel={() => { setCreateOpen(false); setError(''); setEditingDiaryId(null); }}
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
