// 공유 다이어리의 친구 기기: 원본 PDF 가 이 기기에 없으면 서버에서 받아 온다(확대할 때 PdfDetail 이 처음 부른다).
// 실제 내려받기는 편집 중인 다이어리의 공동 편집 훅이 등록한다(로그인 · 서버 주소를 그쪽이 갖고 있다).
const RETRY_AFTER_MS = 30000
let fetcher = null
// 내려받는 쪽이 바뀌면(세션 종료 · 다른 다이어리) 올린다. 끝난 세션의 작업이 늦게 실패해도 새 세션에 실패 기록을 남기지 않게
let generation = 0
const jobs = new Map()
const failedUntil = new Map()

export function setPdfSourceFetcher(next) {
  fetcher = next
  generation += 1
  if (!next) { jobs.clear(); failedUntil.clear() }
}

/** 이 쪽의 원본을 서버에서 받을 수 있는지(서버 id 가 있고 내려받는 쪽이 등록돼 있는지). */
export const canFetchPdfSource = source => Boolean(fetcher && source?.sourceId && source.mediaFileId)

/** 받아서 보관하면 끝난다. 받는 중이면 같은 요청을 함께 기다리고, 실패하면 잠시 다시 받지 않는다. */
export function fetchPdfSource(source) {
  if (!canFetchPdfSource(source)) return Promise.reject(new Error('PDF_SOURCE_UNAVAILABLE'))
  const id = source.sourceId
  if (jobs.has(id)) return jobs.get(id)
  if ((failedUntil.get(id) ?? 0) > Date.now()) return Promise.reject(new Error('PDF_SOURCE_BACKOFF'))
  const started = generation
  const job = Promise.resolve(fetcher(id, source.mediaFileId))
    .then(() => { failedUntil.delete(id) }, error => { if (started === generation) failedUntil.set(id, Date.now() + RETRY_AFTER_MS); throw error })
    .finally(() => { if (jobs.get(id) === job) jobs.delete(id) })
  jobs.set(id, job)
  return job
}
