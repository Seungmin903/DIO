// 속지 캐시가 채워졌음을 알리는 신호. 실패한 채 멈춘 축소 표시(페이지 목록 썸네일 · 정적 페이지)가 본문 캔버스의 '다시 시도' 결과를 받아
// 다시 그려지기를 기다리지 않고 스스로 복구하는 데 쓴다(S15P31F106-724, MR !484 자동 리뷰). 캐시 모듈(loadTemplate.js)이 불러오기에 성공할 때마다 알린다.
const listeners = new Set()

/** listener(id): 속지 id 의 캐시가 채워졌다. 해제 함수를 돌려준다 */
export function subscribeTemplateLoaded(listener) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function notifyTemplateLoaded(id) {
  for (const listener of [...listeners]) {
    try { listener(id) } catch { /* 한 구독자의 오류가 다른 구독자와 불러오기를 막지 않는다 */ }
  }
}
