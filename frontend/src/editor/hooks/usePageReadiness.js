import { useMemo, useState } from 'react'

// 식별자는 커밋된 페이지·레이아웃마다 새로 만들어 폐기된 렌더가 현재 값을 바꾸지 않는다.
export function usePageReadiness(id, enabled) {
  const generation = useMemo(() => ({}), [id, enabled])
  const [readyPage, setReadyPage] = useState(() => ({ id, generation }))
  const pageReady = !enabled || (readyPage.id === id && readyPage.generation === generation)
  return { generation, pageReady, setReadyPage }
}
