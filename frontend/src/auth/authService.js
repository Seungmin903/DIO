import { Platform } from 'react-native';
import { createAuthApi } from './authApi';
import { buildPhotoBody } from './photoUpload';

const host = Platform.OS === 'android' ? '10.0.2.2' : (globalThis.location?.hostname || 'localhost');
export const authService = createAuthApi({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || `http://${host}:8080/api`,
  buildPhotoBody,
});
