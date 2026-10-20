import { useRef, useState } from 'react';
import { StatusBar, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import EditorScreen from './src/editor/screens/EditorScreen';
import { COLORS } from './src/diary/constants';
import SideRail from './src/diary/components/SideRail';
import DiaryDetailScreen from './src/diary/screens/DiaryDetailScreen';
import DiaryFormScreen from './src/diary/screens/DiaryFormScreen';
import LibraryScreen from './src/diary/screens/LibraryScreen';
import ProfileScreen from './src/diary/screens/ProfileScreen';
import SearchScreen from './src/diary/screens/SearchScreen';
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
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState('carousel');
  const [carousel, setCarousel] = useState(0);
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const [diaries, setDiaries] = useState([]);
  const [active, setActive] = useState(null);
  const [query, setQuery] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formColor, setFormColor] = useState(COLORS[0].value);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');

  const tablet = fitTabletFrame(viewport.width, viewport.height);

  const open = (diary) => {
    setActive(diary);
    setPage('detail');
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
    setEditingId(null);
    setFormTitle('');
    setFormColor(COLORS[0].value);
    setError('');
    setPage('create');
  };

  const editCover = () => {
    if (!active) return;
    setEditingId(active.id);
    setFormTitle(active.title);
    setFormColor(active.color);
    setError('');
    setPage('cover');
  };

  const save = () => {
    const title = formTitle.trim();
    if (!title) {
      setError('다이어리 이름을 입력해 주세요.');
      return;
    }

    if (editingId) {
      const next = { ...active, title, color: formColor, updatedAt: '방금 전' };
      setDiaries((current) => current.map((diary) => (diary.id === editingId ? next : diary)));
      setActive(next);
      setPage('detail');
      return;
    }

    const diary = {
      id: `diary-${Date.now()}`,
      title,
      color: formColor,
      type: '개인',
      favorite: false,
      updatedAt: '방금 전',
    };
    setDiaries((current) => [diary, ...current]);
    setActive(diary);
    setCarousel(0);
    setPage('detail');
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
      onCreate={create}
      onSearch={() => setPage('search')}
    />
  );

  let content = libraryScreen;
  if (page === 'editor') {
    content = <EditorScreen key={active?.id || 'new'} diary={active} onHome={() => navigate('library', 'all')} />;
  } else if (page === 'search') {
    content = <SearchScreen diaries={diaries} query={query} onQueryChange={setQuery} onOpen={open} onFavorite={favorite} onCreate={create} onClose={() => navigate('library', 'all')} />;
  } else if (page === 'create' || page === 'cover') {
    const editing = page === 'cover';
    content = (
      <DiaryFormScreen
        editing={editing}
        title={formTitle}
        color={formColor}
        error={error}
        onTitleChange={(value) => { setFormTitle(value); setError(''); }}
        onColorChange={setFormColor}
        onSave={save}
        onCancel={() => setPage(editing ? 'detail' : 'library')}
      />
    );
  } else if (page === 'detail' && active) {
    content = <DiaryDetailScreen diary={active} onBack={() => navigate('library', 'all')} onEditCover={editCover} onFavorite={() => favorite(active.id)} onOpenEditor={() => setPage('editor')} />;
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
                <View style={[s.workspace, { paddingBottom: insets.bottom }]}>{content}</View>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
}
