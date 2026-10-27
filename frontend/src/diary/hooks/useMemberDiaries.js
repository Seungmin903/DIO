import { useEffect, useMemo, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createMemberDiaryApi } from '../services/memberDiaryApi.js'
import { createAuthenticatedMemberTransport } from '../services/memberTransport.js'
import { createMemberAppStore } from '../services/memberAppStore.js'
import { createId } from '../../editor/utils/common.js'

export function useMemberDiaries(accountId) {
  const sessionKey = authService.getSessionKey()
  const store = useMemo(() => createMemberAppStore({ accountId, storage: AsyncStorage, makeRequestId: () => `member-${createId()}`,
    api: createMemberDiaryApi(createAuthenticatedMemberTransport({ auth: authService, accountId, baseUrl: apiBaseUrl,
      accessTokenHeader, fetchImpl: memberFetch })) }), [accountId, sessionKey])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => { store.load().catch(() => {}); return () => store.dispose() }, [store])
  return { ...state, source: store.source, store, setDiaries: store.setDiaries,
    addDiary: async () => false, moveToTrash: () => false, moveManyToTrash: async () => false,
    restoreFromTrash: () => false, deletePermanently: async () => false,
    renameDiary: (id, title) => { const d = store.getSnapshot().diaries.find(d => d.id === id); return store.update(id, { title, color: d?.color, pattern: d?.pattern }) },
    trashNow: Date.now(), trashError: null, cleanupTrash: async () => {}, retryCreation: store.retryCreation,
  }
}
