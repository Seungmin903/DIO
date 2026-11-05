// 설정 진입은 폼 팩터마다 다르다. 폰은 마이페이지 안에 설정이 펼쳐지고(별도 설정 화면 없음),
// 태블릿은 프로필 화면과 좌측 바 `설정`의 별도 설정 화면이 분리된다.
export const showsInlineSettings = ({ compact, section = 'profile' }) => Boolean(compact && section !== 'settings');

// 폰에서 settings 는 마이페이지로 읽는다(저장된 마지막 화면 · 태블릿 설정 화면에서 창이 좁아진 경우). 태블릿 값은 그대로 둔다.
export const normalizePageForFormFactor = (page, isPhone) => (isPhone && page === 'settings' ? 'profile' : page);
