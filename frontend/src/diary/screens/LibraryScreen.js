import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, FlatList, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import PopoverMenu from '../components/PopoverMenu';
import FadeScroll, { CANVAS_FADE_RGB } from '../../editor/components/controls/FadeScroll';
import { CAROUSEL_GAP, CAROUSEL_ITEM_WIDTH, CAROUSEL_STEP, FILTERS, LIBRARY_SCOPES, C } from '../constants';
import AppIcon from '../../shared/AppIcon';
import FavoriteStar from '../../shared/FavoriteStar';
import { styles as s } from '../styles';
import DiaryCard from '../components/DiaryCard';
import EmptyState, { LoadingSpot } from '../components/EmptyState';
import { toggleSelection, visibleSelection } from '../utils/diarySelection';
import IconButton from '../components/IconButton';
import PhoneBell from '../components/PhoneBell';
import SelectionBar from '../components/SelectionBar';
import SelectionButton from '../components/SelectionButton';
import LibrarySearchScreen from '../components/LibrarySearchScreen';
import { emptyGuestImportAction, filterFavorite, filterScope, nextSort, parseSort, queryDiaries, SORT_OPTIONS, withFavorite } from '../utils/libraryQuery';
import OpenBookShelf, { preloadOpenBooks } from '../components/OpenBookShelf';
import { useDiaryGrid } from '../utils/useDiaryGrid';
import { carouselMotion } from '../utils/carouselFollow';

const AnimatedFlatList = Animated.createAnimatedComponent(FlatList);
// 보관함 세 보기
const LIBRARY_VIEWS = [{ id: 'open', label: '펼쳐서', icon: 'book-open' }, { id: 'carousel', label: '스와이프', icon: 'swap' }, { id: 'grid', label: '한눈에', icon: 'grid' }];
// 줄 폭 변화가 이만큼 멈춰 있어야 새 폭으로 다시 그린다 (사이드 메뉴 애니메이션 240ms가 끝난 뒤).
const CAROUSEL_RESIZE_SETTLE_MS = 120;
// 버튼으로 한 칸 넘기는 부드러운 스크롤이 끝나기를 기다리는 시간(스크롤 끝 이벤트가 없을 때의 보험)
const CAROUSEL_MOVE_MS = 450;
const PORTRAIT_ITEM_WIDTH = 440; // styles.cardCarouselLarge 와 같은 값

