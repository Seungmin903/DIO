import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNotifications } from '../notifications/useNotifications';
import { createSharingPreview } from './sharingPreview';

export function useSharing(user) {
  const runtime = useMemo(() => createSharingPreview({ user }), [user?.accountId]);
  useEffect(() => { runtime.setAccountProfile(user); }, [runtime, user]);
  const notifications = useNotifications(runtime.notificationApi, runtime.invitationGateway);
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot);
  useEffect(() => {
    runtime.activate();
    return () => runtime.dispose();
  }, [runtime]);
  return { runtime, notifications, ...state };
}
