import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { RAIL_WIDTH } from '../components/SideRail';
import { GRID_GAP_Y, LIBRARY_SIDE_PADDING, gridMetrics } from './gridLayout';

/**
 * 태블릿 한눈에 보기 격자의 칸 크기 · 간격. 폰(compact)은 null 을 돌려줘 기존 퍼센트 배치를 그대로 쓴다.
 * 쓰는 법: 바깥 View 에 onLayout 을 달고, 안쪽 격자 View 에 style 을, 카드에 cell 을 넘긴다.
 * rowGap: 줄 사이 간격. 제목 아래에 줄이 더 붙는 화면(휴지통의 남은 기간)만 다르게 준다.
 * 첫 프레임은 창 폭에서 짐작한 값(접힌 메뉴 기준)으로 그리고, 잰 뒤 바로잡는다. 메뉴가 펼쳐져도 본문 폭은 바뀌지 않는다.
 */
export function useDiaryGrid(compact, rowGap = GRID_GAP_Y) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(null);
  const onLayout = useCallback(event => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured(current => (current === next ? current : next));
  }, []);
  if (compact) return null;
  const metrics = gridMetrics(measured ?? windowWidth - RAIL_WIDTH.collapsed - LIBRARY_SIDE_PADDING * 2);
  return {
    cell: metrics.cell,
    onLayout,
    style: { width: metrics.width, columnGap: metrics.gapX, rowGap, alignSelf: 'center' },
  };
}
