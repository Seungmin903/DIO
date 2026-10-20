import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import CreateDiaryCard from '../components/CreateDiaryCard';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';

// 카드 위치(index)마다 스크롤 위치에 따라 투명도·크기·기울기가 바뀌는 애니메이션 스타일.
function carouselMotion(scrollX, index) {
  const inputRange = [(index - 1) * CAROUSEL_STEP, index * CAROUSEL_STEP, (index + 1) * CAROUSEL_STEP];
  const along = (outputRange) => scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  return {
    zIndex: 1,
    opacity: along([0.36, 1, 0.36]),
    transform: [
      { scale: along([0.84, 1.06, 0.84]) },
      { translateY: along([30, -12, 30]) },
      { perspective: 900 },
      { rotateY: along(['8deg', '0deg', '-8deg']) },
    ],
  };
}

function LibraryScreen({
  diaries,
  filter,
  view,
  carousel,
  onFilterChange,
  onViewChange,
  onCarouselChange,
  onOpen,
  onFavorite,
  onEdit,
  onCreate,
}) {
  const scrollX = useRef(new Animated.Value(0)).current;
  const carouselRef = useRef(null);
  // 사이드 메뉴 애니메이션 중에는 매 프레임 바뀌므로 App이 아닌 이 화면 안에서만 들고 있는다.
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const shown = useMemo(() => diaries.filter((diary) =>
    filter === 'all'
      || (filter === 'personal' && diary.type === '개인')
      || (filter === 'favorite' && diary.favorite),
  ), [diaries, filter]);
  const label = FILTERS.find((item) => item.id === filter)?.label || '전체';
  const canCreate = filter === 'all';
  const carouselItems = useMemo(() => (canCreate ? [...shown, { id: 'new-diary' }] : shown), [canCreate, shown]);
  const itemCount = carouselItems.length;
  // 카드 수가 바뀔 때만 애니메이션 노드를 새로 만든다. 매 렌더마다 만들면 스와이프마다 모든 카드가 다시 연결된다.
  const motions = useMemo(
    () => Array.from({ length: itemCount }, (_, index) => carouselMotion(scrollX, index)),
    [itemCount, scrollX],
  );
  const activeIndex = Math.max(0, Math.min(carousel, Math.max(0, itemCount - 1)));
  const carouselSidePadding = Math.max(0, (carouselViewportWidth - CAROUSEL_ITEM_WIDTH) / 2);

  const moveCarousel = (nextIndex) => {
    const next = Math.max(0, Math.min(nextIndex, itemCount - 1));
    onCarouselChange(next);
    carouselRef.current?.scrollTo({ x: next * CAROUSEL_STEP, animated: true });
  };

  const syncCarouselIndex = useCallback(({ nativeEvent }) => {
    onCarouselChange(Math.max(0, Math.min(Math.round(nativeEvent.contentOffset.x / CAROUSEL_STEP), itemCount - 1)));
  }, [itemCount, onCarouselChange]);

  const measureCarousel = useCallback(({ nativeEvent: { layout } }) => {
    setCarouselViewportWidth((current) => (current === layout.width ? current : layout.width));
  }, []);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

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
              onLayout={measureCarousel}
              onScroll={onScroll}
              onMomentumScrollEnd={syncCarouselIndex}
            >
              {carouselItems.map((item, index) => (
                item.id === 'new-diary' ? (
                  <CreateDiaryCard
                    key={item.id}
                    layout="carousel"
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index]}
                    onCreate={onCreate}
                  />
                ) : (
                  <DiaryCard
                    key={item.id}
                    diary={item}
                    layout="carousel"
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index]}
                    onOpen={onOpen}
                    onFavorite={onFavorite}
                    onEdit={onEdit}
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
          {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} />)}
          {canCreate && <CreateDiaryCard layout="grid" onCreate={onCreate} />}
        </View>
      )}
    </ScrollView>
  );
}

export default memo(LibraryScreen);
