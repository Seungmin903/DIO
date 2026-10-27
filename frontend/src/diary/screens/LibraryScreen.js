import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS, C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import { styles as s } from '../styles';
import CreateDiaryCard from '../components/CreateDiaryCard';
import DiaryCard from '../components/DiaryCard';
import EmptyState from '../components/EmptyState';
import { toggleSelection, visibleSelection } from '../utils/diarySelection';
import IconButton from '../components/IconButton';
import LibrarySearchScreen from '../components/LibrarySearchScreen';
import { queryDiaries, SORT_OPTIONS } from '../utils/libraryQuery';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
// 줄 폭 변화가 이만큼 멈춰 있어야 새 폭으로 다시 그린다 (사이드 메뉴 애니메이션 240ms가 끝난 뒤).
const CAROUSEL_RESIZE_SETTLE_MS = 120;

// 카드 위치(index)마다 스크롤 위치에 따라 투명도·크기·높이가 바뀌는 애니메이션 스타일.
// 3D 기울기(rotateY)는 쓰지 않는다. 위를 기준으로 줄이면 기울기 축도 위로 가서 옆 카드 아랫변이 비뚤게 보인다.
function carouselMotion(scrollX, index, step) {
  const inputRange = [(index - 1) * step, index * step, (index + 1) * step];
  const along = (outputRange) => scrollX.interpolate({ inputRange, outputRange, extrapolate: 'clamp' });
  return {
    zIndex: 1,
    opacity: along([0.36, 1, 0.36]),
    // 카드 높이가 달라도(맨 끝 '새 다이어리' 카드는 정보 줄이 없어 짧다) 윗변이 한 줄에 오도록 위를 기준으로 줄이고 키운다.
    transformOrigin: 'center top',
    transform: [
      { scale: along([0.84, 1.06, 0.84]) },
      { translateY: along([30, -12, 30]) },
    ],
  };
}

