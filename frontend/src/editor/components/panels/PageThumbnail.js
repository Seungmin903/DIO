import { useEffect, useMemo, useRef, useState } from 'react'
import StaticPage from '../canvas/StaticPage'
import { hasUnseenThumbnailObjects, revealThumbnailObjects, visibleThumbnailObjects } from '../../utils/thumbnailProgress.js'

// 네이티브에서는 복잡한 페이지를 한 프레임에 전부 만들지 않아 패널 버튼을 계속 누를 수 있게 한다.
const OBJECTS_PER_BATCH = 3
const BATCH_DELAY_MS = 20

export default function PageThumbnail({ page, workQueue, ...props }) {
  const objects = page.objects
  // 이미 보인 요소(id). 지우거나 고쳐도 보인 것은 그대로 두고 새 요소만 나눠 보탠다
  const [shown, setShown] = useState(() => new Set())
  const preview = useMemo(() => hasUnseenThumbnailObjects(objects, shown) ? { ...page, objects: visibleThumbnailObjects(objects, shown) } : page, [page, objects, shown])
  const latest = useRef({ objects, shown })
  const worker = useRef(null)
  latest.current.objects = objects

  useEffect(() => {
    let cancelPending = () => {}, cancelled = false, scheduled = false
    const kick = () => {
      if (cancelled || scheduled || !hasUnseenThumbnailObjects(latest.current.objects, latest.current.shown)) return
      scheduled = true
      if (workQueue) cancelPending = workQueue.enqueue(advance)
      else { const timer = setTimeout(advance, BATCH_DELAY_MS); cancelPending = () => clearTimeout(timer) }
    }
    const advance = () => {
      scheduled = false
      if (cancelled) return
      const current = latest.current
      const next = revealThumbnailObjects(current.objects, current.shown, OBJECTS_PER_BATCH)
      latest.current = { objects: current.objects, shown: next }
      setShown(next)
      kick()
    }
    worker.current = kick
    kick()
    return () => { cancelled = true; cancelPending(); if (worker.current === kick) worker.current = null }
  }, [workQueue])
  useEffect(() => { worker.current?.() }, [objects, workQueue])

  return <StaticPage {...props} page={preview} />
}
