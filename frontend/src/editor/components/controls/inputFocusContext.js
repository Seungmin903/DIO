import { createContext } from 'react'

/**
 * 입력칸이 포커스를 받을 때 알릴 곳 (옵션 창 등). 키보드가 이미 떠 있는 채로 다른 칸으로 옮기면
 * keyboardDidShow 가 다시 오지 않아, 창이 새 칸 자리를 다시 재려면 이 알림이 필요하다.
 */
export const InputFocusContext = createContext(null)
