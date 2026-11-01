import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Dev-server Basic header per server origin, kept in Keychain/Keystore. Web has no secure store.
const key = origin => `dio_dev_access_${origin.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const valid = value => typeof value === 'string' && /^Basic [A-Za-z0-9+/]+={0,2}$/.test(value);

export function createDevelopmentAccessStore(store = SecureStore, platform = Platform.OS) {
  if (platform === 'web') return null;
  return {
    async load(origin) {
      const value = await store.getItemAsync(key(origin));
      return valid(value) ? value : null;
    },
    save: (origin, value) => store.setItemAsync(key(origin), value),
    clear: origin => store.deleteItemAsync(key(origin)),
  };
}
