import { useEffect, useRef, useState } from 'react'

const OBJECTS_PER_BATCH = 8
const DELAY_MS = 8

// 문서는 변경하지 않고 네이티브 페이지 전환 시 표시 작업만 나눈다.
export function useProgressiveNativePage(page, enabled, startPending = false) {
  const [progress, setProgress] = useState(() => ({
    id: page.id, count: startPending ? 0 : page.objects.length, complete: !startPending,
  }))
  const latest = useRef(page)
  latest.current = page
  const changing = enabled && (progress.id !== page.id || !progress.complete)
  const count = progress.id === page.id ? Math.min(progress.count, page.objects.length) : 0
  useEffect(() => {
    if (!enabled || (progress.id === page.id && progress.complete)) return undefined
    const id = page.id
    let timer, cancelled = false, shown = 0
    const delay = startPending ? 32 : DELAY_MS
    const advance = () => {
      if (cancelled || latest.current.id !== id) return
      const size = latest.current.objects.length
      shown = Math.min(size, shown + OBJECTS_PER_BATCH)
      const complete = shown >= size
      setProgress({ id, count: shown, complete })
      if (!complete) timer = setTimeout(advance, delay)
    }
    setProgress({ id, count: 0, complete: page.objects.length === 0 })
    if (page.objects.length) timer = setTimeout(advance, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [page.id, enabled, startPending])
  return { count: changing ? count : page.objects.length, ready: !changing }
}
