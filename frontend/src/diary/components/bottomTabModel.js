import { LIBRARY_SCOPES } from '../constants.js';
import { filterScope } from '../utils/libraryQuery.js';

// 좁은 폰에서도 한 줄에 들어가도록, 화면 이름과 하단 바 표기를 분리한다.
const scopeLabel = scope => scope.id === 'personal' ? '내 기록' : '공유';

// 폰 하단 탭 5칸(사용자 결정 2026-11-05). 자주 쓰는 순서로 두고 계정 칸은 맨 오른쪽(시중 앱 습관). 설정은 마이페이지 톱니에서 연다.
export const BOTTOM_TABS = [
  ...LIBRARY_SCOPES.map(scope => ({ id: 'library', filter: scope.id, label: scopeLabel(scope), accessibilityLabel: scope.label, icon: scope.icon })),
  { id: 'studio', label: '공방', accessibilityLabel: '꾸미기 공방', icon: 'workshop' },
  { id: 'trash', label: '휴지통', accessibilityLabel: '휴지통', icon: 'bin' },
  { id: 'profile', label: '마이페이지', accessibilityLabel: '마이페이지', icon: 'person' },
];

// 탭이 없는 화면은 그 화면을 품은 탭을 선택 상태로 둔다: 설정 → 마이페이지
const PARENT_TAB = { settings: { id: 'profile' } };

export const isBottomTabSelected = (page, filter, tab) => {
  const parent = PARENT_TAB[page];
  if (parent) return tab.id === parent.id && (!tab.filter || tab.filter === parent.filter);
  return page === tab.id && (!tab.filter || filterScope(filter) === tab.filter);
};

export const navigateBottomTab = (navigate, tab) => navigate(tab.id, tab.filter);
