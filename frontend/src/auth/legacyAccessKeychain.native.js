import * as SecureStore from 'expo-secure-store';

// 예전 빌드가 Keychain·Keystore에 남긴 개발 서버 접속 정보를 지울 때만 쓴다. 새 값은 저장하지 않는다.
export const legacyAccessKeychain = SecureStore;
