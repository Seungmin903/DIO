import { Pressable, ScrollView, Text, View } from 'react-native';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS } from '../constants';
import { styles as s } from '../styles';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';
import Header from '../components/Header';
import IconButton from '../components/IconButton';

export default function LibraryScreen({
  diaries,
  filter,
  view,
  carousel,
  carouselRef,
  carouselViewportWidth,
  onFilterChange,
  onViewChange,
  onCarouselChange,
  onCarouselViewportLayout,
  onOpen,
  onFavorite,
  onCreate,
  onSearch,
}) {
  const shown = diaries.filter((diary) =>
    filter === 'all'
      || (filter === 'personal' && diary.type === '개인')
      || (filter === 'shared' && diary.type === '공유')
      || (filter === 'favorite' && diary.favorite),
  );
  const label = FILTERS.find((item) => item.id === filter)?.label || '전체';
  const activeIndex = Math.max(0, Math.min(carousel, Math.max(0, shown.length - 1)));
  const carouselSidePadding = Math.max(0, (carouselViewportWidth - CAROUSEL_ITEM_WIDTH) / 2);

  const moveCarousel = (nextIndex) => {
    const next = Math.max(0, Math.min(nextIndex, shown.length - 1));
    onCarouselChange(next);
    carouselRef.current?.scrollTo({ x: next * CAROUSEL_STEP, animated: true });
  };

  const syncCarouselIndex = ({ nativeEvent }) => {
    onCarouselChange(Math.max(0, Math.min(Math.round(nativeEvent.contentOffset.x / CAROUSEL_STEP), shown.length - 1)));
  };

  return (
    <ScrollView contentContainerStyle={s.screen} showsVerticalScrollIndicator={false}>
      <Header
        eyebrow="MY DIARY LIBRARY"
        title="내 다이어리"
        right={(
          <View style={s.headerActions}>
            <IconButton label="검색" icon="⌕" onPress={onSearch} />
            <Pressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [s.headerCreate, pressed && s.pressed]}>
              <Text style={s.headerCreateText}>+ 새 다이어리</Text>
            </Pressable>
          </View>
        )}
      />

      <View style={s.toolbar}>
        <View style={s.filters}>
          {FILTERS.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === item.id }}
              onPress={() => onFilterChange(item.id)}
              style={({ pressed }) => [s.chip, filter === item.id && s.chipSelected, pressed && s.pressed]}
            >
              <Text style={[s.chipText, filter === item.id && s.chipTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        <View style={s.viewSwitch}>
          <IconButton label="스와이프 보기" icon="▤" compact selected={view === 'carousel'} onPress={() => onViewChange('carousel')} />
          <IconButton label="한눈에 보기" icon="▦" compact selected={view === 'grid'} onPress={() => onViewChange('grid')} />
        </View>
      </View>

      {!shown.length ? (
        <EmptyState
          title={filter === 'all' ? '아직 만든 다이어리가 없어요' : `${label} 다이어리가 없어요`}
          copy={filter === 'all' ? '첫 표지를 만들면 이 보관함에 차곡차곡 쌓여요.' : '다른 보관함을 보거나 새 다이어리를 만들어 보세요.'}
          onCreate={filter === 'all' ? onCreate : null}
        />
      ) : view === 'carousel' ? (
        <View style={s.carouselShell}>
          <View style={s.carouselInfo}>
            <Text style={s.carouselHint}>표지를 눌러 다이어리를 열어 보세요</Text>
            <Text style={s.carouselCount}>{activeIndex + 1} / {shown.length}</Text>
          </View>
          <View style={s.carouselRow}>
            <IconButton label="이전 다이어리" icon="‹" onPress={() => moveCarousel(activeIndex - 1)} />
            <ScrollView
              ref={carouselRef}
              horizontal
              directionalLockEnabled
              decelerationRate="fast"
              disableIntervalMomentum
              snapToInterval={CAROUSEL_STEP}
              snapToAlignment="start"
              contentOffset={{ x: activeIndex * CAROUSEL_STEP, y: 0 }}
              showsHorizontalScrollIndicator={false}
              style={s.carouselViewport}
              contentContainerStyle={[s.carouselCards, { paddingHorizontal: carouselSidePadding, gap: CAROUSEL_GAP }]}
              onLayout={({ nativeEvent: { layout } }) => onCarouselViewportLayout(layout.width)}
              onMomentumScrollEnd={syncCarouselIndex}
            >
              {shown.map((diary, index) => (
                <DiaryCard
                  key={diary.id}
                  diary={diary}
                  layout="carousel"
                  carouselActive={index === activeIndex}
                  onOpen={() => onOpen(diary)}
                  onFavorite={() => onFavorite(diary.id)}
                />
              ))}
            </ScrollView>
            <IconButton label="다음 다이어리" icon="›" onPress={() => moveCarousel(activeIndex + 1)} />
          </View>
          <View style={s.carouselFoot}>
            <Text style={s.swipeHint}>← 옆으로 밀어 다이어리를 넘겨보세요 →</Text>
            <View style={s.carouselDots}>
              {shown.map((diary, index) => <View key={diary.id} style={[s.carouselDot, index === activeIndex && s.carouselDotActive]} />)}
            </View>
          </View>
        </View>
      ) : (
        <View style={s.grid}>
          {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} onOpen={() => onOpen(diary)} onFavorite={() => onFavorite(diary.id)} />)}
        </View>
      )}
    </ScrollView>
  );
}
