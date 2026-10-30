import { colors } from '../shared/theme.js';

// 표지 색이 없는 기존 문서·API 응답의 호환 기본값. UI 배경색과 독립적으로 유지한다.
export const FALLBACK_COVER_COLOR = '#D4D7ED';

// 화면 틀 색은 편집 화면과 같은 디자인 토큰(shared/theme)을 쓴다. 표지·꾸밈 색은 아래에 따로 둔다.
export const C = {
  ink: colors.text,
  inkSoft: colors.textMuted,
  muted: colors.textMuted,
  line: colors.border,
  canvas: colors.surfaceSoft, // 편집 화면 작업 영역과 같은 바탕
  blue: colors.primary,
  blueStrong: colors.primaryStrong,
  pale: colors.surfaceMuted, // 편집 옵션 창의 회색 칩·세그먼트 판
  active: colors.primarySoft, // 중립 배경과 구분되는 파란 선택 표시
  danger: colors.danger,
  white: colors.surface,
  navy: '#182473',
  green: '#71B99D',
  coral: '#E9938B',
  violet: '#A894D0',
  yellow: '#EDCF70',
};

// 새 다이어리 표지 색상. 기존 다이어리에 저장된 색은 이 목록에 없어도 그대로 표시한다.
// 다이어리 기본 바탕색 6종: 국내 다이어리에서 흔히 보이는 무난한 계열(크림 · 베이지 · 핑크 · 그린 · 블루 · 차콜)을
// 한 브랜드를 떠올리게 하는 색(완전한 검정 · 주황 등)은 피해 조금씩 탁하게 잡았다. 예전 다이어리의 다른 색은 그대로 그린다.
export const COLORS = [
  { label: '크림', value: '#EEE6D6' },
  { label: '라떼', value: '#D6C2A6' },
  { label: '더스티 로즈', value: '#E2B9B6' },
  { label: '세이지', value: '#AABDA4' },
  { label: '스카이', value: '#BDC2E1' },
  { label: '차콜', value: '#474D57' },
];

export const COVER_PATTERNS = [
  { id: 'linen', label: '린넨' },
  { id: 'leather', label: '레더' },
  { id: 'dot', label: '도트' },
  { id: 'gingham', label: '깅엄' },
  { id: 'stripe', label: '스트라이프' },
  { id: 'check', label: '체크' },
];

// 페이지 크기는 만든 뒤에 바꿀 수 없다.
// 새 다이어리는 가로형·세로형을 고를 수 있고, 기존 다이어리의 방향은 유지한다.
export const PAGE_SIZES = [{ id: 'landscape', label: '가로형' }, { id: 'portrait', label: '세로형' }];

// 첫 페이지 서식. 지금은 선택값만 저장하고, 편집기 속지가 준비되면 첫 페이지에 반영한다.
export const FIRST_PAGES = [
  { id: 'monthly', label: '월간 달력' },
  { id: 'weekly', label: '주간 계획' },
  { id: 'blank', label: '무지' },
  { id: 'lined', label: '줄노트' },
  { id: 'grid', label: '모눈' },
  { id: 'dot', label: '도트' },
];

export const DIARY_DEFAULTS = {
  title: '새 다이어리',
  color: '#BDC2E1',
  pattern: 'linen',
  pageSize: 'landscape',
  firstPage: 'blank',
  firstPageDate: '2026-01-01',
};

// 홈 화면 보관함 탭. 고른 탭 이름이 화면 제목이 된다.
export const FILTERS = [
  { id: 'all', label: '모든 다이어리', empty: '다이어리가 없어요', emptyCopy: '새 다이어리를 만들어 기록을 시작해 보세요.' },
  { id: 'favorite', label: '즐겨찾기', empty: '즐겨찾기한 다이어리가 없어요', emptyCopy: '다이어리 카드의 별을 눌러 즐겨찾기에 추가해 보세요.' },
  { id: 'personal', label: '내 다이어리', empty: '내 다이어리가 없어요', emptyCopy: '새 다이어리를 만들어 기록을 시작해 보세요.' },
  { id: 'shared', label: '공유 다이어리', empty: '공유 중인 다이어리가 없어요', emptyCopy: '다이어리를 공유하거나 받은 초대를 수락해 보세요.' },
];

export const DEFAULT_FILTER = 'all';

// 스와이프 칸은 정사각형(표지 칸 높이 318과 같은 폭)이라 세로 · 가로 다이어리가 같은 크기로 보인다.
export const CAROUSEL_ITEM_WIDTH = 318;
export const CAROUSEL_GAP = 42;
export const CAROUSEL_STEP = CAROUSEL_ITEM_WIDTH + CAROUSEL_GAP;
