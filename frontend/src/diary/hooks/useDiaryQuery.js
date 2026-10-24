import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDiaryQuery } from '../services/diaryQuery.js';

export function useDiaryQuery(load) {
  const query = useMemo(() => createDiaryQuery(load), [load]);
  const state = useSyncExternalStore(query.subscribe, query.getSnapshot, query.getSnapshot);
  useEffect(() => () => query.cancel(), [query]);
  return { ...state, run: query.run, retry: query.retry, reset: query.reset };
}
