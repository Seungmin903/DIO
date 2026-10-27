// 열람 위치는 문서 내용·수정 시각·Undo 이력과 별도로 보관한다.
import { loadJSON, saveJSON, removeJSON } from './storage'
import { isSessionDocumentKey, readSessionPage, writeSessionPage } from './sessionDocuments.js'

const pages = new Map()
const reads = new Map()
const writes = new Map()
const viewKey = (key) => `dio:editor:view:v1:${key}`
const CACHE_LIMIT = 128
function cachePage(key, value) {
  pages.delete(key)
  pages.set(key, value)
  while (pages.size > CACHE_LIMIT) pages.delete(pages.keys().next().value)
}

// undefined: 아직 읽지 않음, null: 기록 없음.
export function peekViewedPage(key) {
  return isSessionDocumentKey(key) ? readSessionPage(key) : pages.get(key)
}

export function loadViewedPage(key) {
  const cached = peekViewedPage(key)
  if (cached !== undefined) return Promise.resolve(cached)
  if (reads.has(key)) return reads.get(key)
  const request = Promise.resolve(writes.get(key)).catch(() => false)
    .then(() => loadJSON(viewKey(key), null)).catch(() => null).then((value) => {
    // 삭제 중 완료된 이전 읽기가 캐시를 되살리지 않게 한다.
    if (reads.get(key) !== request) return pages.get(key) ?? null
    if (!pages.has(key)) cachePage(key, typeof value === 'string' ? value : null)
    reads.delete(key)
    return pages.get(key)
  })
  reads.set(key, request)
  return request
}

export function rememberViewedPage(key, pageId) {
  if (typeof pageId !== 'string' || !pageId) return Promise.resolve(false)
  if (isSessionDocumentKey(key)) return Promise.resolve(writeSessionPage(key, pageId))
  cachePage(key, pageId)
  // 연속 페이지 이동의 저장 완료 순서가 뒤집히지 않게 같은 키의 쓰기를 직렬화한다.
  const request = (writes.get(key) ?? Promise.resolve()).catch(() => false)
    .then(() => saveJSON(viewKey(key), pageId)).catch(() => false).then((ok) => {
      if (writes.get(key) === request) writes.delete(key)
      return ok
    })
  writes.set(key, request)
  return request
}

// 문서 영구 삭제 시 진행 중인 쓰기 뒤에서 삭제하여 늦은 저장이 기록을 되살리지 않게 한다.
export function forgetViewedPage(key) {
  pages.delete(key)
  reads.delete(key)
  const request = (writes.get(key) ?? Promise.resolve()).catch(() => false)
    .then(() => removeJSON(viewKey(key))).catch(() => false).then((ok) => {
      if (writes.get(key) === request) {
        writes.delete(key)
        pages.delete(key)
      }
      return ok
    })
  writes.set(key, request)
  return request
}
