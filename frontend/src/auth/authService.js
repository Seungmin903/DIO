import { Platform } from 'react-native';
import { createAuthApi, authBaseUrl } from './authApi';
import { buildPhotoBody } from './photoUpload';
import { createDevelopmentAccessStore } from './developmentAccessStore';
import { legacyAccessKeychain } from './legacyAccessKeychain';
import { signInWithGoogle } from './googleLogin';
import { signInWithApple } from './appleLogin';
import { fetch as authFetch } from 'expo/fetch';

const host = Platform.OS === 'android' ? '10.0.2.2' : (globalThis.location?.hostname || 'localhost');
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
// A store build must never silently target the Android emulator when its build-time
// API URL was omitted. Development keeps the convenient local-server fallback.
if (!__DEV__ && !configuredApiBaseUrl) throw new Error('운영 API 주소가 설정되지 않았어요. EXPO_PUBLIC_API_BASE_URL을 확인해 주세요.');
export const apiBaseUrl = authBaseUrl(configuredApiBaseUrl || `http://${host}:8080/api`);
export const accessTokenHeader = process.env.EXPO_PUBLIC_AUTH_TOKEN_HEADER || 'Authorization';
export const authService = createAuthApi({
  baseUrl: apiBaseUrl,
  buildPhotoBody,
  googleSignIn: signInWithGoogle,
  appleSignIn: signInWithApple,
  fetchImpl: authFetch,
  allowDevelopmentAccess: __DEV__,
  // Release builds never read or write the saved dev-server credential.
  developmentAccessStore: __DEV__ ? createDevelopmentAccessStore({ platform: Platform.OS, legacyKeychain: legacyAccessKeychain }) : null,
  accessTokenHeader,
});
