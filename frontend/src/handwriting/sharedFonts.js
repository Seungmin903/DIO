import { loadAsync } from 'expo-font'
import { loadedFontFamily, markTextFontFailed, markTextFontLoaded, registerSharedTextFonts } from '../editor/utils/text.js'
import { loadFontLibrary } from './storage.js'
import { cachedSharedFontUri, saveSharedFontBytes, sharedFontUploadBody } from './files'

// 공유 다이어리 폰트(collaboration/diaryFonts.js)가 쓰는 기기 쪽 연결: 내 폰트 목록 · 폰트 파일 저장 · 글꼴 등록.
const familyOf = fileId => `DIOHW_${fileId.replaceAll('-', '')}`
const sharedUris = new Map() // fileId → 받은 폰트 파일 uri(내보내기에서 다시 읽는다)

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
    for (const { fileId, uri } of fonts) {
      const family = familyOf(fileId)
      loadAsync({ [family]: { uri } }).then(() => markTextFontLoaded(family), () => markTextFontFailed(family))
    }
  },
}
