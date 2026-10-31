// 보관함 보기(펼쳐서 · 스와이프 · 한눈에)와 카드 누르기 동작. 화면 부품과 떼어 두어 테스트한다.

export const LIBRARY_VIEWS = ['open', 'carousel', 'grid'];

/** 기기에 저장해 둔 보기 값. 알 수 없는 값(손상 · 예전 값)이면 null 이라 지금 보기를 그대로 둔다 */
export const savedLibraryView = saved => (LIBRARY_VIEWS.includes(saved) ? saved : null);

/**
 * 다이어리 카드를 눌렀을 때 할 일: 관리 모드면 'select', 스와이프 옆 카드면 'center'(열지 않고 가운데로만), 그 밖은 'open'.
 * 옆 카드는 밀다가 손이 떨어져 잘못 열리지 않도록 가운데로 오기만 한다(가운데로 옮길 수 있을 때만).
 */
export function cardTapAction({ selecting = false, layout = 'grid', carouselActive = false, canCenter = false } = {}) {
  if (selecting) return 'select';
  return layout === 'carousel' && !carouselActive && canCenter ? 'center' : 'open';
}
