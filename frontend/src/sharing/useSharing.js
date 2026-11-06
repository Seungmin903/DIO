import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { useNotifications } from '../notifications/useNotifications';
import { createSharingApi } from './sharingApi';
import { createGuestSharing } from './guestSharing';
import { authService } from '../auth/authService';
import { buildPhotoBody } from '../auth/photoUpload';
import { fetch as sharingFetch } from 'expo/fetch';

export function useSharing(user) {
  const sessionKey = user?.mode === 'authenticated' ? authService.getSessionKey() : null;
  const runtime = useMemo(() => user?.mode === 'authenticated'
    ? createSharingApi({ user, auth: authService, fetchImpl: sharingFetch, buildPhotoBody })
    : createGuestSharing(user), [user?.accountId, user?.userId, user?.mode, sessionKey]);
  useEffect(() => { runtime.setAccountProfile(user); }, [runtime, user]);
  const notifications = useNotifications(runtime.notificationApi, runtime.invitationGateway);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  useEffect(() => {
    runtime.activate();
    return () => runtime.dispose();
  }, [runtime]);
  useEffect(() => {
    runtime.setWatchingActive?.(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', next => runtime.setWatchingActive?.(next === 'active'));
    return () => subscription.remove();
  }, [runtime]);
  return { runtime, notifications, ...state };
}
