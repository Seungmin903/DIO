import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { loadJSON, saveJSON } from '../editor/services/storage';
import { blockedParticipants, createSafetyStore, warningIsDismissed, warningKey } from './safetyModel';
import SafetyScreen from './SafetyScreen';

const Context = createContext(null);
export const useSafety = () => useContext(Context);

// Mount with an account/session key: neither report drafts nor old requests survive a session change.
export default function SafetyProvider({ user, adapter, children, evidencePicker }) {
  const store = useMemo(() => createSafetyStore(adapter), [adapter]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [request, setRequest] = useState(null);
  const pendingWarning = useRef(null);
  const alive = useRef(true);
  const guardJob = useRef(0);
  const accountId = String(user?.userId || user?.accountId || 'guest');
  useEffect(() => {
    alive.current = true; store.activate();
    if (store.mode !== 'unavailable') store.refresh();
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
    // No server block data exists yet. Do not invent restrictions or mutate diary access.
    if (store.mode === 'unavailable') return true;
    await store.refresh();
    if (!alive.current || job !== guardJob.current) return false;
    if (store.getSnapshot().status !== 'ready') throw new Error('차단 정보를 확인하지 못했어요. 다시 시도해 주세요.');
    const members = await store.participants(diary.sharedDiaryId || diary.id);
    const rows = blockedParticipants(members, store.getSnapshot().blocks);
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
