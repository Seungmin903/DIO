import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createLibraryReader } from '../services/libraryReader.js';

export function useLibraryReader(api, scopeKey, makeRequest) {
  // 계정 경계에서는 빈 저장소부터 시작한다. 이전 요청은 cleanup에서 취소한다.
  const reader = useMemo(() => createLibraryReader(api, { makeRequest }), [api, scopeKey, makeRequest]);
  const state = useSyncExternalStore(reader.subscribe, reader.getSnapshot, reader.getSnapshot);
  useEffect(() => { reader.activate(); return () => reader.dispose(); }, [reader]);
  return { ...state, reader };
}
