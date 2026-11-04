// 릴리스 앱과 정적 웹 export가 함께 쓰는 API 주소 판정 기준.
// 같은 출처 상대 경로(`/api`)는 허용하지 않는다. 배포 Nginx가 정적 웹 번들을 서비스하지 않으므로
// 웹 배포본도 production 절대 HTTPS 주소를 쓰고, 다른 출처에서 열리면 백엔드 CORS 허용에 의존한다.
// scripts/export-licensed-web.cjs도 이 모듈을 동적 import하므로 두 검사 기준이 어긋나지 않는다.
//
// React Native의 URL 구현은 hostname 등 일부 속성을 지원하지 않던 이력이 있어 new URL()에 기대지 않고
// 권한부(authority)를 직접 나눠 검사한다. 사용자 정보(`user@`)는 받지 않는다.
const HTTPS_PREFIX = /^https:\/\//i;
const DNS_LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^${DNS_LABEL}(?:\\.${DNS_LABEL})*\\.?$`, 'i');
const IPV6_LITERAL = /^\[[0-9a-f:.]+\]$/i;
const PORT = /^[0-9]{1,5}$/;

function isValidHost(host) {
  if (IPV6_LITERAL.test(host)) return host.includes(':');
  return host.length <= 253 && HOSTNAME.test(host);
}

function isValidPort(port) {
  if (port === undefined) return true;
  if (!PORT.test(port)) return false;
  const value = Number(port);
  return value >= 1 && value <= 65535;
}

export function isSecureApiBaseUrl(value) {
  if (typeof value !== 'string' || !HTTPS_PREFIX.test(value) || /\s/.test(value)) return false;
  const rest = value.slice('https://'.length);
  const authority = rest.split(/[/?#]/, 1)[0];
  if (!authority || authority.includes('@')) return false;
  const match = /^(\[[^\]]*\]|[^:]*)(?::(.*))?$/.exec(authority);
  if (!match) return false;
  const [, host, port] = match;
  return isValidHost(host) && isValidPort(port);
}
