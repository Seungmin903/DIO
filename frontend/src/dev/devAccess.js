// 개발용 둘러보기 장치 (출시 전에 뺀다).
// - 앱을 켤 때 '일반 사용자'와 '개발자 모드' 중 하나를 고른다(StartModeScreen).
// - 개발자 모드: 로그인한 사용자처럼 모든 기능이 열리고, 받은 초대 알림(목업)이 들어 있다.
// - 일반 사용자: 로그인 전 게스트 그대로. 목업은 하나도 없다.
// 보관함 예시 다이어리는 두 모드 모두 넣지 않는다(전에 넣어 둔 것은 지운다).
// 개발 빌드(__DEV__)에서만 켜진다. 출시 빌드는 고르는 화면 없이 일반 사용자로 시작하고, 개발자 모드로 로그인 안내를 건너뛸 수 없다.
// 출시 빌드로 내부 확인이 필요하면 빌드할 때 EXPO_PUBLIC_DEV_ACCESS=true 를 준다.
// 완전히 지우려면 이 폴더와 App.js 의 devAccess · StartModeScreen import · 쓰는 곳을 지운다.
import { loadJSON, removeJSON, saveJSON, STORAGE_KEYS } from '../editor/services/storage'

export const DEV_ACCESS = (typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_DEV_ACCESS === 'true'

// 전에 쓰던 '예시 다이어리를 한 번 넣었는지' 표시. 이제 쓰지 않으므로 지운다.
const LEGACY_MOCK_SEEDED = 'dio:dev:mock-seeded:v1'

// 전에 보관함에 넣던 예시 다이어리(목업). 이제는 넣지 않고, 남아 있으면 지운다.
const MOCK_IDS = ['mock-travel', 'mock-class', 'mock-study']

/** 전에 넣어 둔 예시 다이어리를 지운다. 사용자가 만든 다이어리는 건드리지 않는다. */
export async function clearMockLibrary() {
  await removeJSON(LEGACY_MOCK_SEEDED)
  // 문서를 먼저 지운다. 문서만 남으면 보관함이 목록에 되살린다(recoverOrphanDiaries).
  for (const id of MOCK_IDS) await removeJSON(`${STORAGE_KEYS.doc}:${id}`)
  const saved = await loadJSON(STORAGE_KEYS.diaries, [])
  if (Array.isArray(saved) && saved.some(diary => MOCK_IDS.includes(diary?.id)))
    await saveJSON(STORAGE_KEYS.diaries, saved.filter(diary => !MOCK_IDS.includes(diary?.id)))
}
