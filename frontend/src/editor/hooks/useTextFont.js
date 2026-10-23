import { useSyncExternalStore } from 'react'
import { subscribeTextFonts, textFontSnapshot } from '../utils/text.js'

// 해당 글꼴의 로드 상태가 바뀐 텍스트만 다시 그린다.
export function useTextFont(id) {
  return useSyncExternalStore(subscribeTextFonts, () => textFontSnapshot(id), () => textFontSnapshot(id))
}
