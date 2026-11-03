// Shared by authentication and diary invitations. Keep the Java UserInput policy in sync.
const EMAIL_PATTERN = new RegExp("^(?=.{1,64}@)[\\p{L}\\p{M}\\p{N}!#$%&'*+/=?^_`{|}~-]+(?:\\.[\\p{L}\\p{M}\\p{N}!#$%&'*+/=?^_`{|}~-]+)*@(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?$", 'u');
const EDGE_WHITESPACE = new RegExp("^[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+|[\\u0009-\\u000D\\u0020\\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+$", 'g');
export const normalizeEmail = value => typeof value === 'string' ? value.replace(EDGE_WHITESPACE, '').toLowerCase() : null;
export function emailError(value) {
  const email = normalizeEmail(value);
  return email && email.length <= 254 && EMAIL_PATTERN.test(email) ? '' : '이메일 주소를 확인해 주세요.';
}
