import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDiaryEditor } from '../services/diaryEditor.js';

export function useDiaryEditor(api) {
  const editor = useMemo(() => createDiaryEditor(api), [api]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => () => editor.dispose(), [editor]);
  return { ...state, editor };
}
