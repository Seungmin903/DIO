// 예전 개발자 모드가 보관함에 넣던 예시 다이어리(목업)를 지운다. 개발자 모드는 뺐지만(docs/개발자 모드),
// 그때 테스트한 기기에 남아 있을 수 있어 게스트로 시작할 때마다 정리한다.
import { loadJSON, removeJSON, saveJSON, STORAGE_KEYS } from '../../editor/services/storage'

// 전에 쓰던 '예시 다이어리를 한 번 넣었는지' 표시
const LEGACY_MOCK_SEEDED = 'dio:dev:mock-seeded:v1'
const MOCK_IDS = ['mock-travel', 'mock-class', 'mock-study']

/** 예전 예시 다이어리를 지운다. 사용자가 만든 다이어리는 건드리지 않는다. */
export async function clearMockLibrary() {
  await removeJSON(LEGACY_MOCK_SEEDED)
  // 문서를 먼저 지운다. 문서만 남으면 보관함이 목록에 되살린다(recoverOrphanDiaries).
  for (const id of MOCK_IDS) await removeJSON(`${STORAGE_KEYS.doc}:${id}`)
  const saved = await loadJSON(STORAGE_KEYS.diaries, [])
  if (Array.isArray(saved) && saved.some(diary => MOCK_IDS.includes(diary?.id)))
    await saveJSON(STORAGE_KEYS.diaries, saved.filter(diary => !MOCK_IDS.includes(diary?.id)))
}
