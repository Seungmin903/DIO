const waiting = new Map()

// 문서 데이터와 별개인 표시 인계. 레이아웃 커밋 전에는 임시 획을 지우지 않는다.
export function waitForStrokeDisplay(id, onFinish) {
  const ticket = { onFinish }
  waiting.set(id, ticket)
  return () => { if (waiting.get(id) === ticket) waiting.delete(id) }
}

export function acknowledgeStrokeDisplay(id) {
  const ticket = waiting.get(id)
  if (!ticket) return
  waiting.delete(id)
  ticket.onFinish('committed')
}
