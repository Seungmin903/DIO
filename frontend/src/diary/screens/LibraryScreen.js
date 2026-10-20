import { useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import CreateDiaryCard from '../components/CreateDiaryCard';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';

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
  onEdit,
  onCreate,
}) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const shown = diaries.filter((diary) =>
    filter === 'all'
      || (filter === 'personal' && diary.type === '개인')
      || (filter === 'favorite' && diary.favorite),
  );
  const label = FILTERS.find((item) => item.id === filter)?.label || '전체';
  const canCreate = filter === 'all';
  const carouselItems = canCreate ? [...shown, { id: 'new-diary' }] : shown;
  const activeIndex = Math.max(0, Math.min(carousel, Math.max(0, carouselItems.length - 1)));
  const carouselSidePadding = Math.max(0, (carouselViewportWidth - CAROUSEL_ITEM_WIDTH) / 2);

  const moveCarousel = (nextIndex) => {
    const next = Math.max(0, Math.min(nextIndex, carouselItems.length - 1));
    onCarouselChange(next);
    carouselRef.current?.scrollTo({ x: next * CAROUSEL_STEP, animated: true });
  };

  const syncCarouselIndex = ({ nativeEvent }) => {
    onCarouselChange(Math.max(0, Math.min(Math.round(nativeEvent.contentOffset.x / CAROUSEL_STEP), carouselItems.length - 1)));
  };

  const carouselMotion = (index) => ({
    zIndex: index === activeIndex ? 2 : 1,
    opacity: scrollX.interpolate({
      inputRange: [(index - 1) * CAROUSEL_STEP, index * CAROUSEL_STEP, (index + 1) * CAROUSEL_STEP],
      outputRange: [0.36, 1, 0.36],
      extrapolate: 'clamp',
    }),
    transform: [
      {
        scale: scrollX.interpolate({
          inputRange: [(index - 1) * CAROUSEL_STEP, index * CAROUSEL_STEP, (index + 1) * CAROUSEL_STEP],
          outputRange: [0.84, 1.06, 0.84],
          extrapolate: 'clamp',
        }),
      },
      {
        translateY: scrollX.interpolate({
          inputRange: [(index - 1) * CAROUSEL_STEP, index * CAROUSEL_STEP, (index + 1) * CAROUSEL_STEP],
          outputRange: [30, -12, 30],
          extrapolate: 'clamp',
        }),
      },
      { perspective: 900 },
      {
        rotateY: scrollX.interpolate({
          inputRange: [(index - 1) * CAROUSEL_STEP, index * CAROUSEL_STEP, (index + 1) * CAROUSEL_STEP],
          outputRange: ['8deg', '0deg', '-8deg'],
          extrapolate: 'clamp',
        }),
      },
    ],
  });

  return (
    <ScrollView contentContainerStyle={s.libraryScreen} showsVerticalScrollIndicator={false}>
      <View style={s.libraryHeader}>
        <Text style={s.libraryTitle}>내 다이어리</Text>
        <View style={s.libraryViewSwitch} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'carousel' }}
            onPress={() => onViewChange('carousel')}
            style={({ pressed }) => [s.libraryViewOption, view === 'carousel' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="swap" size={18} color="#40517D" />
            <Text style={s.libraryViewText}>스와이프</Text>
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: view === 'grid' }}
            onPress={() => onViewChange('grid')}
            style={({ pressed }) => [s.libraryViewOption, view === 'grid' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="grid" size={17} color="#40517D" />
            <Text style={s.libraryViewText}>한눈에</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.libraryToolbar}>
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
      </View>

      {!carouselItems.length ? (
        <EmptyState
          title={`${label} 다이어리가 없어요`}
          copy="다른 보관함을 보거나 새 다이어리를 만들어 보세요."
        />
      ) : view === 'carousel' ? (
        <View style={s.carouselShell}>
          <View style={s.carouselRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 다이어리"
              onPress={() => moveCarousel(activeIndex - 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowLeft, pressed && s.pressed]}
            >
              <AppIcon name="chevron-left" size={24} color="#0B1957" strokeWidth={2.1} />
            </Pressable>
            <Animated.ScrollView
              ref={carouselRef}
              horizontal
              directionalLockEnabled
              decelerationRate="fast"
              disableIntervalMomentum
              snapToInterval={CAROUSEL_STEP}
              snapToAlignment="start"
              contentOffset={{ x: activeIndex * CAROUSEL_STEP, y: 0 }}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              style={s.carouselViewport}
              contentContainerStyle={[s.carouselCards, { paddingHorizontal: carouselSidePadding, gap: CAROUSEL_GAP }]}
              onLayout={({ nativeEvent: { layout } }) => onCarouselViewportLayout(layout.width)}
              onScroll={Animated.event(
                [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                { useNativeDriver: true },
              )}
              onMomentumScrollEnd={syncCarouselIndex}
            >
              {carouselItems.map((item, index) => (
                item.id === 'new-diary' ? (
                  <CreateDiaryCard
                    key={item.id}
                    layout="carousel"
                    carouselActive={index === activeIndex}
                    animatedStyle={carouselMotion(index)}
                    onCreate={onCreate}
                  />
                ) : (
                  <DiaryCard
                    key={item.id}
                    diary={item}
                    layout="carousel"
                    carouselActive={index === activeIndex}
                    animatedStyle={carouselMotion(index)}
                    onOpen={() => onOpen(item)}
                    onFavorite={() => onFavorite(item.id)}
                    onEdit={() => onEdit(item)}
                  />
                )
              ))}
            </Animated.ScrollView>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 다이어리"
              onPress={() => moveCarousel(activeIndex + 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowRight, pressed && s.pressed]}
            >
              <AppIcon name="chevron-right" size={24} color="#0B1957" strokeWidth={2.1} />
            </Pressable>
          </View>
          <View style={s.carouselFoot}>
            <Text style={s.swipeHint}>← 옆으로 밀어 다이어리를 넘겨보세요 →</Text>
            <Text style={s.carouselCount}>{activeIndex + 1} / {carouselItems.length}</Text>
          </View>
        </View>
      ) : (
        <View style={s.grid}>
          {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} onOpen={() => onOpen(diary)} onFavorite={() => onFavorite(diary.id)} onEdit={() => onEdit(diary)} />)}
          {canCreate && <CreateDiaryCard layout="grid" onCreate={onCreate} />}
        </View>
      )}
    </ScrollView>
  );
}
