import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { AppState } from 'react-native'
import documentStorage from '../../editor/services/documentStorage'
import { fetch as memberFetch } from 'expo/fetch'
import { authService, apiBaseUrl, accessTokenHeader } from '../../auth/authService'
import { createMemberDiaryApi } from '../services/memberDiaryApi.js'
import { createAuthenticatedMemberTransport } from '../services/memberTransport.js'
import { createMemberAppStore } from '../services/memberAppStore.js'
import { createId } from '../../editor/utils/common.js'

export function useMemberDiaries(accountId) {
  const sessionKey = authService.getMemberSessionKey(accountId)
  const store = useMemo(() => createMemberAppStore({ accountId, storage: documentStorage, makeRequestId: () => createId(), serverLibrary: true,
    api: createMemberDiaryApi(createAuthenticatedMemberTransport({ auth: authService, accountId, baseUrl: apiBaseUrl,
      accessTokenHeader, fetchImpl: memberFetch })) }), [accountId, sessionKey])
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  useEffect(() => { store.load().catch(() => {}); return () => store.dispose() }, [store])
  useEffect(()=>{const subscription=AppState.addEventListener('change',next=>{if(next==='active'){store.reload().catch(()=>{});if(store.getSnapshot().trashLoaded)store.loadTrash().catch(()=>{});}});return ()=>subscription.remove();},[store]);
  return { ...state, trashedDiaries: state.trash, source: store.source, store, setDiaries: store.setDiaries,
    addDiary: async () => false, moveToTrash: id => store.lifecycle('trash',id), moveManyToTrash: ids => store.bulkTrash(ids),
    restoreFromTrash: id => store.lifecycle('restore',id), deletePermanently: id => store.lifecycle('purge',id),
    renameDiary: (id, title) => { const d = store.getSnapshot().diaries.find(d => d.id === id); return store.update(id, { title, color: d?.color, pattern: d?.pattern }) },
    trashNow: Date.now(), trashError: null, cleanupTrash: async () => {}, retryCreation: store.retryCreation,
  }
}
