import { Platform } from 'react-native';
import { createAuthApi, authBaseUrl } from './authApi';
import { buildPhotoBody } from './photoUpload';
import { createDevelopmentAccessStore } from './developmentAccessStore';
import { fetch as authFetch } from 'expo/fetch';

const host = Platform.OS === 'android' ? '10.0.2.2' : (globalThis.location?.hostname || 'localhost');
export const apiBaseUrl = authBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL || `http://${host}:8080/api`);
export const accessTokenHeader = process.env.EXPO_PUBLIC_AUTH_TOKEN_HEADER || 'Authorization';
export const authService = createAuthApi({
  baseUrl: apiBaseUrl,
  buildPhotoBody,
  fetchImpl: authFetch,
  allowDevelopmentAccess: __DEV__,
  // Release builds never read or write the saved dev-server credential.
  developmentAccessStore: __DEV__ ? createDevelopmentAccessStore({ platform: Platform.OS }) : null,
  accessTokenHeader,
});
