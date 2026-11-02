import { Platform } from 'react-native';

// 개발 서버 Basic 헤더는 앱 실행 중에만 유지한다. 로그인 토큰과 비밀번호는
// 저장하지 않으며, 네이티브 모듈을 요구하지 않아 기존 개발 빌드에서도 동작한다.
const valid = value => typeof value === 'string' && /^Basic [A-Za-z0-9+/]+={0,2}$/.test(value);
// authService는 모듈 초기화 때 한 번만 만들지만, 다른 호출 경로가 팩토리를
// 다시 불러도 같은 앱 실행 동안에는 개발 접속 정보를 유지한다.
const values = new Map();

export function createDevelopmentAccessStore({ platform = Platform.OS } = {}) {
  // 웹은 기존처럼 저장소를 만들지 않는다. 개발 접속 입력 UI의 노출 조건도
  // native와 같게 유지하면서, 웹 번들에는 네이티브 모듈을 추가하지 않는다.
  if (platform === 'web') return null;
  return {
    async load(origin) {
      const value = values.get(origin);
      return valid(value) ? value : null;
    },
    async save(origin, value) { values.set(origin, value); },
    async clear(origin) { values.delete(origin); },
    async clearAll() { values.clear(); },
  };
}
