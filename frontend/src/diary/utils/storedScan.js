// 저장된 값을 한 조각씩 훑는다. 큰 문서 전체를 문자열 하나로 되살리지 않게 하는 공용 입구.
// visit(key, raw) 가 false 를 돌려주면 멈춘다. 읽기 실패는 그대로 던진다(호출자는 아무것도 지우지 않는다).
export async function scanStored(storage, keys, visit) {
  if (!keys.length) return
  if (storage.scanText) { await storage.scanText(keys, visit); return }
  for (const key of keys) {
    const raw = storage.getItem ? await storage.getItem(key) : (await storage.multiGet([key]))[0]?.[1]
    if (visit(key, raw) === false) return
  }
}

/** ids 중 keys 의 값 어디에도 글자가 나오지 않는 것. 값을 JSON 으로 해석하지 않으므로 읽을 수 없는 값도 "쓰는 중"으로 남는 쪽이다. */
export async function findUnusedIds(storage, keys, ids) {
  const unused = new Set(ids)
  if (!unused.size) return unused
  await scanStored(storage, keys, (_, raw) => {
    if (typeof raw !== 'string') return true
    for (const id of unused) if (raw.includes(id)) unused.delete(id)
    return unused.size > 0
  })
  return unused
}
