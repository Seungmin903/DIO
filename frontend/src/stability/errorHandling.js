import { Platform } from 'react-native';
import config from '../../app.json';
import { createErrorDiagnostics } from './errorDiagnostics';
import { installGlobalErrorHandlers } from './globalErrorHandlers';

// Load storage only when recording, so a storage initialization failure cannot block the handler.
const storage = {
  getItem: key => require('@react-native-async-storage/async-storage').default.getItem(key),
  setItem: (key, value) => require('@react-native-async-storage/async-storage').default.setItem(key, value),
};
const DIAGNOSTICS = Symbol.for('dio.app-error-diagnostics.v1');
// Fast Refresh must keep the same writer as the already-installed global handler.
const diagnostics = globalThis[DIAGNOSTICS] ??= createErrorDiagnostics({ storage, platform: Platform.OS, appVersion: config.expo.version });
export const reportAppError = (error, details) => diagnostics.report(error, details);
export const readAppErrorDiagnostics = () => diagnostics.read();

export function initializeErrorHandling() {
  try { installGlobalErrorHandlers({ report: reportAppError, web: Platform.OS === 'web' }); }
  catch { /* Keep the runtime's built-in handling if custom observation cannot be installed. */ }
  void diagnostics.read().catch(() => {});
}
