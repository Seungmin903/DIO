import { Platform } from 'react-native';
import Constants from 'expo-constants';

// identityToken의 이메일은 화면 표시용으로만 읽는다. 인증 판단은 서버가 서명을 검증해서 한다.
export function tokenEmail(token) {
 try {
  const part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const json = decodeURIComponent(Array.from(globalThis.atob(part.padEnd(part.length + (4 - part.length % 4) % 4, '=')),
   c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''));
  const email = JSON.parse(json).email;
  return typeof email === 'string' && email.includes('@') ? email : null;
 } catch { return null; }
}

export function isAppleLoginSupported() { return Platform.OS === 'ios'; }

export async function signInWithApple() {
 if (Platform.OS !== 'ios') throw new Error('애플 로그인은 iPhone·iPad DIO 앱에서 이용해 주세요.');
 if (Constants.appOwnership === 'expo') throw new Error('애플 로그인은 Expo Go에서 사용할 수 없어요. DIO 개발 빌드로 실행해 주세요.');
 let sdk;
 try { sdk = await import('expo-apple-authentication'); }
 catch { throw new Error('애플 로그인 설정이 포함된 DIO 앱을 다시 설치해 주세요.'); }
 if (!(await sdk.isAvailableAsync())) throw new Error('이 기기에서는 애플 로그인을 사용할 수 없어요.');
 try {
  const credential = await sdk.signInAsync({
   requestedScopes: [sdk.AppleAuthenticationScope.FULL_NAME, sdk.AppleAuthenticationScope.EMAIL],
  });
  if (!credential?.identityToken) throw new Error('애플 인증 정보를 받지 못했어요. 다시 시도해 주세요.');
  // 이메일은 첫 로그인에만 credential에 오므로 토큰에서 읽는다.
  return { idToken: credential.identityToken, email: credential.email || tokenEmail(credential.identityToken) };
 } catch (error) {
  if (error?.code === 'ERR_REQUEST_CANCELED') throw new Error('애플 로그인을 취소했어요.');
  if (error?.code) throw new Error('애플 로그인을 완료하지 못했어요. 네트워크를 확인해 주세요.');
  throw error;
 }
}
