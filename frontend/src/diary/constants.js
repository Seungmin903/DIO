export const C = {
  ink: '#0B1957',
  inkSoft: '#40517D',
  muted: '#7583A1',
  line: '#D9E2F0',
  canvas: '#EEF3FB',
  blue: '#6E92C6',
  pale: '#E8F0FB',
  white: '#FFFFFF',
  navy: '#152965',
  green: '#71B99D',
  coral: '#E9938B',
  violet: '#A894D0',
  yellow: '#EDCF70',
};

// 새 다이어리 표지 색상. 기존 다이어리에 저장된 색은 이 목록에 없어도 그대로 표시한다.
export const COLORS = [
  { label: '세이지', value: '#A9BFA6' },
  { label: '로즈', value: '#F0B0AA' },
  { label: '페리윙클', value: '#9DABD8' },
  { label: '머스터드', value: '#EBC56F' },
  { label: '라벤더', value: '#C3AEDD' },
  { label: '차콜', value: '#474F55' },
  { label: '카멜', value: '#D9A87F' },
  { label: '크림', value: '#EAE3D4' },
];

export const COVER_PATTERNS = [
  { id: 'linen', label: '린넨' },
  { id: 'leather', label: '레더' },
  { id: 'dot', label: '도트' },
  { id: 'gingham', label: '깅엄' },
  { id: 'stripe', label: '스트라이프' },
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
  color: '#9DABD8',
  pattern: 'linen',
  pageSize: 'landscape',
  firstPage: 'blank',
  firstPageDate: '2026-01-01',
};

// 홈 화면 보관함 탭. 고른 탭 이름이 화면 제목이 된다.
export const FILTERS = [
  { id: 'personal', label: '모든 다이어리', empty: '다이어리가 없어요', emptyCopy: '새 다이어리를 만들어 기록을 시작해 보세요.' },
  { id: 'favorite', label: '즐겨찾기', empty: '즐겨찾기한 다이어리가 없어요', emptyCopy: '다이어리 카드의 별을 눌러 즐겨찾기에 추가해 보세요.' },
];

export const DEFAULT_FILTER = 'personal';

export const CAROUSEL_ITEM_WIDTH = 238;
export const CAROUSEL_GAP = 42;
export const CAROUSEL_STEP = CAROUSEL_ITEM_WIDTH + CAROUSEL_GAP;
