import { useLayoutEffect, useSyncExternalStore } from 'react'
import { liveStroke } from '../skia/liveStroke.js'

// 앱: 쓰는 중인 획은 직접 그리지 않고 다 그린 획 층(CompletedStrokeLayer.native)의 맨 위 캔버스에 넘긴다(웹은 PenPreview.js 의 SVG).
// 미리보기 저장소가 바뀌는 그 자리에서 바로 넘겨, 펜을 뗄 때 미리보기 지우기와 새 획 추가가 같은 화면 갱신에 들어간다.
export default function PenPreview({ store }) {
  const preview = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  useLayoutEffect(() => {
    liveStroke.set(store.getSnapshot())
    const unsubscribe = store.subscribe(() => liveStroke.set(store.getSnapshot()))
    return () => { unsubscribe(); liveStroke.set(null) }
  }, [store])
  const measurement = preview?.measurement
  useLayoutEffect(() => { measurement?.previewCommitted?.() }, [measurement])
  return null
}
