import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { useNotifications } from '../notifications/useNotifications';
import { createSharingApi } from './sharingApi';
import { authService } from '../auth/authService';
import { buildPhotoBody } from '../auth/photoUpload';
import { fetch as sharingFetch } from 'expo/fetch';

// useSyncExternalStore는 같은 스냅샷 참조를 돌려받아야 다시 그리기를 멈춘다.
const GUEST_SNAPSHOT = Object.freeze({ diaries: [], joined: [], library: [] });

// 게스트는 공유 데이터를 만들거나 가짜 초대를 받지 않는다. 공유 진입은 LoginGate가 로그인으로 안내한다.
function createGuestSharing(user = {}) {
  const self = { id: null, nickname: user.nickname || '방문자', photoUri: user.photoUri || null };
  const emptyPage = async () => ({ items: [], hasNext: false, nextCursor: null });
  const unavailable = async () => { throw new Error('로그인이 필요해요.'); };
  return {
    self, server: false, supportsReadState: false, supportsExportSettings: false, canOpenDiary: false,
    notificationApi: { list: emptyPage, count: async () => ({ unreadCount: 0, actionableUnreadCount: 0 }), read: unavailable, readAll: unavailable, remove: unavailable },
    invitationGateway: { get: unavailable },
    getSnapshot: () => GUEST_SNAPSHOT,
    subscribe: () => () => {}, activate() {}, dispose() {},
    setAccountProfile(value = {}) { self.nickname = value.nickname || '방문자'; self.photoUri = value.photoUri || null; },
  };
}

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
  return { runtime, notifications, ...state };
}
