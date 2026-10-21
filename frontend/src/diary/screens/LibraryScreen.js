import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import CreateDiaryCard from '../components/CreateDiaryCard';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);

// 카드 위치(index)마다 스크롤 위치에 따라 투명도·크기·기울기가 바뀌는 애니메이션 스타일.
function carouselMotion(scrollX, index, step) {
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step];
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
  compact = false,
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
  onDelete,
  onCreate,
}) {
  const scrollX = useRef(new Animated.Value(Math.max(0, carousel) * CAROUSEL_STEP)).current;
  const carouselRef = useRef(null);
  const positioned = useRef(null);
  // 사이드 메뉴 애니메이션 중에는 매 프레임 바뀌므로 App이 아닌 이 화면 안에서만 들고 있는다.
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const shown = useMemo(() => diaries.filter((diary) =>
    (filter === 'personal')
      || (filter === 'favorite' && diary.favorite),
  ), [diaries, filter]);
  const current = FILTERS.find((item) => item.id === filter) || FILTERS[0];
  // 새로 만든 다이어리는 개인 다이어리로 들어가므로 만들기 카드는 개인 다이어리 탭에만 둔다.
  const canCreate = filter === 'personal';
  const carouselItems = useMemo(() => (canCreate ? [...shown, { id: 'new-diary' }] : shown), [canCreate, shown]);
  const itemCount = carouselItems.length;
  const carouselItemWidth = compact ? 202 : CAROUSEL_ITEM_WIDTH;
  const carouselGap = compact ? 24 : CAROUSEL_GAP;
  const carouselStep = compact ? carouselItemWidth + carouselGap : CAROUSEL_STEP;
  // 카드 수가 바뀔 때만 애니메이션 노드를 새로 만든다. 매 렌더마다 만들면 스와이프마다 모든 카드가 다시 연결된다.
  const motions = useMemo(
    () => Array.from({ length: itemCount }, (_, index) => carouselMotion(scrollX, index, carouselStep)),
    [carouselStep, itemCount, scrollX],
  );
  const activeIndex = Math.max(0, Math.min(carousel, Math.max(0, itemCount - 1)));
  const carouselSidePadding = Math.max(0, (carouselViewportWidth - carouselItemWidth) / 2);
  const fixedPhoneCarousel = compact && view === 'carousel' && carouselItems.length > 0;
  // 웹의 콘텐츠 크기 이벤트를 기다리지 않고 고정 카드·간격·양쪽 여백으로 이동 공간을 확보한다.
  const contentWidth = carouselSidePadding * 2 + itemCount * carouselItemWidth + Math.max(0, itemCount - 1) * carouselGap;
  const positionKey = index => [filter, view, carouselViewportWidth, contentWidth, index].join(':');
  const CarouselSeparator = useCallback(() => <View style={{ width: carouselGap }} />, [carouselGap]);

  // 뷰포트 측정 후 계산된 최소 너비가 배치되는 다음 프레임에 복귀 위치로 이동한다.
  useEffect(() => {
    if (view !== 'carousel' || carouselViewportWidth <= 0 || !itemCount) return undefined;
    const offset = activeIndex * carouselStep;
    const key = [filter, view, carouselViewportWidth, contentWidth, activeIndex].join(':');
    if (positioned.current === key) return undefined;
    const frame = requestAnimationFrame(() => {
      if (!carouselRef.current) return;
      carouselRef.current.scrollToOffset({ offset, animated: false });
      scrollX.setValue(offset);
      positioned.current = key;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, carouselStep, carouselViewportWidth, contentWidth, filter, itemCount, scrollX, view]);

  useEffect(() => {
    if (carousel !== activeIndex) onCarouselChange(activeIndex);
  }, [activeIndex, carousel, onCarouselChange]);

  const moveCarousel = (nextIndex) => {
    const next = Math.max(0, Math.min(nextIndex, itemCount - 1));
    positioned.current = positionKey(next);
    onCarouselChange(next);
    carouselRef.current?.scrollToOffset?.({ offset: next * carouselStep, animated: true });
  };

  const syncCarouselIndex = useCallback(({ nativeEvent }) => {
    const index = Math.max(0, Math.min(Math.round(nativeEvent.contentOffset.x / carouselStep), itemCount - 1));
    positioned.current = [filter, view, carouselViewportWidth, contentWidth, index].join(':');
    onCarouselChange(index);
  }, [carouselStep, carouselViewportWidth, contentWidth, filter, itemCount, onCarouselChange, view]);

  const measureCarousel = useCallback(({ nativeEvent: { layout } }) => {
    setCarouselViewportWidth((current) => (current === layout.width ? current : layout.width));
  }, []);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

  return (
    <ScrollView
      contentContainerStyle={[s.libraryScreen, compact && s.libraryScreenCompact, fixedPhoneCarousel && s.libraryScreenCarouselCompact]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!fixedPhoneCarousel}
    >
      <View style={[s.libraryHeader, compact && s.libraryHeaderCompact]}>
        <Text style={[s.libraryTitle, compact && s.libraryTitleCompact]}>{current.label}</Text>
        <View style={[s.libraryViewSwitch, compact && s.libraryViewSwitchCompact]} accessibilityRole="tablist">
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="스와이프 보기"
            accessibilityState={{ selected: view === 'carousel' }}
            onPress={() => onViewChange('carousel')}
            style={({ pressed }) => [s.libraryViewOption, compact && s.libraryViewOptionCompact, view === 'carousel' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="swap" size={18} color="#40517D" />
            {!compact && <Text style={s.libraryViewText}>스와이프</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="한눈에 보기"
            accessibilityState={{ selected: view === 'grid' }}
            onPress={() => onViewChange('grid')}
            style={({ pressed }) => [s.libraryViewOption, compact && s.libraryViewOptionCompact, view === 'grid' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="grid" size={17} color="#40517D" />
            {!compact && <Text style={s.libraryViewText}>한눈에</Text>}
          </Pressable>
        </View>
      </View>

      <View style={[s.libraryToolbar, compact && s.libraryToolbarCompact]}>
        <View style={s.filters}>
          {FILTERS.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === item.id }}
              onPress={() => onFilterChange(item.id)}
              style={({ pressed }) => [s.chip, compact && s.chipCompact, filter === item.id && s.chipSelected, pressed && s.pressed]}
            >
              <Text style={[s.chipText, compact && s.chipTextCompact, filter === item.id && s.chipTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {!carouselItems.length ? (
        <EmptyState compact={compact} title={current.empty} copy={current.emptyCopy} />
      ) : view === 'carousel' ? (
        <View style={[s.carouselShell, compact && s.carouselShellCompact]}>
          <View style={[s.carouselRow, compact && s.carouselRowCompact]}>
            {/* 폰은 화면이 좁아 화살표 대신 밀어서 넘긴다. */}
            {!compact && <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 다이어리"
              onPress={() => moveCarousel(activeIndex - 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowLeft, pressed && s.pressed]}
            >
              <AppIcon name="chevron-left" size={24} color="#0B1957" strokeWidth={2.1} />
            </Pressable>}
            <AnimatedFlatList
              ref={carouselRef}
              data={carouselItems}
              ItemSeparatorComponent={CarouselSeparator}
              keyExtractor={(item) => item.id}
              horizontal
              getItemLayout={(_, index) => ({ length: carouselItemWidth, offset: carouselSidePadding + index * carouselStep, index })}
              directionalLockEnabled
              decelerationRate="fast"
              disableIntervalMomentum
              snapToInterval={carouselStep}
              snapToAlignment="start"
              contentOffset={{ x: activeIndex * carouselStep, y: 0 }}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              style={s.carouselViewport}
              contentContainerStyle={[s.carouselCards, compact && s.carouselCardsCompact, { paddingHorizontal: carouselSidePadding, minWidth: contentWidth, gap: 0 }]}
              onLayout={measureCarousel}
              onScroll={onScroll}
              onMomentumScrollEnd={syncCarouselIndex}
              initialNumToRender={3}
              maxToRenderPerBatch={3}
              // 카드가 확대·기울기로 자기 영역 밖까지 그려져서 removeClippedSubviews는 쓰지 않는다.
              windowSize={5}
              renderItem={({ item, index }) => (
                item.id === 'new-diary' ? (
                  <CreateDiaryCard
                    key={item.id}
                    layout="carousel"
                    compact={compact}
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index]}
                    onCreate={onCreate}
                  />
                ) : (
                  <DiaryCard
                    key={item.id}
                    diary={item}
                    layout="carousel"
                    compact={compact}
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index]}
                    onOpen={onOpen}
                    onFavorite={onFavorite}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                )
              )}
            />
            {!compact && <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 다이어리"
              onPress={() => moveCarousel(activeIndex + 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowRight, pressed && s.pressed]}
            >
              <AppIcon name="chevron-right" size={24} color="#0B1957" strokeWidth={2.1} />
            </Pressable>}
          </View>
          <View style={[s.carouselFoot, compact && s.carouselFootCompact]}>
            <Text style={s.carouselCount}>{activeIndex + 1} / {carouselItems.length}</Text>
          </View>
        </View>
      ) : (
        <View style={[s.grid, compact && s.gridCompact]}>
          {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} compact={compact} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} />)}
          {canCreate && <CreateDiaryCard layout="grid" compact={compact} onCreate={onCreate} />}
        </View>
      )}
    </ScrollView>
  );
}

export default memo(LibraryScreen);