function LibraryScreen({
  compact = false,
  diaries,
  metadata = {},
  sort = 'updated',
  onSortChange,
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
  railWidthRef = null, // 태블릿: 메뉴가 다 열리거나 닫혔을 때의 폭 (ref라 바뀌어도 다시 그리지 않는다)
  selection = null, // 관리 모드에서 고른 다이어리 id 목록. null이면 관리 모드가 아니다.
  onSelectionChange,
  onTrashSelected,
  trashing = false,
  remoteQuery = null, // API 경로에서만 검색 입력을 제어한다. 로컬 경로는 기존 상태를 사용한다.
  requestNotice = null,
  hasMore = false,
  suppressEmpty = false,
  historyKey,
}) {
  const scrollX = useRef(new Animated.Value(Math.max(0, carousel) * CAROUSEL_STEP)).current;
  const carouselRef = useRef(null);
  const positioned = useRef(null);
  // 사이드 메뉴 애니메이션 중에는 매 프레임 바뀌므로 App이 아닌 이 화면 안에서만 들고 있는다.
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const searchOpen = remoteQuery ? remoteQuery.searchOpen : localSearchOpen;
  const setSearchOpen = remoteQuery ? remoteQuery.onSearchOpenChange : setLocalSearchOpen;
  const query = remoteQuery ? remoteQuery.query : localQuery;
  const setQuery = remoteQuery ? remoteQuery.onQueryChange : setLocalQuery;
  const [optionsOpen, setOptionsOpen] = useState(false);
  const shown = useMemo(() => remoteQuery ? diaries : queryDiaries(diaries, { filter, query: searchOpen ? query : '', sort, metadata }), [diaries, filter, query, searchOpen, sort, metadata, remoteQuery]);
  const displayView = searchOpen ? 'grid' : view;
  const resetPosition = () => { positioned.current = null; onCarouselChange(0); };
  const current = FILTERS.find((item) => item.id === filter) || FILTERS[0];
  const selecting = selection !== null;
  // 보이는 다이어리만 선택으로 센다. 필터를 바꾸면 숨은 다이어리는 선택에서 빠진다.
  const manageable = useMemo(() => shown.filter(diary => diary.canManage !== false && diary.canDelete !== false), [shown]);
  const selected = useMemo(() => (selecting ? visibleSelection(selection, manageable) : []), [selecting, selection, manageable]);
  useEffect(() => {
    if (selecting && selected.length !== selection.length) onSelectionChange?.(selected);
  }, [onSelectionChange, selected, selecting, selection]);
  const toggleSelect = useCallback((diary) => {
    if (!trashing && diary.canManage !== false) onSelectionChange?.(toggleSelection(selected, diary.id));
  }, [onSelectionChange, selected, trashing]);
  const allSelected = manageable.length > 0 && selected.length === manageable.length;
  // 렌더링/스크롤 위치와 무관하게 현재 검색·필터 결과 전체를 대상으로 한다.
  const toggleAll = () => {
    if (!trashing && manageable.length) onSelectionChange?.(allSelected ? [] : manageable.map(diary => diary.id));
  };
  // 새로 만든 다이어리는 개인 다이어리로 들어가므로 만들기 카드는 개인 다이어리 탭에만 둔다. 관리 중에는 숨긴다.
  const canCreate = Boolean(onCreate) && filter === 'personal' && !searchOpen && !selecting;

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
  const fixedPhoneCarousel = compact && displayView === 'carousel' && carouselItems.length > 0;
  // 웹의 콘텐츠 크기 이벤트를 기다리지 않고 고정 카드·간격·양쪽 여백으로 이동 공간을 확보한다.
  const contentWidth = carouselSidePadding * 2 + itemCount * carouselItemWidth + Math.max(0, itemCount - 1) * carouselGap;
  const positionKey = index => [filter, view, carouselViewportWidth, contentWidth, index].join(':');
  const CarouselSeparator = useCallback(() => <View style={{ width: carouselGap }} />, [carouselGap]);

  // 뷰포트 측정 후 계산된 최소 너비가 배치되는 다음 프레임에 복귀 위치로 이동한다.
  useEffect(() => {
    if (displayView !== 'carousel' || carouselViewportWidth <= 0 || !itemCount) return undefined;
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
  }, [activeIndex, carouselStep, carouselViewportWidth, contentWidth, displayView, filter, itemCount, scrollX]);

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

  // 사이드 메뉴가 열리고 닫히는 동안 줄 폭이 매 프레임 바뀐다. 그때마다 화면을 다시 그리면 메뉴 애니메이션과
  // 같은 JS 스레드를 두고 다퉈 둘 다 끊긴다. 처음 잰 폭만 바로 쓰고, 이후 변화는 멈춘 뒤 한 번만 반영한다.
  // 태블릿은 목록 폭을 '줄 폭 + 메뉴 폭'으로 잡는다. 이 값은 메뉴를 열든 닫든 같아서, 메뉴를 움직여도 목록 폭이 바뀌지 않는다.
  // (열 때 목록이 좁아지면 Android 가로 스크롤이 잠깐 위치를 고쳐 잡으면서 끝에 한 번 흔들렸다)
  const settleTimer = useRef(null);
  useEffect(() => () => clearTimeout(settleTimer.current), []);
  const appliedWidth = useRef(0);
  const measureCarousel = useCallback(({ nativeEvent: { layout } }) => {
    const span = () => layout.width + (railWidthRef?.current ?? 0);
    const apply = () => {
      const width = span();
      if (width === appliedWidth.current) return;
      appliedWidth.current = width;
      setCarouselViewportWidth(width);
    };
    clearTimeout(settleTimer.current);
    if (span() === appliedWidth.current) return;
    if (appliedWidth.current > 0) settleTimer.current = setTimeout(apply, CAROUSEL_RESIZE_SETTLE_MS);
    else apply();
  }, [railWidthRef]);

  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true },
  ), [scrollX]);

  const optionsMenu = !selecting && <>
    <Pressable accessibilityRole="button" accessibilityLabel="보관함 옵션" accessibilityValue={{ text: SORT_OPTIONS.find(item => item.id === sort)?.label }} accessibilityState={{ expanded: optionsOpen }} onPress={() => setOptionsOpen(!optionsOpen)} style={({ pressed }) => [s.iconButton, pressed && s.pressed]}>
      <View style={s.librarySortIcon}><AppIcon name="more" size={21} color={C.ink} /></View>
    </Pressable>
    {optionsOpen && <View style={s.librarySortMenu} accessibilityLabel="보관함 옵션 목록">
      <View accessibilityRole="radiogroup" accessibilityLabel="정렬 기준">
        {SORT_OPTIONS.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: sort === item.id }} onPress={() => { onSortChange(item.id); setOptionsOpen(false); resetPosition(); }} style={({ pressed }) => [s.chip, s.librarySortOption, sort === item.id && s.chipSelected, pressed && s.pressed]}>
          <Text style={s.chipText}>{sort === item.id ? '✓ ' : ''}{item.label}</Text>
        </Pressable>)}
      </View>
      {onSelectionChange && manageable.length > 0 && (!searchOpen || query.trim()) && <>
        <View style={s.libraryOptionsDivider} />
        <Pressable accessibilityRole="button" accessibilityLabel="편집" onPress={() => { setOptionsOpen(false); onSelectionChange?.([]); }} style={({ pressed }) => [s.chip, s.librarySortOption, pressed && s.pressed]}>
          <Text style={s.chipText}>편집</Text>
        </Pressable>
      </>}
    </View>}
  </>;
  const selectionBar = selecting && <View style={s.selectBar} accessibilityRole="toolbar">
        <Text accessibilityLiveRegion="polite" style={s.selectCount}>{`${selected.length}개 선택됨`}</Text>
        <View style={s.selectActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hasMore ? (allSelected ? '불러온 항목 모두 해제' : '불러온 항목 모두 선택') : (allSelected ? '전체 해제' : '전체 선택')}
            accessibilityHint={`${hasMore ? '현재 불러온' : '현재 검색·필터 결과'} ${manageable.length}개에 적용해요`}
            accessibilityState={{ disabled: trashing || !manageable.length }}
            disabled={trashing || !manageable.length}
            onPress={toggleAll}
            style={({ pressed }) => [s.selectButton, (trashing || !manageable.length) && s.selectButtonDisabled, pressed && s.pressed]}
          >
            <Text style={s.selectButtonText}>{hasMore ? (allSelected ? '불러온 항목 모두 해제' : '불러온 항목 모두 선택') : (allSelected ? '전체 해제' : '전체 선택')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="편집 완료"
            disabled={trashing}
            onPress={() => onSelectionChange?.(null)}
            style={({ pressed }) => [s.selectButton, trashing && s.selectButtonDisabled, pressed && s.pressed]}
          >
            <Text style={s.selectButtonText}>완료</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`선택한 ${selected.length}개 휴지통으로 이동`}
            accessibilityState={{ disabled: !selected.length || trashing }}
            disabled={!selected.length || trashing}
            onPress={() => onTrashSelected?.(selected)}
            style={({ pressed }) => [s.selectButton, s.selectButtonDanger, (!selected.length || trashing) && s.selectButtonDisabled, pressed && s.pressed]}
          >
            <AppIcon name="trash" size={17} color={C.white} />
            <Text style={[s.selectButtonText, s.selectButtonTextDanger]}>{trashing ? '옮기는 중…' : '휴지통으로'}</Text>
          </Pressable>
        </View>
      </View>;

  if (searchOpen) return <LibrarySearchScreen
    compact={compact} query={query} onQueryChange={setQuery}
    onBack={() => {
      if (selecting) {
        if (!trashing) onSelectionChange?.(null);
        return;
      }
      setSearchOpen(false); setQuery(''); setOptionsOpen(false);
    }}
    diaries={shown} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete}
    metadata={metadata} optionsMenu={optionsMenu} selectionBar={selectionBar}
    selecting={selecting} selected={selected} onToggleSelect={toggleSelect}
    requestNotice={requestNotice} hasMore={hasMore} suppressEmpty={suppressEmpty} historyKey={historyKey}
  />;

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
            accessibilityState={{ selected: displayView === 'carousel' }}
            onPress={() => { setSearchOpen(false); setQuery(''); onViewChange('carousel'); resetPosition(); }}
            style={({ pressed }) => [s.libraryViewOption, compact && s.libraryViewOptionCompact, displayView === 'carousel' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="swap" size={18} color={C.inkSoft} />
            {!compact && <Text style={s.libraryViewText}>스와이프</Text>}
          </Pressable>
          <Pressable
            accessibilityRole="tab"
            accessibilityLabel="한눈에 보기"
            accessibilityState={{ selected: displayView === 'grid' }}
            onPress={() => { setSearchOpen(false); setQuery(''); onViewChange('grid'); resetPosition(); }}
            style={({ pressed }) => [s.libraryViewOption, compact && s.libraryViewOptionCompact, displayView === 'grid' && s.libraryViewOptionSelected, pressed && s.pressed]}
          >
            <AppIcon name="grid" size={17} color={C.inkSoft} />
            {!compact && <Text style={s.libraryViewText}>한눈에</Text>}
          </Pressable>
        </View>
      </View>

      <View style={[s.libraryToolbar, compact && s.libraryToolbarCompact, s.libraryToolbarWrap]}>
        <View style={s.filters}>
          {FILTERS.filter(item => !remoteQuery || item.id !== 'shared').map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="tab"
              accessibilityState={{ selected: filter === item.id }}
              onPress={() => { onFilterChange(item.id); resetPosition(); setOptionsOpen(false); }}
              style={({ pressed }) => [s.chip, compact && s.chipCompact, filter === item.id && s.chipSelected, pressed && s.pressed]}
            >
              <Text style={[s.chipText, compact && s.chipTextCompact, filter === item.id && s.chipTextSelected]}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
        {!selecting && <View style={s.libraryActions}>
          <IconButton label="다이어리 검색" iconName="search" onPress={() => { setSearchOpen(true); setQuery(''); setOptionsOpen(false); resetPosition(); }} />
          {optionsMenu}
        </View>}
      </View>
      {selectionBar}
      {requestNotice}

      {!carouselItems.length && suppressEmpty ? null : !carouselItems.length ? (
        <EmptyState compact={compact} title={current.empty} />
      ) : displayView === 'carousel' ? (
        <View style={[s.carouselShell, compact && s.carouselShellCompact]}>
          {/* 목록은 잰 폭으로 고정하고 줄 가운데에 둔다. 줄 폭이 바뀌어도 가운데 카드는 늘 줄 가운데에 머문다. */}
          <View style={[s.carouselRow, compact && s.carouselRowCompact]} onLayout={measureCarousel}>
            {/* 폰은 화면이 좁아 화살표 대신 밀어서 넘긴다. */}
            {!compact && <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 다이어리"
              onPress={() => moveCarousel(activeIndex - 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowLeft, pressed && s.pressed]}
            >
              <AppIcon name="chevron-left" size={24} color={C.ink} strokeWidth={2.1} />
            </Pressable>}
            <AnimatedFlatList
              ref={carouselRef}
              data={carouselItems}
              // 선택만 바뀌어도 카드 체크 표시를 다시 그린다.
              extraData={selected}
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
              style={[carouselViewportWidth > 0 ? [s.carouselViewportFixed, { width: carouselViewportWidth }] : s.carouselViewport]}
              contentContainerStyle={[s.carouselCards, compact && s.carouselCardsCompact, { paddingHorizontal: carouselSidePadding, minWidth: contentWidth, gap: 0 }]}
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
                    pageCount={metadata[item.id]?.pageCount}
                    layout="carousel"
                    compact={compact}
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index]}
                    onOpen={onOpen}
                    onFavorite={onFavorite}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    selecting={selecting}
                    selected={selected.includes(item.id)}
                    onToggleSelect={toggleSelect}
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
              <AppIcon name="chevron-right" size={24} color={C.ink} strokeWidth={2.1} />
            </Pressable>}
          </View>
          <View style={[s.carouselFoot, compact && s.carouselFootCompact]}>
            {/* 개수는 다이어리만 센다. 맨 끝 "새 다이어리" 카드에서는 비워 둔다 (줄 높이는 유지) */}
            <Text style={s.carouselCount}>{activeIndex < shown.length ? `${activeIndex + 1} / ${shown.length}` : ' '}</Text>
          </View>
        </View>
      ) : (
        <View style={[s.grid, compact && s.gridCompact]}>
          {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} pageCount={metadata[diary.id]?.pageCount} compact={compact} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete}
            selecting={selecting} selected={selected.includes(diary.id)} onToggleSelect={toggleSelect} />)}
          {canCreate && <CreateDiaryCard layout="grid" compact={compact} onCreate={onCreate} />}
        </View>
      )}
    </ScrollView>
  );
}

export default memo(LibraryScreen);
