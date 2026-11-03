// 설정은 폰의 내 공간에서만 별도 진입점을 둔다. 태블릿은 좌측 레일의 설정 항목을 사용한다.
export const shouldShowProfileSettingsButton = ({ compact, settingsPage, onOpenSettings }) => Boolean(
  compact && !settingsPage && onOpenSettings,
);

export const createProfileSettingsNavigation = (isPhone, navigate) => (
  isPhone ? () => navigate('settings') : undefined
);
