import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { createNotificationStore, startNotificationRefresh } from './notificationStore.js';
import { createNotificationActivity } from './notificationActivity.js';

export function useNotifications(api, invitations) {
  const store = useMemo(() => createNotificationStore(api, invitations), [api, invitations]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    const web = Platform.OS === 'web' && typeof document !== 'undefined';
    const stop = startNotificationRefresh(store, createNotificationActivity({ appState: AppState, document: web ? document : undefined }));
    return () => { stop(); store.dispose(); };
  }, [store]);
  return { ...state, store };
}
