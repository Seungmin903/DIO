import { useCallback, useRef, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { RAIL_WIDTH } from '../components/SideRail';
import { GRID_GAP_Y, LIBRARY_SIDE_PADDING, gridMetrics, gridScrollAnchor, gridScrollY } from './gridLayout';

/**
 * 태블릿 한눈에 보기 격자의 칸 크기 · 간격. 폰(compact)은 null 을 돌려줘 기존 퍼센트 배치를 그대로 쓴다.
 * 쓰는 법: 바깥 View 에 onLayout 을 달고, 안쪽 격자 View 에 style 을, 카드에 cell 을, 감싼 ScrollView 에 {...scroll} 을 넘긴다.
 * rowGap: 줄 사이 간격. 제목 아래에 줄이 더 붙는 화면(휴지통의 남은 기간)만 다르게 준다.
 * count · padTop: 다이어리 수와 격자 안쪽 위 여백. 회전해 한 줄 권수가 바뀌면 맨 위에 보던 다이어리를 같은 높이에 다시 놓는 데 쓴다.
 * 첫 프레임은 창 폭에서 짐작한 값(접힌 메뉴 기준)으로 그리고, 잰 뒤 바로잡는다. 메뉴가 펼쳐져도 본문 폭은 바뀌지 않는다.
 */
export function useDiaryGrid(compact, rowGap = GRID_GAP_Y, { count = 0, padTop = 0 } = {}) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const windowSize = useRef(null);
  windowSize.current = { windowWidth, windowHeight };
  // 폭과 세로 여부는 같이 잰다. 창 방향만 먼저 바뀐 프레임에 옛 폭 + 새 최소 칸으로 권수가 튀지 않게
  const [measured, setMeasured] = useState(null);
  const scrollRef = useRef(null);
  const geometry = useRef(null); // 마지막으로 잰 격자 자리(gridLayout 의 geometry)
  const anchor = useRef(null); // 맨 위에 걸린 다이어리
  const metrics = gridMetrics(measured?.width ?? windowWidth - RAIL_WIDTH.collapsed - LIBRARY_SIDE_PADDING * 2, measured?.portrait ?? windowHeight > windowWidth);
  const live = useRef(null);
  live.current = { columns: metrics.columns, count, padTop, rowGap };
  const onLayout = useCallback(event => {
    const { width, height, y } = event.nativeEvent.layout;
    const next = { width: Math.round(width), portrait: windowSize.current.windowHeight > windowSize.current.windowWidth };
    setMeasured(current => (current?.width === next.width && current?.portrait === next.portrait ? current : next));
    const previous = geometry.current;
    const now = { top: y, height, ...live.current };
    geometry.current = now;
    // 권수가 바뀌면(회전 · 창 크기) 보던 다이어리를 같은 높이로 바로 옮긴다. 목록이 바뀐 때(필터 · 삭제)는 옮기지 않는다
    if (previous && anchor.current && previous.columns !== now.columns && previous.count === now.count) {
      scrollRef.current?.scrollTo({ y: gridScrollY(anchor.current, now), animated: false });
    }
  }, []);
  const viewport = useRef(null);
  const onScroll = useCallback(event => {
    const { contentOffset, layoutMeasurement } = event.nativeEvent;
    const size = `${Math.round(layoutMeasurement.width)}x${Math.round(layoutMeasurement.height)}`;
    const resized = viewport.current !== null && viewport.current !== size;
    viewport.current = size;
    // 창 크기가 바뀌며 스크롤이 끝에 걸려 밀린 것은 사용자가 내린 게 아니라 기억하지 않는다
    if (resized || !geometry.current) return;
    const next = gridScrollAnchor(contentOffset.y, geometry.current);
    // 같은 줄 안이면 처음 기억한 다이어리를 지킨다. 가로 → 세로 → 가로로 돌아올 때 줄 첫 권이 바뀌며 한 줄씩 밀리지 않게
    const kept = anchor.current && next && Math.floor(anchor.current.index / geometry.current.columns) === Math.floor(next.index / geometry.current.columns);
    anchor.current = kept ? { index: anchor.current.index, fraction: next.fraction } : next;
  }, []);
  if (compact) return null;
  return {
    cell: metrics.cell,
    onLayout,
    scroll: { ref: scrollRef, onScroll, scrollEventThrottle: 16 },
    style: { width: metrics.width, columnGap: metrics.gapX, rowGap, alignSelf: 'flex-start' }, // 제목 왼쪽 선에 맞춰 왼쪽부터
  };
}
