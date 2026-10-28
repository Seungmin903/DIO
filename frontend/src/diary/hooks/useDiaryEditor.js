import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createDiaryEditor } from '../services/diaryEditor.js';

export function useDiaryEditor(api, makeInput) {
  const editor = useMemo(() => createDiaryEditor(api, makeInput), [api, makeInput]);
  const state = useSyncExternalStore(editor.subscribe, editor.getSnapshot, editor.getSnapshot);
  useEffect(() => () => editor.dispose(), [editor]);
  return { ...state, editor };
}
