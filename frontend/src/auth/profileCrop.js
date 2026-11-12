// 프로필 사진 자르기 요청 저장소. 앱 맨 위의 ProfileCropHost 가 앱 화면(동그라미 틀)으로 자르고, 고른 사진 주소를 돌려준다.
// 기기 기본 자르기 화면(allowsEditing) 대신 쓴다. 호스트가 없을 때(테스트 · 앱 시작 직후)는 자르지 않은 사진을 그대로 돌려준다.

let request = null;
let hosts = 0;
let sequence = 0;
const listeners = new Set();
const emit = () => listeners.forEach(listener => listener());

export const profileCropStore = {
  subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  getSnapshot: () => request,
  attach() { hosts += 1; return () => { hosts -= 1; }; },
  /** 자르기를 끝낸다. uri 가 null 이면 취소다. id 를 주면 그 요청일 때만 끝낸다(닫힌 뒤 늦게 끝난 자르기가 다음 요청을 끝내지 않게). */
  settle(uri, id) {
    const current = request;
    if (id != null && current?.id !== id) return;
    request = null;
    emit();
    current?.resolve(uri ?? null);
  },
};

/** asset: { uri, width?, height? }. 자른 사진 주소, 취소하면 null 을 돌려준다. */
export function cropProfilePhoto(asset) {
  if (!hosts) return Promise.resolve(asset.uri);
  // 앞 요청이 남아 있으면(빠르게 두 번 고른 경우) 취소로 끝낸다
  if (request) profileCropStore.settle(null);
  return new Promise(resolve => {
    request = { id: ++sequence, asset, resolve };
    emit();
  });
}
