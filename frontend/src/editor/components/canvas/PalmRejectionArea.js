import { PalmRejectionContext } from '../../hooks/usePalmRejection'

/** 이 안의 입력 영역(usePan)은 손바닥을 거르고 펜(또는 첫 손가락) 하나만 따라 그린다 */
export default function PalmRejectionArea({ children }) {
  return <PalmRejectionContext.Provider value>{children}</PalmRejectionContext.Provider>
}
