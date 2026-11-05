// 로그인 · 로그아웃으로 본문이 새로 그려져도 보던 화면에서 이어 가기 위한 기억. 편집기는 열린 다이어리가 없어 돌아올 수 없으니 뺀다.
// 게스트 → 로그인은 같은 사람이 이어 가는 흐름이라 유지하고, 회원 계정을 벗어나면 다음 사람에게 넘기지 않고 처음으로 돌린다.
export const RETURNABLE_PAGES = ['library', 'studio', 'profile', 'settings', 'trash'];

export function createRouteMemory(home) {
  let route = home;
  let owner = null;
  return {
    read(nextOwner) {
      if (owner && owner !== nextOwner) { route = home; owner = null; }
      return route;
    },
    remember({ page, filter }, currentOwner) {
      route = { page: RETURNABLE_PAGES.includes(page) ? page : home.page, filter };
      owner = currentOwner ?? null;
    },
  };
}

// Android 뒤로 키가 갈 곳. 기본 보관함이 아니면 기본 보관함으로, 기본 보관함이면 null(앱 기본 동작)
export function backTarget({ page, filter }, home) {
  if (page !== home.page || filter !== home.filter) return home;
  return null;
}
