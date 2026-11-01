export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function trashDeadline(diary) {
  if (!diary?.trashedAt) return null;
  const time = Date.parse(diary.trashedAt);
  return Number.isFinite(time) ? time + TRASH_RETENTION_MS : null;
}

export function isTrashExpired(diary, now = Date.now()) {
  const deadline = trashDeadline(diary);
  return Boolean(diary?.purgePending || (deadline !== null && now >= deadline));
}

/** 고른 다이어리에만 삭제 시각을 기록한다. 이미 휴지통에 있으면 기존 기한을 늘리지 않는다. */
export function markTrashed(diaries, ids, trashedAt) {
  const targets = new Set(ids);
  return diaries.map(diary => (targets.has(diary.id) && !diary.trashedAt ? { ...diary, trashedAt } : diary));
}

export function trashStatus(diary, now = Date.now()) {
  const deadline = trashDeadline(diary);
  if (diary.purgePending || (deadline !== null && now >= deadline)) return '보관 기한 만료 · 영구 삭제 대기';
  if (deadline === null) return '삭제 날짜 확인 필요 · 자동 삭제 보류';
  const days = Math.ceil((deadline - now) / (24 * 60 * 60 * 1000));
  return `${days}일 후 영구 삭제`;
}

/** 호출자는 목록 저장과 삭제를 같은 큐에서 실행한다. 삭제 표식은 문서보다 먼저 저장한다. */
export async function purgeTrashedDiary({ id, storage, keys, getDiaries, updateDiaries, forgetDoc, forgetView, collectMediaIds, removeMedia, collectSourceIds = () => [], removeSource = async () => {} }) {
  const diary = getDiaries().find(item => item.id === id);
  if (!diary?.trashedAt) return false;
  const targetKey = `${keys.doc}:${id}`;
  try {
    // 문서 삭제 도중 종료되어도 고아 복구로 살아나거나 빈 문서로 복원되지 않게 한다.
    const marked = getDiaries().map(item => item.id === id ? { ...item, purgePending: true } : item);
    await storage.setItem(keys.diaries, JSON.stringify(marked));
    updateDiaries(current => current.map(item => item.id === id ? { ...item, purgePending: true } : item));
    const targetRaw = await storage.getItem(targetKey);
    const allKeys = await storage.getAllKeys();
    const referenceKeys = allKeys.filter(key => (
      (key.startsWith(`${keys.doc}:`) && key !== targetKey) || key === keys.doc || key === keys.customDecor || key === keys.myCovers || key === keys.myPapers
    ));
    const references = referenceKeys.length ? await storage.multiGet(referenceKeys) : [];
    // 손상된 참조를 "미사용"으로 해석하지 않는다. 이 경우 미디어 파일은 보수적으로 보존한다.
    let unshared = [], unsharedSources = [];
    try {
      const target = targetRaw ? JSON.parse(targetRaw) : null;
      const parsed = references.map(([, raw]) => (raw ? JSON.parse(raw) : null));
      // 다른 다이어리의 표지(다이어리 목록에 들어 있다)가 같은 쪽 그림을 쓸 수 있다. 지우는 다이어리 자신의 표지는 제외한다.
      parsed.push(getDiaries().filter(item => item.id !== id));
      const retained = new Set(parsed.flatMap(value => collectMediaIds(value)));
      unshared = collectMediaIds(target).filter(mediaId => !retained.has(mediaId));
      // 불러온 PDF 원본도 같은 방식으로: 다른 문서 · 나의 속지가 쓰지 않을 때만 지운다.
      const retainedSources = new Set(parsed.flatMap(value => collectSourceIds(value)));
      unsharedSources = collectSourceIds(target).filter(sourceId => !retainedSources.has(sourceId));
    } catch {}
    // 열람 기록 삭제가 실패하면 문서를 보존하여 재시도에도 미디어 참조를 읽을 수 있게 한다.
    if (await forgetView(targetKey) === false) throw new Error('열람 기록 삭제 실패');
    await storage.removeItem(targetKey);
    forgetDoc(targetKey);
    await storage.setItem(keys.diaries, JSON.stringify(getDiaries().filter(item => item.id !== id)));
    updateDiaries(current => current.filter(item => item.id !== id));
    // 정리 실패는 다른 원본이나 문서를 손상시키지 않도록 고아 파일로 남긴다.
    await Promise.allSettled([...unshared.map(removeMedia), ...unsharedSources.map(removeSource)]);
    return true;
  } catch {
    return false;
  }
}
