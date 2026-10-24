import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDiaryMutation } from '../services/diaryMutation.js';
export function useDiaryMutation(execute) {
  const mutation = useMemo(() => createDiaryMutation(execute), [execute]);
  const state = useSyncExternalStore(mutation.subscribe, mutation.getSnapshot, mutation.getSnapshot);
  useEffect(() => () => mutation.reset(), [mutation]);
  return { ...state, run: mutation.run, retry: mutation.retry, reset: mutation.reset,
    dismiss: mutation.dismiss, getPendingInput: mutation.getPendingInput };
}
