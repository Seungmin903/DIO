import { useId } from 'react'

/** 컴포넌트 인스턴스마다 겹치지 않는 SVG 정의 id. (같은 오브젝트가 캔버스·썸네일에 동시에 그려지므로) */
export function useSvgId(prefix) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
}
