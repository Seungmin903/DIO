import { isSharingDiaryId } from './sharingApi.js';
import { isDiaryAccessLost } from './diaryAccessLoss.js';

// Independent of React so the actual exit flow can be tested without parsing App.js.
export function watchKickedDiaryExit({ member, diary, runtime, getActions }) {
  const tabId = diary?.id, diaryId = diary?.sharedDiaryId || tabId;
  if (!member || !isSharingDiaryId(diaryId) || !runtime.server || typeof runtime.watchDiary !== 'function') return undefined;
  let watching = true;
  const release = runtime.watchDiary(diaryId, { onUnavailable: (message, error) => {
    if (!watching) return;
    const actions = getActions();
    if (!isDiaryAccessLost(error)) { actions.notify('공유 상태 변경', message); return; }
    watching = false;
    actions.opening.current = null;
    actions.setTabIds(current => current.filter(id => id !== tabId));
    actions.setActive(current => current?.id === tabId ? null : current);
    actions.setSharingRequest(null);
    actions.returnToLibrary();
    actions.returnDiaryId.current = null;
    actions.notify('다이어리 접근 종료', '참여 권한이 없거나 삭제된 다이어리예요. 목록으로 돌아왔어요.');
    Promise.resolve().then(() => actions.reloadLibrary()).catch(() => {});
  } });
  return () => { watching = false; release(); };
}
