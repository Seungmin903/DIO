import { Platform } from 'react-native';
import { createAuthApi, authBaseUrl } from './authApi';
import { buildPhotoBody } from './photoUpload';
import { createDevelopmentAccessStore } from './developmentAccessStore';
import { legacyAccessKeychain } from './legacyAccessKeychain';
import { fetch as authFetch } from 'expo/fetch';
import { developmentAccessEnabled } from './developmentAccessConfig';

const host = Platform.OS === 'android' ? '10.0.2.2' : (globalThis.location?.hostname || 'localhost');
export const apiBaseUrl = authBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL || `http://${host}:8080/api`);
export const accessTokenHeader = process.env.EXPO_PUBLIC_AUTH_TOKEN_HEADER || 'Authorization';
// Internal preview builds may need to pass through the development Nginx Basic
// gateway even though Expo sets __DEV__ to false for them. This must stay opt-in:
// production builds do not receive this environment variable.
export const authService = createAuthApi({
  baseUrl: apiBaseUrl,
  buildPhotoBody,
  fetchImpl: authFetch,
  allowDevelopmentAccess: developmentAccessEnabled,
  // The store is process-memory only; a release build never creates it.
  developmentAccessStore: developmentAccessEnabled ? createDevelopmentAccessStore({ platform: Platform.OS, legacyKeychain: legacyAccessKeychain }) : null,
  accessTokenHeader,
});
