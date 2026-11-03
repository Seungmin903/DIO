import { LIBRARY_SCOPES } from '../constants.js';
import { filterScope } from '../utils/libraryQuery.js';

// 좁은 폰에서도 다섯 칸 안에 들어가도록, 화면 이름과 하단 바 표기를 분리한다.
const scopeLabel = scope => scope.id === 'personal' ? '내 기록' : '공유';

export const BOTTOM_TABS = [
  ...LIBRARY_SCOPES.map(scope => ({ id: 'library', filter: scope.id, label: scopeLabel(scope), accessibilityLabel: scope.label, icon: scope.icon })),
  { id: 'studio', label: '공방', accessibilityLabel: '꾸미기 공방', icon: 'workshop' },
  { id: 'profile', label: '내 공간', accessibilityLabel: '내 공간', icon: 'person' },
  { id: 'trash', label: '휴지통', accessibilityLabel: '휴지통', icon: 'bin' },
];

export const isBottomTabSelected = (page, filter, tab) => page === tab.id && (!tab.filter || filterScope(filter) === tab.filter);

export const navigateBottomTab = (navigate, tab) => navigate(tab.id, tab.filter);
