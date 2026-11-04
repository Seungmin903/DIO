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
// EAS preview/production profiles inject the public HTTPS URL. Keep the fallback
// loadable for local and static web builds, where the app otherwise cannot render.
export const apiConfigurationError = !__DEV__ && Platform.OS !== 'web' && !configuredApiBaseUrl;
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