function LibraryScreen({
  compact = false,
  portrait = false, // 태블릿을 세로로 든 상태: 격자는 한 줄 3권, 스와이프는 옆 카드 없이 한 권만 크게

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
  onShare, // 다이어리 ⋯ 말풍선의 `공유`. 없으면 그 줄을 두지 않는다
  onCreate,
  guestImport = null,
  railWidthRef = null, // 태블릿: 메뉴가 다 열리거나 닫혔을 때의 폭 (ref라 바뀌어도 다시 그리지 않는다)
  selection = null, // 관리 모드에서 고른 다이어리 id 목록. null이면 관리 모드가 아니다.
  onSelectionChange,
  onTrashSelected,
  trashing = false,
  remoteQuery = null, // API 경로에서만 검색 입력을 제어한다. 로컬 경로는 기존 상태를 사용한다.
  requestNotice = null,
  centeredNotice = null,
  hasMore = false,
  suppressEmpty = false,
  loading = false, // 결과가 아직 없으면 보관함 틀 안에 스피너를 표시한다.
  historyKey,
}) {
  // 책상은 태블릿(compact 아님)에서만 보인다. 어두운 시각에는 상판 위 제목을 흰색으로 쓴다.
  const scrollX = useRef(new Animated.Value(Math.max(0, carousel) * CAROUSEL_STEP)).current;
  const carouselRef = useRef(null);
  const positioned = useRef(null);
  // 폭을 재고 첫 위치를 잡기 전에는 카드가 왼쪽 끝에 그려졌다가 가운데로 튄다. 자리가 잡힐 때까지 숨긴다.
  const [landed, setLanded] = useState(false);
  // 사이드 메뉴 애니메이션 중에는 매 프레임 바뀌므로 App이 아닌 이 화면 안에서만 들고 있는다.
  const [carouselViewportWidth, setCarouselViewportWidth] = useState(0);
  const [localSearchOpen, setLocalSearchOpen] = useState(false);
  const [localQuery, setLocalQuery] = useState('');
  const searchOpen = remoteQuery ? remoteQuery.searchOpen : localSearchOpen;
  const setSearchOpen = remoteQuery ? remoteQuery.onSearchOpenChange : setLocalSearchOpen;
  const query = remoteQuery ? remoteQuery.query : localQuery;
  const setQuery = remoteQuery ? remoteQuery.onQueryChange : setLocalQuery;
  // Android 뒤로 키: 검색이 열려 있으면 앱을 나가지 않고 검색부터 닫는다(폰은 기본 보관함에서 뒤로 키가 앱 종료라 검색 중에 종료되던 것)
  useEffect(() => {
    if (Platform.OS !== 'android' || !searchOpen) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { setSearchOpen(false); setQuery(''); return true; });
    return () => subscription.remove();
  }, [searchOpen, setSearchOpen, setQuery]);
  const [optionsOpen, setOptionsOpen] = useState(false);
  // 옵션 말풍선은 버튼 자리에 맞춰 띄우고, 바깥을 누르면 닫힌다(투명한 바탕 · Modal)
  const optionsButton = useRef(null);
  const [optionsAnchor, setOptionsAnchor] = useState(null);
  const openOptions = () => {
    if (optionsOpen) { setOptionsOpen(false); return; }
    const node = optionsButton.current;
    if (node?.measureInWindow) node.measureInWindow((x, y, width, height) => { setOptionsAnchor({ x, y, width, height }); setOptionsOpen(true); });
    else { setOptionsAnchor(null); setOptionsOpen(true); }
  };
  const shown = useMemo(() => remoteQuery ? diaries : queryDiaries(diaries, { filter, query: searchOpen ? query : '', sort, metadata }), [diaries, filter, query, searchOpen, sort, metadata, remoteQuery]);
  const selecting = selection !== null;
  // 펼쳐서 보기는 한 권만 보여 고르기(관리 모드)를 할 수 없어, 관리 중에는 한눈에 보기로 보인다
  const displayView = searchOpen || (selecting && view === 'open') ? 'grid' : view;
  // 목록이 바뀌는 때(필터 · 정렬 · 검색)는 처음으로 돌아가고, 보기만 바꿀 때는 지금 보던 다이어리를 그대로 이어 간다
  const resetPosition = () => { positioned.current = null; onCarouselChange(0); };
  // 스와이프로 돌아올 때는 보던 다이어리가 가운데에 다시 놓이기까지 줄을 숨긴다(0번 자리에서 튀어 오지 않게)
  const showCurrentAtCenter = () => { if (displayView === 'carousel') return; positioned.current = null; setLanded(false); };
  // 범위(왼쪽 메뉴)와 즐겨찾기 칩
  const scope = LIBRARY_SCOPES.find(item => item.id === filterScope(filter)) ?? null;
  const favoriteOnly = filterFavorite(filter);
  const emptyTitle = favoriteOnly ? FILTERS[1].empty : scope?.empty ?? '다이어리가 없어요';
  // 회원의 내 다이어리가 비어 있고 이 기기에 옮길 다이어리가 있을 때만 빈 화면에 옮기기 입구를 둔다(평소 입구는 마이페이지)
  const emptyAction = emptyGuestImportAction(guestImport, scope?.id, favoriteOnly);
  // 보이는 다이어리만 선택으로 센다. 필터를 바꾸면 숨은 다이어리는 선택에서 빠진다.
  const manageable = useMemo(() => shown.filter(diary => diary.canManage !== false && diary.canDelete !== false), [shown]);
  const selected = useMemo(() => (selecting ? visibleSelection(selection, manageable) : []), [selecting, selection, manageable]);
  useEffect(() => {
    if (selecting && selected.length !== selection.length) onSelectionChange?.(selected);
  }, [onSelectionChange, selected, selecting, selection]);
  const toggleSelect = useCallback((diary) => {
    if (!trashing && diary.canManage !== false && diary.canDelete !== false) onSelectionChange?.(toggleSelection(selected, diary.id));
  }, [onSelectionChange, selected, trashing]);
  // 다이어리를 꾹 누르면 그 다이어리를 고른 채 편집(관리) 모드로 들어간다.
  const enterEdit = useCallback((diary) => {
    if (!trashing && onSelectionChange) { setOptionsOpen(false); onSelectionChange([diary.id]); }
  }, [onSelectionChange, trashing]);
  const allSelected = manageable.length > 0 && selected.length === manageable.length;
  // 렌더링/스크롤 위치와 무관하게 현재 검색·필터 결과 전체를 대상으로 한다.
  const toggleAll = () => {
    if (!trashing && manageable.length) onSelectionChange?.(allSelected ? [] : manageable.map(diary => diary.id));
  };
  // 새로 만든 다이어리는 개인 다이어리로 들어가므로 만들기 버튼은 개인 다이어리 탭에만 둔다. 관리 중에는 숨긴다.
  const canCreate = Boolean(onCreate) && filterScope(filter) !== 'shared' && !favoriteOnly && !searchOpen && !selecting;

  const carouselItems = shown;
  const itemCount = carouselItems.length;
  const grid = useDiaryGrid(compact, undefined, { count: shown.length, padTop: 16 }); // 태블릿 한눈에 보기 칸 크기 · 간격 (폰은 null). 16 은 s.grid 의 위 여백
  const carouselItemWidth = portrait ? PORTRAIT_ITEM_WIDTH : compact ? 268 : CAROUSEL_ITEM_WIDTH;
  const carouselSidePadding = Math.max(0, (carouselViewportWidth - carouselItemWidth) / 2);
  // 세로는 간격을 카드 폭만큼 줘서 옆 카드가 화면 밖에 있게 한다.
  // 폰도 옆 카드를 살짝 보이던 것 대신 화면 밖에 두고 좌우 화살표로 넘긴다(지라 611): 간격 = 양옆 여백 + 8
  const carouselGap = portrait ? PORTRAIT_ITEM_WIDTH : compact ? Math.max(11, Math.round(carouselSidePadding) + 8) : CAROUSEL_GAP;
  const carouselStep = portrait || compact ? carouselItemWidth + carouselGap : CAROUSEL_STEP;
  // 애니메이션 노드는 위치(index)마다 한 번만 만들어 카드 수가 바뀌어도 그대로 쓴다(칸 폭이 바뀔 때만 새로).
  // 화면에 남은 카드가 노드를 바꿔 받으면 react-native 가 옛 노드 값을 기본값으로 되돌려(restoreDefaultValues: transform · opacity,
  // createAnimatedPropsHook 의 useAnimatedPropsLifecycle) 네이티브 드라이버에서 카드가 한 프레임 원래 크기 · 자리로 튄다.
  // 휴지통 이동 때 위치가 그대로인 카드는 노드가 그대로라 튀지 않고, 위치가 바뀐 카드는 아래 renderItem 에서 새로 마운트한다(마운트 해제에는 되돌리지 않는다)
  const motionCache = useMemo(() => new Map(), [carouselStep, scrollX]);
  const motions = useMemo(() => Array.from({ length: itemCount }, (_, index) => {
    if (!motionCache.has(index)) motionCache.set(index, carouselMotion(scrollX, index, carouselStep));
    return motionCache.get(index);
  }), [carouselStep, itemCount, motionCache, scrollX]);
  const activeIndex = Math.max(0, Math.min(carousel, Math.max(0, itemCount - 1)));
  // 다른 보기에 있을 때도 지금 다이어리와 앞뒤 한 권의 문서 · 속지를 읽어 둬, 펼쳐서로 넘어온 순간 속지가 바로 그려지게 한다
  useEffect(() => { preloadOpenBooks(carouselItems, activeIndex); }, [carouselItems, activeIndex]);
  // 가장 왼쪽 · 오른쪽 다이어리에서는 갈 곳이 없는 쪽 화살표를 숨긴다
  const hasPrevious = activeIndex > 0, hasNext = activeIndex < itemCount - 1;
  const fixedPhoneCarousel = (compact || portrait) && displayView === 'carousel' && carouselItems.length > 0;
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
      setLanded(true);
    });
    return () => cancelAnimationFrame(frame);
  }, [activeIndex, carouselStep, carouselViewportWidth, contentWidth, displayView, filter, itemCount, scrollX]);

  useEffect(() => {
    if (carousel !== activeIndex) onCarouselChange(activeIndex);
  }, [activeIndex, carousel, onCarouselChange]);

  // 이전/다음 버튼: 부드럽게 스크롤만 시작하고, 가운데 카드(상태)는 이동이 끝난 뒤에 바꾼다.
  // 누르는 순간 상태를 바꾸면 이동 도중에 모든 카드의 활성 표시 · contentOffset · 빛 따라가기 값이 한꺼번에 바뀌어,
  // 카드들이 한 번 커졌다가 작아지며 넘어가 보인다. 끝은 스크롤 끝 이벤트가 알려 주고, 없는 환경(웹)을 위해 시간이 지나면 직접 바꾼다.
  const moveTarget = useRef(null);
  const moveTimer = useRef(null);
  useEffect(() => () => clearTimeout(moveTimer.current), []);
  // 넘기기가 끝나면 JS 쪽 scrollX 도 멈춘 위치로 맞춘다. 스크롤 이벤트는 네이티브 드라이버라 기기에서는 JS 값을 바꾸지 않아
  // (웹은 JS 로 따라간다) 마지막으로 자리 잡은 위치에 남는다. 카드는 다시 그려질 때 이 JS 값으로 크기 · 높이를 계산해 보내므로,
  // 맞추지 않으면 휴지통 이동처럼 카드가 한꺼번에 다시 그려질 때 엉뚱한 카드가 한 프레임 가운데 크기로 커졌다가 돌아온다.
  // 멈춘 위치와 같은 값이라 화면은 움직이지 않는다. 화살표 이동은 목표가 아니라 스크롤이 실제로 알려 준 마지막 위치로 맞춘다
  // (부드러운 이동이 시간 안에 끝나지 않았어도 카드 크기와 실제 위치가 어긋나지 않게)
  const lastOffset = useRef(null);
  const settleScrollX = useCallback(offset => { if (Number.isFinite(offset)) scrollX.setValue(offset); }, [scrollX]);
  const moveCarousel = (nextIndex) => {
    const next = Math.max(0, Math.min(nextIndex, itemCount - 1));
    moveTarget.current = next;
    positioned.current = positionKey(next);
    carouselRef.current?.scrollToOffset?.({ offset: next * carouselStep, animated: true });
    clearTimeout(moveTimer.current);
    moveTimer.current = setTimeout(() => { moveTarget.current = null; settleScrollX(lastOffset.current); onCarouselChange(next); }, CAROUSEL_MOVE_MS);
  };

  const syncCarouselIndex = useCallback(({ nativeEvent }) => {
    const index = Math.max(0, Math.min(Math.round(nativeEvent.contentOffset.x / carouselStep), itemCount - 1));
    positioned.current = [filter, view, carouselViewportWidth, contentWidth, index].join(':');
    clearTimeout(moveTimer.current); moveTarget.current = null;
    settleScrollX(nativeEvent.contentOffset.x);
    onCarouselChange(index);
  }, [carouselStep, carouselViewportWidth, contentWidth, filter, itemCount, onCarouselChange, settleScrollX, view]);

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

  // 크기 계산은 네이티브로 바로 따라가고, JS 는 마지막 위치만 기억한다(넘기기가 끝날 때 scrollX 를 맞추는 데 쓴다. 펼쳐서 보기와 같은 방식)
  const onScroll = useMemo(() => Animated.event(
    [{ nativeEvent: { contentOffset: { x: scrollX } } }],
    { useNativeDriver: true, listener: ({ nativeEvent }) => { lastOffset.current = nativeEvent.contentOffset.x; } },
  ), [scrollX]);

  const { key: sortKey, direction } = parseSort(sort);
  // 검색이 열려 있을 때만 닫는다. 회원 보관함은 검색을 닫거나 검색어를 비우면 첫 다이어리로 돌아가므로(App 의 서버 검색), 그냥 보기만 바꿀 때 보던 다이어리를 잃었다(2026-11-08)
  const chooseView = (id) => { if (searchOpen || query) { setSearchOpen(false); setQuery(''); } onViewChange(id); if (id === 'carousel') showCurrentAtCenter(); };
  const optionsMenu = !selecting && <>
    <Pressable accessibilityRole="button" accessibilityLabel="보관함 옵션" accessibilityValue={{ text: SORT_OPTIONS.find(item => item.id === sortKey)?.label }} accessibilityState={{ expanded: optionsOpen }} ref={optionsButton} onPress={openOptions} hitSlop={4} style={({ pressed }) => [s.iconButton, s.iconButtonBare, pressed && s.pressed]}>
      <View style={s.librarySortIcon}><AppIcon name="more" size={21} color={C.ink} /></View>
    </Pressable>
    <PopoverMenu open={optionsOpen} anchor={optionsAnchor} width={230} height={compact ? 430 : 250} rightInset={compact ? 13 : null} label="보관함 옵션 목록" style={s.librarySortMenu} onClose={() => setOptionsOpen(false)}>
      {/* 폰: 보기 전환은 정렬과 같은 묶음(이 목록을 어떻게 볼지)이라 머리줄이 아니라 여기에 둔다(사용자 결정 2026-11-05).
          고른 항목은 체크로만 표시하고(HIG Menus · Material 3 · 코덱스 2026-11-05) 묶음마다 머리글을 둔다 */}
      {compact && <>
        <Text accessibilityRole="header" style={s.librarySortHeader}>보기</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="보기">
          {LIBRARY_VIEWS.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: view === item.id }} accessibilityLabel={`${item.label} 보기`} onPress={() => { chooseView(item.id); setOptionsOpen(false); }} style={({ pressed }) => [s.librarySortOption, pressed && s.pressed]}>
            <View style={s.sortOptionCheck}>{view === item.id && <AppIcon name="check" size={14} forText={14} color={C.blueStrong} />}</View>
            <Text style={s.librarySortText}>{item.label}</Text>
          </Pressable>)}
        </View>
        <View style={s.librarySortDivider} />
      </>}
      <Text accessibilityRole="header" style={s.librarySortHeader}>정렬 기준</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="정렬 기준">
        {SORT_OPTIONS.map(item => <Pressable key={item.id} accessibilityRole="radio" accessibilityState={{ checked: sortKey === item.id }} accessibilityLabel={`${item.label}, ${sortKey === item.id ? (direction === 'asc' ? '오름차순' : '내림차순') + ', 누르면 방향 바꾸기' : '선택'}`} onPress={() => { onSortChange(nextSort(sort, item.id)); resetPosition(); }} style={({ pressed }) => [s.librarySortOption, pressed && s.pressed]}>
          <View style={s.sortOptionCheck}>{sortKey === item.id && <AppIcon name="check" size={14} forText={14} color={C.blueStrong} />}</View>
          <Text style={s.librarySortText}>{item.label}</Text>
          {sortKey === item.id && <AppIcon name={direction === 'asc' ? 'arrow-up' : 'arrow-down'} size={14} forText={14} color={C.ink} />}
        </Pressable>)}
      </View>
    </PopoverMenu>
  </>;
  // 남은 페이지는 App 이 뒤에서 이어 받으므로 휴지통과 같은 이름을 쓴다(접근성 힌트에는 불러온 범위를 남긴다)
  const allLabel = allSelected ? '전체 해제' : '전체 선택';
  const selectionBar = selecting && <SelectionBar count={selected.length} unit="권" compact={compact} done={<SelectionButton compact={compact} ghost label="선택 완료" text="완료" disabled={trashing} onPress={() => onSelectionChange?.(null)} />}>
    <SelectionButton compact={compact}
      label={allLabel}
      hint={`${hasMore ? '현재 불러온' : '현재 검색·필터 결과'} ${manageable.length}권에 적용해요`}
      // 남은 페이지를 이어 받는 중(또는 오류로 멈춤)에는 막는다: 누르면 불러온 것만 골라져 '전체'와 달라진다
      disabled={trashing || !manageable.length || hasMore}
      onPress={toggleAll}
    />
    <SelectionButton compact={compact}
      label={`선택한 ${selected.length}개 휴지통으로 이동`}
      text={trashing ? '옮기는 중…' : '휴지통으로'}
      icon="trash"
      tone="primary"
      disabled={!selected.length || trashing}
      onPress={() => onTrashSelected?.(selected)}
    />
  </SelectionBar>;

  if (searchOpen) return <LibrarySearchScreen
    compact={compact} query={query} onQueryChange={setQuery}
    onBack={() => {
      if (selecting) {
        if (!trashing) onSelectionChange?.(null);
        return;
      }
      setSearchOpen(false); setQuery(''); setOptionsOpen(false);
    }}
    diaries={shown} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} onShare={onShare}
    metadata={metadata} optionsMenu={optionsMenu} selectionBar={selectionBar}
    selecting={selecting} selected={selected} onToggleSelect={toggleSelect} onEnterEdit={enterEdit}
    requestNotice={centeredNotice ? <>{centeredNotice}{requestNotice}</> : requestNotice} hasMore={hasMore} suppressEmpty={suppressEmpty} historyKey={historyKey}
  />;

  // 한눈에 보기는 제목 · 필터 · 도구를 위에 고정하고 카드 목록만 스크롤한다.
  const isGrid = displayView === 'grid';
  // 폰: 첫 줄은 제목 + 검색 · ⋮ · 알림, 둘째 줄은 필터 칩. 보기 전환은 ⋮ 안(제목 길이와 상관없이 버튼 자리가 같다)
  // 태블릿: 자리가 넉넉해 밖에 두고 아이콘만으로 뜻이 모호한 것을 글자로 보탠다
  const viewSwitch = (
        <View style={s.libraryViewSwitch} accessibilityRole="tablist">
          {LIBRARY_VIEWS.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={`${item.label} 보기`} hitSlop={VIEW_HIT_SLOP} accessibilityState={{ selected: displayView === item.id }}
            onPress={() => chooseView(item.id)}
            style={({ pressed }) => [s.libraryViewOption, displayView === item.id && s.libraryViewOptionSelected, pressed && s.pressed]}>
            <AppIcon name={item.icon} size={18} forText={13} color={displayView === item.id ? C.blueText : C.blue} />
            <Text style={[s.libraryViewOptionText, displayView === item.id && s.libraryViewOptionTextSelected]}>{item.label}</Text>
          </Pressable>)}
        </View>
  );
  const libraryActions = !selecting && <View style={[s.libraryActions, compact && s.libraryActionsCompact]}>
          <IconButton bare label="다이어리 검색" iconName="search" onPress={() => { setSearchOpen(true); setQuery(''); setOptionsOpen(false); resetPosition(); }} />
          {optionsMenu}
        </View>;
  const top = (<>
      <View style={[s.libraryHeader, compact && s.libraryHeaderCompact]}>
        <View style={[s.headerTitleRow, compact && s.headerTitleRowCompact]}>
          <AppIcon name={scope?.icon ?? 'book'} size={compact ? 24 : 27} color={C.ink} strokeWidth={2.4} />
          <Text accessibilityRole="header" numberOfLines={compact ? 1 : undefined} adjustsFontSizeToFit={compact} minimumFontScale={0.75} style={[s.libraryTitle, compact && s.libraryTitleCompact]}>{scope?.label ?? '다이어리'}</Text>
        </View>
        {compact ? <View style={s.libraryHeadToolsCompact}>{libraryActions}<PhoneBell /></View> : viewSwitch}
      </View>

      <View style={[s.libraryToolbar, s.libraryToolbarWrap, compact && s.libraryToolbarCompact]}>
        {(() => {
          const filterChips = (
            <View style={[s.filterSwitch, !compact && s.filtersWide]} accessibilityRole="tablist">
              {FILTERS.map((item) => {
                const on = favoriteOnly === (item.id === 'favorite');
                return (
                <Pressable
                  key={item.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  hitSlop={FILTER_HIT_SLOP}
                  onPress={() => { onFilterChange(withFavorite(filter, item.id === 'favorite')); resetPosition(); setOptionsOpen(false); }}
                  style={({ pressed }) => [s.filterOption, compact && s.filterOptionCompact, on && s.filterOptionSelected, pressed && s.pressed]}
                >
                  {/* 즐겨찾기 칩의 별은 다이어리 카드의 즐겨찾기 별과 같은 그림이되, 골라도 금색으로 채우지 않는다(고른 표시는 칩 테두리). 칩 · 보기 버튼 아이콘은 글자 높이(위아래 끝)에 맞춘 크기 */}
                  {item.id === 'favorite' ? <FavoriteStar filled={false} outline={C.inkSoft} size={compact ? 13 : 14} />
                    : <AppIcon name={item.icon} size={compact ? 15 : 16} forText={compact ? 12.5 : 12} color={C.inkSoft} />}
                  <Text style={[s.libraryViewText, compact && s.filterTextCompact, on && s.filterTextSelected]}>{item.label}</Text>
                </Pressable>
                );
              })}
            </View>
          );
          // 폰: 필터 칩은 가로로 밀리고, 검색 · 더보기는 같은 줄 오른쪽에 붙는다(한 줄 44)
          return compact
            ? <FadeScroll horizontal fadeRgb={CANVAS_FADE_RGB} style={s.libraryFilterScroll} contentContainerStyle={s.libraryFilterScrollContent}>{filterChips}</FadeScroll>
            : filterChips;
        })()}
        {compact ? null : libraryActions}
      </View>
      {selectionBar}
      {requestNotice}
  </>);
  const centeredContent = centeredNotice || (!carouselItems.length && suppressEmpty && loading
    ? <LoadingSpot showLabel label="다이어리를 불러오고 있어요." /> : null);
  const body = (<>
      {!carouselItems.length && suppressEmpty ? null : !carouselItems.length ? (
        <EmptyState compact={compact} raised title={emptyTitle} action={emptyAction} />
      ) : displayView === 'open' ? (
        <OpenBookShelf diaries={carouselItems} index={activeIndex} onIndexChange={onCarouselChange} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} onShare={onShare} compact={compact} />
      ) : displayView === 'carousel' ? (
        <View style={[s.carouselShell, compact && s.carouselShellCompact, portrait && s.carouselShellPortrait]}>
          {/* 목록은 잰 폭으로 고정하고 줄 가운데에 둔다. 줄 폭이 바뀌어도 가운데 카드는 늘 줄 가운데에 머문다. */}
          <View style={[s.carouselRow, compact && s.carouselRowCompact, portrait && s.carouselRowPortrait, !landed && { opacity: 0 }]} onLayout={measureCarousel}>
            {/* 폰 · 태블릿 모두 화살표(폰은 카드 양옆 여백에, 지라 611). 밀어서 넘기기도 그대로 */}
            {hasPrevious && <Pressable
              accessibilityRole="button"
              accessibilityLabel="이전 다이어리"
              onPress={() => moveCarousel((moveTarget.current ?? activeIndex) - 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowLeft, portrait && s.carouselArrowPortrait, compact && s.carouselArrowCompact, pressed && s.pressed]}
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
                  <DiaryCard
                    // 위치가 바뀌면(휴지통 이동으로 옆 카드가 당겨짐) 같은 다이어리라도 새로 마운트한다. 그대로 두고 노드만 바꾸면 위 motionCache 설명처럼 튄다
                    key={`${item.id}:${index}`}
                    diary={item}
                    pageCount={metadata[item.id]?.pageCount}
                    layout="carousel"
                    compact={compact}
                    large={portrait}
                    carouselActive={index === activeIndex}
                    animatedStyle={motions[index].card}
                    infoStyle={motions[index].info}
                    onOpen={onOpen}
                    onCenter={() => moveCarousel(index)}
                    onFavorite={onFavorite}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onShare={onShare}
                    selecting={selecting}
                    selected={selected.includes(item.id)}
                    onToggleSelect={toggleSelect}
                    onEnterEdit={enterEdit}
                  />
              )}
            />
            {hasNext && <Pressable
              accessibilityRole="button"
              accessibilityLabel="다음 다이어리"
              onPress={() => moveCarousel((moveTarget.current ?? activeIndex) + 1)}
              style={({ pressed }) => [s.carouselArrow, s.carouselArrowRight, portrait && s.carouselArrowPortrait, compact && s.carouselArrowCompact, pressed && s.pressed]}
            >
              <AppIcon name="chevron-right" size={24} color={C.ink} strokeWidth={2.1} />
            </Pressable>}
          </View>
        </View>
      ) : (
        <View onLayout={grid?.onLayout}>
          <View style={[s.grid, compact && s.gridCompact, grid?.style]}>
            {shown.map((diary) => <DiaryCard key={diary.id} diary={diary} pageCount={metadata[diary.id]?.pageCount} compact={compact} cell={grid?.cell} onOpen={onOpen} onFavorite={onFavorite} onEdit={onEdit} onDelete={onDelete} onShare={onShare}
              selecting={selecting} selected={selected.includes(diary.id)} onToggleSelect={toggleSelect} onEnterEdit={enterEdit} />)}
          </View>
        </View>
      )}
  </>);
  return (
    <View style={s.libraryRoot}>
    {centeredContent ? <>
      <View style={[s.libraryScreen, compact && s.libraryScreenCompact, s.libraryFixedTop]}>{top}</View>
      <ScrollView contentContainerStyle={centeredNotice ? s.libraryCenteredNotice : [s.libraryCenteredNotice, s.libraryLoadingPosition]}>{centeredContent}</ScrollView>
    </> : isGrid ? <>
      <View style={[s.libraryScreen, compact && s.libraryScreenCompact, s.libraryFixedTop]}>{top}</View>
      <ScrollView {...grid?.scroll} contentContainerStyle={[s.libraryGridScroll, compact && s.libraryGridScrollCompact, canCreate && (compact ? s.libraryGridScrollFabCompact : s.libraryGridScrollFab)]} showsVerticalScrollIndicator={false}>{body}</ScrollView>
    </> : displayView === 'open' ? <>
      {/* 펼쳐서 보기는 스크롤 없이 남은 화면 전체를 책상으로 쓴다(스크롤 안에서는 최소 높이만 받아 책이 작아졌다) */}
      <View style={[s.libraryScreen, compact && s.libraryScreenCompact, s.libraryFixedTop]}>{top}</View>
      <View style={[s.libraryGridScroll, compact && s.libraryGridScrollCompact]}>{body}</View>
    </> : <ScrollView
      contentContainerStyle={[s.libraryScreen, compact && s.libraryScreenCompact, fixedPhoneCarousel && s.libraryScreenCarouselCompact]}
      showsVerticalScrollIndicator={false}
      scrollEnabled={!fixedPhoneCarousel}
    >{top}{body}</ScrollView>}
    {/* 새 다이어리: + 아이콘 버튼을 본문 오른쪽 아래에 띄운다 */}
    {canCreate && <Pressable accessibilityRole="button" accessibilityLabel="새 다이어리 만들기" hitSlop={2} onPress={onCreate}
      style={({ pressed }) => [s.createFab, compact && s.createFabCompact, pressed && s.pressed]}>
      <AppIcon name="add" size={compact ? 20 : 24} strokeWidth={2} color={C.white} />
    </Pressable>}
    </View>
  );
}

// 보기 전환 칸: 보이는 칸(폰 28 · 태블릿 32) 둘레를 넓혀 터치 48. 칸 사이가 좌우 slop 합과 같아 옆 칸과 겹치지 않는다
const VIEW_HIT_SLOP = { top: 8, bottom: 8 };
// 필터 칩: 보이는 높이 36 + 위아래 6 = 터치 48
const FILTER_HIT_SLOP = { top: 6, bottom: 6 };

export default memo(LibraryScreen);
