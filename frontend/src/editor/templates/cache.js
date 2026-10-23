// 성공한 XML만 제한된 LRU에 보관한다. 중복 요청은 합치고 실패는 다음 요청에서 재시도한다.
export function createTemplateCache(read, limit = 16) {
  const completed = new Map()
  const pending = new Map()
  async function load(key) {
    if (completed.has(key)) {
      const value = completed.get(key)
      completed.delete(key); completed.set(key, value)
      return value
    }
    if (pending.has(key)) return pending.get(key)
    const request = Promise.resolve().then(() => read(key)).then(value => {
      completed.set(key, value)
      while (completed.size > limit) completed.delete(completed.keys().next().value)
      return value
    }).finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
  // 이미 읽어 둔 값은 기다리지 않고 바로 돌려준다. (첫 렌더에서 "로딩 중"을 거치지 않게)
  load.peek = (key) => completed.get(key)
  return load
}
