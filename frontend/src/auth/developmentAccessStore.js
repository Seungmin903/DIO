// 개발 서버 Basic 헤더는 앱 실행 중에만 유지한다. 로그인 토큰과 비밀번호는
// 저장하지 않으며, 네이티브 모듈을 요구하지 않아 기존 개발 빌드에서도 동작한다.
const valid = value => typeof value === 'string' && /^Basic [A-Za-z0-9+/]+={0,2}$/.test(value);

export function createDevelopmentAccessStore() {
  const values = new Map();
  return {
    async load(origin) {
      const value = values.get(origin);
      return valid(value) ? value : null;
    },
    async save(origin, value) { values.set(origin, value); },
    async clear(origin) { values.delete(origin); },
  };
}
