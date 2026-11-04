// 릴리스 앱과 정적 웹 export가 함께 쓰는 API 주소 판정 기준.
// 같은 출처 상대 경로(`/api`)는 허용하지 않는다. 배포 Nginx가 정적 웹 번들을 서비스하지 않으므로
// 웹 배포본도 production 절대 HTTPS 주소를 쓰고, 다른 출처에서 열리면 백엔드 CORS 허용에 의존한다.
// scripts/export-licensed-web.cjs도 이 모듈을 require하므로 두 검사 기준이 어긋나지 않는다.
const SECURE_API_BASE_URL = /^https:\/\/[^\s/?#]+(?:[/?#]|$)/i;

export function isSecureApiBaseUrl(value) {
  return typeof value === 'string' && SECURE_API_BASE_URL.test(value);
}
