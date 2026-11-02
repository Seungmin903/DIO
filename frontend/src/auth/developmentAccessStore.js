import { Platform } from 'react-native';

// 개발 서버 Basic 헤더는 앱 실행 중에만 유지한다. 로그인 토큰과 비밀번호는
// 저장하지 않으며, 네이티브 모듈을 요구하지 않아 기존 개발 빌드에서도 동작한다.
const valid = value => typeof value === 'string' && /^Basic [A-Za-z0-9+/]+={0,2}$/.test(value);
// authService는 모듈 초기화 때 한 번만 만들지만, 다른 호출 경로가 팩토리를
// 다시 불러도 같은 앱 실행 동안에는 개발 접속 정보를 유지한다.
const values = new Map();
// 예전 빌드는 서버 origin별로 이 키에 Basic 헤더를 Keychain·Keystore에 남겼다.
export const legacyAccessKey = origin => `dio_dev_access_${origin.replace(/[^A-Za-z0-9._-]/g, '_')}`;
// 앱 실행마다 origin별로 한 번만 지운다. 실패하면 다음 실행 때 다시 시도한다.
const legacyCleared = new Set();

export function createDevelopmentAccessStore({ platform = Platform.OS, legacyKeychain = null } = {}) {
  // 웹은 기존처럼 저장소를 만들지 않는다. 개발 접속 입력 UI의 노출 조건도
  // native와 같게 유지하면서, 웹 번들에는 네이티브 모듈을 추가하지 않는다.
  if (platform === 'web') return null;
  // 예전 값은 읽지 않고 지우기만 한다. 앱 시작 때 authApi가 load(origin)을 부르므로 그때 함께 정리된다.
  const removeLegacy = origin => {
    if (!legacyKeychain || legacyCleared.has(origin)) return;
    legacyCleared.add(origin);
    Promise.resolve().then(() => legacyKeychain.deleteItemAsync(legacyAccessKey(origin))).catch(() => legacyCleared.delete(origin));
  };
  return {
    async load(origin) {
      removeLegacy(origin);
      const value = values.get(origin);
      return valid(value) ? value : null;
    },
    async save(origin, value) { values.set(origin, value); },
    async clear(origin) { values.delete(origin); },
    async clearAll() { values.clear(); },
  };
}
