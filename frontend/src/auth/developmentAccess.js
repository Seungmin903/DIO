// ASCII HTTP Basic credentials, kept only in the service instance's memory.
export function developmentAuthorization(base, username, password) {
  if (new URL(base).protocol !== 'https:') throw new Error('개발 서버 접속 정보는 HTTPS 주소에서만 사용할 수 있어요.');
  if (!username || !password || username.includes(':') || !/^[\x20-\x7e]+$/.test(username + password)) {
    throw new Error('개발 서버 ID와 비밀번호를 확인해 주세요.');
  }
  const value = `${username}:${password}`;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let encoded = '';
  for (let i = 0; i < value.length; i += 3) {
    const a = value.charCodeAt(i), b = value.charCodeAt(i + 1), c = value.charCodeAt(i + 2);
    encoded += alphabet[a >> 2] + alphabet[((a & 3) << 4) | (Number.isNaN(b) ? 0 : b >> 4)] +
      (Number.isNaN(b) ? '=' : alphabet[((b & 15) << 2) | (Number.isNaN(c) ? 0 : c >> 6)]) +
      (Number.isNaN(c) ? '=' : alphabet[c & 63]);
  }
  return `Basic ${encoded}`;
}
