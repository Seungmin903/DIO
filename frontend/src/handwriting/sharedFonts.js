import { loadAsync } from 'expo-font'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { clearSharedTextFonts, loadedFontFamily, markTextFontFailed, markTextFontLoaded, registerSharedTextFonts } from '../editor/utils/text.js'
import { loadFontLibrary } from './storage.js'
import { cachedSharedFontUri, clearSharedFontBytes, releaseSharedFontUris, removeSharedFontBytes, saveSharedFontBytes, sharedFontUploadBody } from './files'

// 공유 다이어리 폰트(collaboration/diaryFonts.js)가 쓰는 기기 쪽 연결: 내 폰트 목록 · 폰트 파일 저장 · 글꼴 등록.
const familyOf = fileId => `DIOHW_${fileId.replaceAll('-', '')}`
const sharedUris = new Map() // fileId → 받은 폰트 파일 uri(내보내기에서 다시 읽는다)
// 받은 폰트 캐시의 주인(계정 · 서버). 다른 주인으로 열면 이전 계정이 받은 파일을 기기에서 지운다
const OWNER_KEY = 'dio:shared-fonts:owner:v1'

export const sharedFontUri = fileId => sharedUris.get(fileId) ?? null

export const sharedFontFiles = {
  upload: sharedFontUploadBody,
  cachedUri: cachedSharedFontUri,
  save: saveSharedFontBytes,
}

export const sharedFontLibrary = {
  mine: loadFontLibrary,
  has: fileId => Boolean(loadedFontFamily(`personal-${fileId}`)),
  register(fonts) {
    for (const { fileId, uri } of fonts) sharedUris.set(fileId, uri)
    registerSharedTextFonts(fonts.map(({ fileId }) => ({ id: `personal-${fileId}`, family: familyOf(fileId) })))
    for (const { fileId, mediaFileId, uri } of fonts) {
      const family = familyOf(fileId)
      loadAsync({ [family]: { uri } }).then(() => markTextFontLoaded(family), () => {
        // 기기가 읽지 못한 파일은 캐시에 남기지 않는다(다음에 다시 받는다)
        markTextFontFailed(family)
        sharedUris.delete(fileId)
        removeSharedFontBytes(mediaFileId).catch(() => {})
      })
    }
  },
  // 같은 폰트 id 를 다른 파일이 주장하게 됐을 때: 그 친구 폰트로 더는 그리지 않는다
  unregister(fileIds) {
    for (const fileId of fileIds) sharedUris.delete(fileId)
    clearSharedTextFonts(fileIds.map(fileId => `personal-${fileId}`))
  },
}

/** 편집 세션을 열 때: 다른 계정이 받아 둔 폰트 파일이 있으면 지운다 */
export async function claimSharedFonts(owner) {
  const previous = await AsyncStorage.getItem(OWNER_KEY).catch(() => null)
  if (previous === owner) return
  await clearSharedFontBytes().catch(() => {})
  await AsyncStorage.setItem(OWNER_KEY, owner).catch(() => {})
}

/** 편집 세션을 닫을 때(다이어리를 나가거나 로그아웃 · 계정 전환): 받은 친구 폰트를 더는 그리지 않게 목록에서 빼고 웹 object URL 을 푼다 */
export function releaseSharedFonts() {
  sharedUris.clear()
  clearSharedTextFonts()
  releaseSharedFontUris()
}
