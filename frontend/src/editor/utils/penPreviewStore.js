// 입력 수신기는 다시 렌더하지 않고, 미리보기 구독자에게만 화면 프레임을 전달한다.
export function createPenPreviewStore() {
  let snapshot = null
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish(next) {
      if (snapshot === next) return
      snapshot = next
      listeners.forEach(listener => listener())
    },
  }
}
