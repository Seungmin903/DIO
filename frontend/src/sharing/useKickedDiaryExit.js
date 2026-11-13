import { useEffect, useRef } from 'react';
import { watchKickedDiaryExit } from './kickedDiaryExit.js';

export function useKickedDiaryExit({ member, diary, runtime, ...actions }) {
  const latest = useRef(actions);
  latest.current = actions;
  const tabId = diary?.id, diaryId = diary?.sharedDiaryId;
  useEffect(() => watchKickedDiaryExit({ member, diary: { id: tabId, sharedDiaryId: diaryId }, runtime,
    getActions: () => latest.current }), [member, tabId, diaryId, runtime]);
}
