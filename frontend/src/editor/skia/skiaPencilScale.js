import { createContext } from 'react'

// 내보내기가 정하는 연필 그림 해상도(페이지 단위당 픽셀). 없으면 화면 배율(확대 × 기기 픽셀 배율)
export const SkiaPencilScale = createContext(null)
