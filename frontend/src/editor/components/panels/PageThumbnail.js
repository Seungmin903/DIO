import { useEffect, useMemo, useRef, useState } from 'react'
import StaticPage from '../canvas/StaticPage'
import { hasUnseenThumbnailObjects, revealThumbnailObjects, visibleThumbnailObjects } from '../../utils/thumbnailProgress.js'

// 네이티브에서는 복잡한 페이지를 한 프레임에 전부 만들지 않아 패널 버튼을 계속 누를 수 있게 한다.
// 처음 채울 때는 3개로 시작해 매번 두 배씩 보탠다. 매번 3개씩이면 요소 480개 페이지가 160번(각 20~30ms, 합 4초 넘게) 다시 그려졌다.
const OBJECTS_PER_BATCH = 3
const unseenCount = (objects, shown) => objects.reduce((count, object) => count + (shown.has(object.id) ? 0 : 1), 0)
// 다음 묶음 크기: 지금 보이는 요소 수만큼(교체돼 사라진 id 는 세지 않는다)
const nextBatch = (objects, shown) => Math.max(OBJECTS_PER_BATCH, objects.length - unseenCount(objects, shown))
const BATCH_DELAY_MS = 20
// 이미 채워진 썸네일에 요소가 더해질 때(필기 중)는 이 시간 동안 모았다가 한 번에 보탠다. 획마다 요소 수백 개를 다시 그리지 않게.
export const UPDATE_DELAY_MS = 300
// 채워진 뒤라도 안 보인 요소가 이보다 많으면 한 번에 그리지 않고 처음처럼 나눠 그린다
export const REFILL_THRESHOLD = 12

const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index])
const sameExceptObjects = (a, b) => { const keys = Object.keys(a); return keys.length === Object.keys(b).length && keys.every(key => key === 'objects' || a[key] === b[key]) }

export default function PageThumbnail({ page, workQueue, ...props }) {
  const objects = page.objects
  // 이미 보인 요소(id). 지우거나 고쳐도 보인 것은 그대로 두고 새 요소만 나눠 보탠다
  const [shown, setShown] = useState(() => new Set())
  // 아직 안 보인 요소가 있으면 보인 요소만 담은 미리보기를 쓰되, 그 내용이 직전 미리보기와 같으면 같은 객체를 돌려줘 StaticPage(memo) 가 다시 그리지 않는다.
  // 획 하나를 더할 때 "새 획이 빠진 페이지"를 한 번 더 그리던 비용(요소 450개에서 약 16ms)을 없앤다.
  const lastPreview = useRef(null)
  const preview = useMemo(() => {
    if (!hasUnseenThumbnailObjects(objects, shown)) return page
    const visible = visibleThumbnailObjects(objects, shown), last = lastPreview.current
    if (last && sameExceptObjects(last, page) && sameList(last.objects, visible)) return last
    return { ...page, objects: visible }
  }, [page, objects, shown])
  lastPreview.current = preview
  // filled: 처음 나눠 그리기가 끝난 뒤인지. 그 뒤의 추가(필기)만 모아서 한 번에 보탠다
  const latest = useRef({ objects, shown, filled: false })
  const worker = useRef(null)
  latest.current.objects = objects

  useEffect(() => {
    let cancelPending = () => {}, cancelled = false, scheduled = false, settle = null
    const kick = () => {
      if (cancelled) return
      if (!hasUnseenThumbnailObjects(latest.current.objects, latest.current.shown)) { latest.current.filled = true; return }
      // 페이지 내용이 통째로 바뀌어 안 보인 요소가 많으면(동기화로 교체 등) 다시 나눠 그린다
      if (latest.current.filled && unseenCount(latest.current.objects, latest.current.shown) > REFILL_THRESHOLD) latest.current.filled = false
      if (latest.current.filled) {
        // 채워진 썸네일의 변경: 빠른 연속 입력을 모아 한 번에 전부 보탠다
        if (settle) clearTimeout(settle)
        settle = setTimeout(() => { settle = null; advance(Infinity) }, UPDATE_DELAY_MS)
        return
      }
      if (scheduled) return
      scheduled = true
      if (workQueue) cancelPending = workQueue.enqueue(() => advance(nextBatch(latest.current.objects, latest.current.shown)))
      else { const timer = setTimeout(() => advance(nextBatch(latest.current.objects, latest.current.shown)), BATCH_DELAY_MS); cancelPending = () => clearTimeout(timer) }
    }
    const advance = (count) => {
      scheduled = false
      if (cancelled) return
      const current = latest.current
      const next = revealThumbnailObjects(current.objects, current.shown, count)
      latest.current = { objects: current.objects, shown: next, filled: current.filled }
      setShown(next)
      kick()
    }
    worker.current = kick
    kick()
    return () => { cancelled = true; cancelPending(); if (settle) clearTimeout(settle); if (worker.current === kick) worker.current = null }
  }, [workQueue])
  useEffect(() => { worker.current?.() }, [objects, workQueue])

  return <StaticPage {...props} page={preview} />
}
