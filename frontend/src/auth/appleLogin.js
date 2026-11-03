export function isAppleLoginSupported() { return false; }
export async function signInWithApple() { throw new Error('애플 로그인은 iPhone·iPad DIO 앱에서 이용해 주세요.'); }
