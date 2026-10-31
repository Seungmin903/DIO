import { useCallback, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { RAIL_WIDTH } from '../components/SideRail';
import { gridMetrics } from './gridLayout';

const SIDE_PADDING = 30; // libraryScreen · libraryGridScroll 의 좌우 여백

/**
 * 태블릿 한눈에 보기 격자의 칸 크기 · 간격. 폰(compact)은 null 을 돌려줘 기존 퍼센트 배치를 그대로 쓴다.
 * 쓰는 법: 바깥 View 에 onLayout 을 달고, 안쪽 격자 View 에 style 을, 카드에 cell 을 넘긴다.
 * 첫 프레임은 창 폭에서 짐작한 값(접힌 메뉴 기준)으로 그리고, 잰 뒤 바로잡는다. 메뉴가 펼쳐져도 본문 폭은 바뀌지 않는다.
 */
export function useDiaryGrid(compact) {
  const { width: windowWidth } = useWindowDimensions();
  const [measured, setMeasured] = useState(null);
  const onLayout = useCallback(event => {
    const next = Math.round(event.nativeEvent.layout.width);
    setMeasured(current => (current === next ? current : next));
  }, []);
  if (compact) return null;
  const metrics = gridMetrics(measured ?? windowWidth - RAIL_WIDTH.collapsed - SIDE_PADDING * 2);
  return {
    cell: metrics.cell,
    onLayout,
    style: { width: metrics.width, columnGap: metrics.gapX, alignSelf: 'center' },
  };
}
