import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import { createNotificationStore, startNotificationRefresh } from './notificationStore.js';

export function useNotifications(api, invitations) {
  const store = useMemo(() => createNotificationStore(api, invitations), [api, invitations]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => {
    store.activate();
    const web = Platform.OS === 'web' && typeof document !== 'undefined';
    let current = AppState.currentState;
    const stop = startNotificationRefresh(store, {
      isActive: () => web ? document.visibilityState !== 'hidden' : current === 'active' || current == null,
      subscribe(fn) {
        if (web) { document.addEventListener('visibilitychange', fn); return () => document.removeEventListener('visibilitychange', fn); }
        const subscription = AppState.addEventListener('change', value => { current = value; fn(); });
        return () => subscription.remove();
      },
    });
    return () => { stop(); store.dispose(); };
  }, [store]);
  return { ...state, store };
}
