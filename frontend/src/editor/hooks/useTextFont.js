import { useSyncExternalStore } from 'react'
import { requestTextFonts, subscribeTextFonts, textFontSnapshot } from '../utils/text.js'

// 해당 글꼴의 로드 상태가 바뀐 텍스트만 다시 그린다. 쓰는 글꼴은 이때 불러오기를 시작한다(bold 면 굵은 서체까지).
export function useTextFont(id, bold = false) {
  if (id) requestTextFonts([id], { bold })
  return useSyncExternalStore(subscribeTextFonts, () => textFontSnapshot(id), () => textFontSnapshot(id))
}
