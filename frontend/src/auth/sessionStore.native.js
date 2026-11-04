import * as SecureStore from 'expo-secure-store';
import { createSecureSessionStore } from './secureSessionStore';

export const sessionStore = createSecureSessionStore(SecureStore);
