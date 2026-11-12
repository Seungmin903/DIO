import { sessionStore } from './sessionStore';
import { Platform } from 'react-native';
import { createAuthApi, authBaseUrl } from './authApi';
import { buildPhotoBody } from './photoUpload';
import { createDevelopmentAccessStore } from './developmentAccessStore';
import { legacyAccessKeychain } from './legacyAccessKeychain';
import { signInWithGoogle, revokeGoogleAccess } from './googleLogin';
import { signInWithApple } from './appleLogin';
import { fetch as authFetch } from 'expo/fetch';
import { isSecureApiBaseUrl } from '../shared/apiBaseUrlPolicy';
import { clearMediaThumbnailFiles } from '../diary/services/mediaThumbnailFiles';

const host = Platform.OS === 'android' ? '10.0.2.2' : (globalThis.location?.hostname || 'localhost');
const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
// EAS release builds and static web exports must inject a public HTTPS URL.
// The fallback is kept only for local development, where Expo sets __DEV__.
const hasSecureConfiguredApi = isSecureApiBaseUrl(configuredApiBaseUrl);
export const apiConfigurationError = !__DEV__ && !hasSecureConfiguredApi;
// Keep authService loadable so App can show the configuration-error screen instead
// of failing during module initialization when a release URL is invalid.
export const apiBaseUrl = authBaseUrl(apiConfigurationError ? 'https://api-configuration.invalid/api' : (configuredApiBaseUrl || `http://${host}:8080/api`));
export const accessTokenHeader = process.env.EXPO_PUBLIC_AUTH_TOKEN_HEADER || 'Authorization';
export const authService = createAuthApi({
  baseUrl: apiBaseUrl,
  sessionStore,
  clearSessionData: clearMediaThumbnailFiles,
  buildPhotoBody,
  googleSignIn: signInWithGoogle,
  googleRevoke: revokeGoogleAccess,
  appleSignIn: signInWithApple,
  fetchImpl: authFetch,
  allowDevelopmentAccess: __DEV__,
  // Release builds never read or write the saved dev-server credential.
  developmentAccessStore: __DEV__ ? createDevelopmentAccessStore({ platform: Platform.OS, legacyKeychain: legacyAccessKeychain }) : null,
  // 개발 실행 전용. frontend/.env의 EXPO_PUBLIC_QA_ACCESS_ID·PASSWORD로 개발 서버 Basic 인증을 미리 붙인다.
  presetDevelopmentAccess: __DEV__ ? { username: process.env.EXPO_PUBLIC_QA_ACCESS_ID, password: process.env.EXPO_PUBLIC_QA_ACCESS_PASSWORD } : null,
  accessTokenHeader,
});
