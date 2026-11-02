import { loadJSON, removeJSON, saveJSON, STORAGE_KEYS } from '../../editor/services/storage';

// 이전 개발 빌드가 기기에 남긴 예시 보관함(목업)을 지운다. 고정 ID 세 개만 지우고, 사용자가 만든 다이어리는 건드리지 않는다.
export const LEGACY_SAMPLE_IDS = ['mock-travel', 'mock-class', 'mock-study'];
const LEGACY_SEEDED_KEY = 'dio:dev:mock-seeded:v1';
// 정리를 마쳤다는 표시. 다 지운 뒤에만 남겨, 중간에 실패하면 다음 실행 때 다시 시도한다.
export const LEGACY_SAMPLE_CLEANUP_KEY = 'dio:legacy-samples-removed:v1';

/** 정리를 끝까지 마쳤으면 true. 보관함을 읽기 전에 기다려야 지운 예시가 목록에 다시 보이지 않는다. */
export async function removeLegacySampleDiaries() {
  if (await loadJSON(LEGACY_SAMPLE_CLEANUP_KEY, false)) return true;
  let ok = await removeJSON(LEGACY_SEEDED_KEY);
  // 문서를 먼저 지운다. 문서만 남으면 보관함이 목록에 되살린다(recoverOrphanDiaries).
  for (const id of LEGACY_SAMPLE_IDS) ok = (await removeJSON(`${STORAGE_KEYS.doc}:${id}`)) && ok;
  const diaries = await loadJSON(STORAGE_KEYS.diaries, []);
  if (Array.isArray(diaries) && diaries.some(diary => LEGACY_SAMPLE_IDS.includes(diary?.id)))
    ok = (await saveJSON(STORAGE_KEYS.diaries, diaries.filter(diary => !LEGACY_SAMPLE_IDS.includes(diary?.id)))) && ok;
  return ok && saveJSON(LEGACY_SAMPLE_CLEANUP_KEY, true);
}
