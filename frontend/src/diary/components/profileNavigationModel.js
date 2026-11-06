// 설정 진입은 폼 팩터마다 다르다. 폰은 마이페이지 안에 설정이 펼쳐지고(별도 설정 화면 없음),
// 태블릿은 프로필 화면과 좌측 바 `설정`의 별도 설정 화면이 분리된다.
export const showsInlineSettings = ({ compact, section = 'profile' }) => Boolean(compact && section !== 'settings');

// 이름 옆 로그인 버튼이 이름을 자르지 않고 들어가는 창 폭(글자 배율을 뺀 dp). 게스트 이름 `방문자` 기준 실측
export const LOGIN_INLINE_MIN_WIDTH = 340;

// 폰 게스트의 `로그인 · 회원가입` 버튼 자리. 이름 옆이 기본이고, 좁은 창 · 큰 글자 설정에서는 이름 아래 전폭으로 내린다.
// 태블릿과 회원은 늘 이름 옆(회원은 로그인 버튼이 없다).
export const placesLoginBelow = ({ guest, compact, width, fontScale = 1 }) =>
  Boolean(guest && compact && width / (fontScale || 1) < LOGIN_INLINE_MIN_WIDTH);

// 폰에서 settings 는 마이페이지로 읽는다(저장된 마지막 화면 · 태블릿 설정 화면에서 창이 좁아진 경우). 태블릿 값은 그대로 둔다.
export const normalizePageForFormFactor = (page, isPhone) => (isPhone && page === 'settings' ? 'profile' : page);
