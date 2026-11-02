// AsyncStorage의 한 행에 큰 캔버스 계획을 넣지 않는다. 인덱스도 같은 크기로 나눈다.
export const GUEST_JOURNAL_CHUNK_CHARS = 64 * 1024
const invalid = () => Object.assign(new Error('가져오기 진행 기록을 읽지 못했어요. 원본은 그대로 남아 있어요.'), { code: 'INVALID_LOCAL_CACHE' })
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const parse = raw => { try { return JSON.parse(raw) } catch { throw invalid() } }
const chunks = raw => {
  const result = []
  for (let start = 0; start < raw.length;) {
    let end = Math.min(start + GUEST_JOURNAL_CHUNK_CHARS, raw.length)
    // UTF-16 서로게이트 쌍을 나눠 저장하지 않는다. 한 조각은 UTF-8로도 최대 192KiB다.
    if (end < raw.length && /[\uD800-\uDBFF]/.test(raw[end - 1])) end--
    result.push(raw.slice(start, end)); start = end
  }
  return result.length ? result : ['']
}
// 같은 계정으로 재로그인해 실행기 인스턴스가 바뀌어도 읽기·저장·청소가 교차하지 않는다.
const storageQueues = new WeakMap()
function serialize(storage, key, work) {
  let queues = storageQueues.get(storage)
  if (!queues) { queues = new Map(); storageQueues.set(storage, queues) }
  const result = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work)
  queues.set(key, result)
  const clear = () => { if (queues.get(key) === result) queues.delete(key) }
  result.then(clear, clear)
  return result
}

