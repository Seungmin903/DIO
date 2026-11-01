import { createContext } from 'react'

/**
 * 편집 화면의 보기 상태. StaticPage 와 PdfDetail 이 함께 쓴다.
 * - moving: 확대·축소·이동 중
 * - visible: 지금 화면에 보이는 페이지 범위 (논리 좌표 { x, y, width, height }). 썸네일·내보내기에서는 null.
 */
export const ViewportMotion = createContext({ moving: false, visible: null })
