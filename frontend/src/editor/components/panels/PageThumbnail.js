import { useEffect, useMemo, useRef, useState } from 'react'
import StaticPage from '../canvas/StaticPage'
import { reusableThumbnailPrefix } from '../../utils/thumbnailProgress.js'

// 네이티브에서는 복잡한 페이지를 한 프레임에 전부 만들지 않아 패널 버튼을 계속 누를 수 있게 한다.
const OBJECTS_PER_BATCH = 3
const BATCH_DELAY_MS = 20

export default function PageThumbnail({ page, workQueue, ...props }) {
  const objects = page.objects
  const [progress, setProgress] = useState(() => ({ objects, count: 0 }))
  const count = reusableThumbnailPrefix(progress.objects, objects, progress.count)
  const preview = useMemo(() => count >= objects.length ? page : { ...page, objects: objects.slice(0, count) }, [page, objects, count])
  const latest = useRef({ objects, count })
  const worker = useRef(null)
  if (latest.current.objects !== objects) latest.current = { objects, count }
  else latest.current.count = Math.max(latest.current.count, count)

  useEffect(() => {
    let cancelPending = () => {}, cancelled = false, scheduled = false
    const kick = () => {
      if (cancelled || scheduled || latest.current.count >= latest.current.objects.length) return
      scheduled = true
      if (workQueue) cancelPending = workQueue.enqueue(advance)
      else { const timer = setTimeout(advance, BATCH_DELAY_MS); cancelPending = () => clearTimeout(timer) }
    }
    const advance = () => {
      scheduled = false
      if (cancelled) return
      const current = latest.current
      const shown = Math.min(current.objects.length, current.count + OBJECTS_PER_BATCH)
      latest.current = { objects: current.objects, count: shown }
      setProgress({ objects: current.objects, count: shown })
      kick()
    }
    worker.current = kick
    kick()
    return () => { cancelled = true; cancelPending(); if (worker.current === kick) worker.current = null }
  }, [workQueue])
  useEffect(() => { worker.current?.() }, [objects, workQueue])

  return <StaticPage {...props} page={preview} />
}