export function createGuestImportJournalStore({ storage, key }) {
  let cache = new Map(), pruned = false
  const batchCache = new WeakMap()
  const dataKey = (ref, part) => `${key}:data:${ref.generation}:${ref.slot}:${part}`
  const indexKey = (generation, part) => `${key}:index:${generation}:${part}`
  const validRef = ref => object(ref) && Number.isSafeInteger(ref.generation) && ref.generation > 0
    && Number.isSafeInteger(ref.slot) && ref.slot >= 0 && Number.isSafeInteger(ref.parts) && ref.parts > 0
  async function readParts(count, partKey) {
    const values = []
    for (let part = 0; part < count; part++) {
      const value = await storage.getItem(partKey(part))
      if (typeof value !== 'string') throw invalid()
      values.push(value)
    }
    return values.join('')
  }
  async function readIndex() {
    const raw = await storage.getItem(key)
    if (raw === null) return { head: null, diaries: {} }
    const head = parse(raw)
    if (head?.format === 1 && object(head.diaries)) return { head, legacy: head, diaries: {} }
    if (head?.format !== 2 || !Number.isSafeInteger(head.generation) || head.generation < 1
      || !Number.isSafeInteger(head.indexParts) || head.indexParts < 1) throw invalid()
    const index = parse(await readParts(head.indexParts, part => indexKey(head.generation, part)))
    if (!object(index?.diaries)) throw invalid()
    for (const entry of Object.values(index.diaries)) {
      if (!object(entry) || !validRef(entry.meta) || !object(entry.batches)
        || Object.values(entry.batches).some(ref => !validRef(ref))) throw invalid()
    }
    return { head, diaries: index.diaries }
  }
  const sectionKey = (diaryId, section) => JSON.stringify([diaryId, section])
  const refs = index => Object.values(index).flatMap(entry => [entry.meta, ...Object.values(entry.batches)])
  const refKeys = ref => Array.from({ length: ref.parts }, (_, part) => dataKey(ref, part))
  async function readSection(diaryId, section, ref) {
    const raw = await readParts(ref.parts, part => dataKey(ref, part))
    cache.set(sectionKey(diaryId, section), { raw, ref })
    return parse(raw)
  }
  function snapshot(journal) {
    const result = []
    for (const [id, entry] of Object.entries(journal.diaries)) {
      const batches = []
      const meta = { ...entry, plan: { ...entry.plan, pages: entry.plan.pages.map(page => ({ ...page,
        batches: page.batches.map(batch => {
          const saved = batchCache.get(batch)
          let raw
          if (saved && saved.request === batch.request && saved.creates === batch.creates) raw = saved.raw
          else {
            const compact = { ...batch }
            if (compact.request) delete compact.creates
            raw = JSON.stringify(compact)
            batchCache.set(batch, { request: batch.request, creates: batch.creates, raw })
          }
          batches.push([batch.clientOperationId, raw])
          return batch.clientOperationId
        }) })) } }
      result.push({ id, raw: JSON.stringify(meta), batches })
    }
    return result
  }
  return {
    async pendingIds() {
      return serialize(storage, key, async () => {
        const index = await readIndex()
        return Object.keys(index.legacy?.diaries ?? index.diaries)
      })
    },
    async load() {
      return serialize(storage, key, async () => {
        const index = await readIndex()
        if (index.legacy) return index.legacy // 기존 요청 ID·본문을 보존하고 다음 저장 시 이전한다.
        const diaries = {}
        for (const [id, descriptor] of Object.entries(index.diaries)) {
          const entry = await readSection(id, 'meta', descriptor.meta)
          if (!object(entry?.plan) || !Array.isArray(entry.plan.pages)) throw invalid()
          for (const page of entry.plan.pages) {
            if (!Array.isArray(page.batches)) throw invalid()
            const batches = []
            for (const operationId of page.batches) {
              const ref = descriptor.batches[operationId]
              if (!validRef(ref)) throw invalid()
              const batch = await readSection(id, operationId, ref)
              if (batch?.clientOperationId !== operationId) throw invalid()
              batches.push(batch)
            }
            page.batches = batches
          }
          diaries[id] = entry
        }
        return { format: 1, diaries }
      })
    },
    save(journal) {
      // 호출 시점의 상태를 고정해 이후 변경이 저장 대기 중인 본문에 섞이지 않도록 한다.
      const entries = snapshot(journal)
      const job = async () => {
        const previous = await readIndex()
        const generation = (previous.head?.format === 2 ? previous.head.generation : 0) + 1
        const diaries = {}, nextCache = new Map()
        let slot = 0
        const writeSection = async (id, section, raw, previousRef) => {
          const name = sectionKey(id, section), old = cache.get(name)
          if (old?.raw === raw && previousRef && JSON.stringify(old.ref) === JSON.stringify(previousRef)) {
            nextCache.set(name, old); return old.ref
          }
          const parts = chunks(raw), ref = { generation, slot: slot++, parts: parts.length }
          for (const [part, value] of parts.entries()) await storage.setItem(dataKey(ref, part), value)
          nextCache.set(name, { raw, ref }); return ref
        }
        for (const entry of entries) {
          const old = previous.diaries[entry.id]
          const descriptor = { meta: await writeSection(entry.id, 'meta', entry.raw, old?.meta), batches: {} }
          for (const [id, raw] of entry.batches) descriptor.batches[id] = await writeSection(entry.id, id, raw, old?.batches[id])
          diaries[entry.id] = descriptor
        }
        const indexParts = chunks(JSON.stringify({ diaries }))
        for (const [part, value] of indexParts.entries()) await storage.setItem(indexKey(generation, part), value)
        // 이전 조각은 건드리지 않고 마지막에 작은 헤드만 교체한다. 중단 시 기존 스냅샷을 읽는다.
        await storage.setItem(key, JSON.stringify({ format: 2, generation, indexParts: indexParts.length, diaryCount: entries.length }))
        cache = nextCache
        const live = new Set(refs(diaries).flatMap(refKeys))
        indexParts.forEach((_, part) => live.add(indexKey(generation, part)))
        const obsolete = refs(previous.diaries).flatMap(refKeys)
        if (previous.head?.format === 2) for (let part = 0; part < previous.head.indexParts; part++) obsolete.push(indexKey(previous.head.generation, part))
        // 청소 실패는 커밋된 진행 기록을 실패로 바꾸지 않는다. 재기동 후 첫 저장 때 고아 조각도 회수한다.
        try {
          if (!pruned && storage.getAllKeys) {
            obsolete.push(...(await storage.getAllKeys()).filter(name => name.startsWith(`${key}:data:`) || name.startsWith(`${key}:index:`)))
            pruned = true
          }
          for (const name of new Set(obsolete)) if (!live.has(name)) await storage.removeItem(name)
        } catch { /* 현재 인덱스가 가리키는 조각은 지우지 않는다. */ }
      }
      return serialize(storage, key, job)
    },
  }
}
