import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from '../editor/services/storage';
import { blockedParticipants, createSafetyStore, warningIsDismissed, warningKey } from './safetyModel';
import SafetyScreen from './SafetyScreen';
import { createSafetyApi } from './safetyApi';
import { authService } from '../auth/authService';
import { fetch as safetyFetch } from 'expo/fetch';
import { buildReportBody } from './reportBody';
import { createUnavailableSafetyAdapter } from './safetyModel';

const Context = createContext(null);
export const useSafety = () => useContext(Context);

// Mount with an account/session key: neither report drafts nor old requests survive a session change.
export default function SafetyProvider({ user, adapter, sharingRuntime, children, evidencePicker }) {
  const service = useMemo(() => adapter || (user?.mode === 'authenticated'
    ? createSafetyApi({ userId: user.userId, auth: authService, fetchImpl: safetyFetch, buildReportBody,
      getParticipants: sharingRuntime?.getMembers }) : createUnavailableSafetyAdapter()), [adapter, user?.mode, user?.userId, sharingRuntime]);
  const store = useMemo(() => createSafetyStore(service), [service]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [request, setRequest] = useState(null);
  const pendingWarning = useRef(null);
  const alive = useRef(true);
  const guardJob = useRef(0);
  const accountId = String(user?.userId || user?.accountId || 'guest');
  useEffect(() => {
    alive.current = true; store.activate();
    if (store.mode === 'preview') store.refresh();
    return () => {
      alive.current = false; guardJob.current++; store.dispose();
      pendingWarning.current?.(false); pendingWarning.current = null;
    };
  }, [store]);
  const close = useCallback(() => {
    setRequest(null);
    request?.onClosed?.();
  }, [request]);
  const openParticipants = useCallback((diary, { target, onClosed } = {}) => {
    setRequest({ kind: 'participants', diary, target, onClosed });
  }, []);
  const openBlocks = useCallback(() => setRequest({ kind: 'blocks' }), []);
  const finishWarning = useCallback(async (proceed, dismiss, rows, diary) => {
    if (proceed && dismiss) {
      const saved = await saveJSON(warningKey(accountId, diary.id), rows.map(row => row.id));
      if (!saved) throw new Error('안내 설정을 저장하지 못했어요. 다시 시도하거나 체크를 해제해 주세요.');
    }
    pendingWarning.current?.(proceed); pendingWarning.current = null;
    if (alive.current) setRequest(null);
  }, [accountId]);
  const canOpenDiary = useCallback(async diary => {
    const job = ++guardJob.current;
    pendingWarning.current?.(false); pendingWarning.current = null;
    if (store.mode === 'unavailable') return true;
    // Personal diaries must not acquire a dependency on moderation endpoints.
    if (store.mode === 'server' && !diary.sharedDiaryId && !diary.isShared && diary.visibility !== 'MEMBERS' && diary.type !== '공유') return true;
    if (store.mode === 'preview') await store.refresh();
    const members = await store.participants(diary.sharedDiaryId || diary.id);
    const rows = store.mode === 'server' ? members.filter(member => member.blockedByMe === true)
      : blockedParticipants(members, store.getSnapshot().blocks);
    const saved = await loadJSON(warningKey(accountId, diary.id), []);
    if (!alive.current || job !== guardJob.current) return false;
    if (!rows.length || warningIsDismissed(Array.isArray(saved) ? saved : [], rows)) return true;
    return new Promise(resolve => {
      pendingWarning.current = resolve;
      setRequest({ kind: 'warning', diary, rows });
    });
  }, [accountId, store]);
  const context = useMemo(() => ({ store, state, openParticipants, openBlocks, canOpenDiary }), [store, state, openParticipants, openBlocks, canOpenDiary]);
  return <Context.Provider value={context}>
    {children}
    {request && <SafetyScreen key={`${accountId}:${request.kind}:${request.diary?.id || ''}`} request={request}
      user={user} store={store} state={state} onClose={close} onWarning={finishWarning} evidencePicker={evidencePicker} />}
  </Context.Provider>;
}
