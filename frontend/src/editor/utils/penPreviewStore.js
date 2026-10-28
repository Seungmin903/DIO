import { waitForStrokeDisplay } from './strokeDisplayHandoff.js'

// 현재 획과 문서 표시를 기다리는 획을 분리해 연속 입력의 인계 공백을 막는다.
export function createPenPreviewStore() {
  let snapshot = null
  let pending = []
  const releases = new Map()
  const listeners = new Set()
  const notify = () => listeners.forEach(listener => listener())
  return {
    getSnapshot: () => snapshot,
    getPendingSnapshot: () => pending,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish(next) {
      if (snapshot === next) return
      snapshot = next
      notify()
    },
    hold(next, onFinish = () => {}) {
      const id = next.strokeId
      releases.get(id)?.('replaced')
      let timer, release, finished = false
      const finish = reason => {
        if (finished) return
        finished = true; clearTimeout(timer); release?.(); releases.delete(id)
        pending = pending.filter(item => item !== next)
        onFinish(reason); notify()
      }
      pending = [...pending, next]; snapshot = null
      releases.set(id, finish)
      release = waitForStrokeDisplay(id, finish)
      // 해제/문서 전환으로 커밋이 사라져도 임시 획을 무한히 남기지 않는다.
      timer = setTimeout(() => finish('timeout'), 1000)
      timer?.unref?.()
      notify()
    },
    clearPending() { for (const finish of [...releases.values()]) finish('cancelled') },
  }
}
