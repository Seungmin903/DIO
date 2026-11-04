// 편집 문서는 서버가 아니라 기기 저장소에 있다. 편집기를 열 때 "로딩 중" 화면이 생기지 않도록
// 문서·첫 화면 속지·사진을 편집기 진입 전에 준비하고, 한 번 읽은 문서는 메모리에 둔다.
import documentStorage from './documentStorage'
import { memberDocumentKey } from '../../diary/services/memberStorage.js'
import { latestFilledNumber, spreadNumbers } from '../../diary/utils/bookSpread.js'
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../state/defaultDoc'
import { templateReference } from '../templates/catalog.js'
import { loadTemplateAst } from '../templates/loadTemplate'
import { hydrateMedia } from './mediaStore'
import { STORAGE_KEYS } from './storage'
import { isSessionDocumentKey, readSessionDocument, writeSessionDocument, forgetSessionDocument } from './sessionDocuments.js'
import { loadViewedPage } from './editorViewState'

// 홈에서 미리 읽는 다이어리 수(8)와 최근에 연 문서를 담을 만큼만 메모리에 둔다.
const DOC_CACHE_LIMIT = 12
// 홈에서 문서 전체를 미리 읽는 총량(파일 크기 기준). 넘치는 문서는 펼침면만 준비하고 열 때 읽는다.
const PREFETCH_BYTES_LIMIT = 8 * 1024 * 1024
// 이보다 큰 기기 문서(파일 크기 기준)는 지금 페이지부터 열고 나머지를 뒤에서 읽는다.
const PROGRESSIVE_BYTES = 2 * 1024 * 1024
const docs = new Map() // 저장 키 → 저장된 문서 (null: 아직 저장된 문서 없음), 오래 안 쓴 순
const pending = new Map()
const spreadSources = new Map() // 저장 키 → 홈 펼침면에 쓸 일부 페이지. 문서가 바뀌면 지운다.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const editorDocKey = (diary) => memberDocumentKey(diary) ?? (isSessionDocumentKey(diary?.sessionStorageKey) ? diary.sessionStorageKey : (diary?.id ? `${STORAGE_KEYS.doc}:${diary.id}` : STORAGE_KEYS.doc))

/** 메모리에 있으면 { doc }를, 아직 읽지 않았으면 null을 돌려준다. */
export function peekEditorDoc(key) {
  if (isSessionDocumentKey(key)) return {doc: readSessionDocument(key)}
  if (!docs.has(key)) return null
  const doc = docs.get(key)
  remember(key, doc)
  return { doc }
}

function remember(key, doc) {
  spreadSources.delete(key)
  docs.delete(key)
  docs.set(key, doc)
  while (docs.size > DOC_CACHE_LIMIT) docs.delete(docs.keys().next().value)
}

/** 편집 중인 최신 문서로 메모리 사본을 갱신한다. (다시 열 때 저장소를 기다리지 않게) */
export function rememberEditorDoc(key, doc, { overwrite = true } = {}) {
  // A loaded disk snapshot can be older than pending or failed editor saves.
  // Keep the latest in-memory edit when handing an authorized member doc back in.
  if (!overwrite && peekEditorDoc(key)?.doc) return
  if (isSessionDocumentKey(key)) { writeSessionDocument(key, doc); return }
  // 내용을 다 읽지 않은 문서는 기억하지 않는다. 다른 화면이 일부만 읽은 문서를 전체로 착각하지 않게 하고, 다음에 저장소에서 다시 읽는다.
  if (doc?.pages?.some((page) => page.unloaded)) { docs.delete(key); spreadSources.delete(key); return }
  remember(key, doc)
}

export function forgetEditorDoc(key) {
  if (isSessionDocumentKey(key)) { forgetSessionDocument(key); return true }
  spreadSources.delete(key)
  docs.delete(key)
  return true
}

/** 일반 문서는 기존 저장소, 임시 공유 문서는 세션 메모리에 저장한다. */
export function saveEditorDoc(key, doc) {
  if (isSessionDocumentKey(key)) return Promise.resolve(writeSessionDocument(key, doc))
  return documentStorage.saveDocument(key, doc).then(() => true, () => false)
}

/**
 * 저장된 문서를 읽는다. 비어 있는 연간 문서도 페이지 구성 그대로 보존한다.
 * 저장소 읽기 자체가 실패하면 "문서 없음"으로 착각해 덮어쓰지 않도록 reject하고 기억하지 않는다.
 * 손상된 값은 원본을 유지하고 별도 백업을 시도한 뒤 오류로 돌려준다.
 */
export function loadEditorDoc(diary) {
  const key = editorDocKey(diary)
  if (isSessionDocumentKey(key)) return Promise.resolve(readSessionDocument(key))
  if (docs.has(key)) return Promise.resolve(docs.get(key))
  if (pending.has(key)) return pending.get(key)
  const request = documentStorage.loadDocument(key).then((saved) => {
    const migrated = migrateUntouchedAnnualDoc(saved, diary)
    if (migrated !== saved) documentStorage.saveDocument(key, migrated).catch(() => {})
    // 읽는 사이에 편집기가 더 새로운 문서를 기억했다면 그것을 유지한다.
    if (!docs.has(key)) remember(key, migrated?.pages?.length ? migrated : null)
    return docs.get(key)
  }).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
}

/** 보관함에 보여 줄 페이지 수 · 수정 시각. 저장된 문서가 없으면 null. 페이지 내용은 읽지 않는다. */
export async function loadEditorSummary(diary) {
  const key = editorDocKey(diary)
  const fromDoc = (doc) => (doc ? { pageCount: doc.pages.length, updatedAt: doc.updatedAt } : null)
  if (isSessionDocumentKey(key)) return fromDoc(readSessionDocument(key))
  if (docs.has(key)) return fromDoc(docs.get(key))
  if (!pending.has(key)) {
    const summary = await documentStorage.loadSummary(key)
    if (summary) return { pageCount: summary.pageCount, updatedAt: summary.doc.updatedAt }
  }
  return fromDoc(await loadEditorDoc(diary))
}

/** 메모리에 있는 펼침면 재료. { doc } 또는 { total, latest, pageAt } 이고, 아직 읽지 않았으면 null. */
export function peekEditorSpread(key) {
  const peek = peekEditorDoc(key)
  if (peek) return peek
  if (!spreadSources.has(key)) return null
  const source = spreadSources.get(key)
  spreadSources.delete(key)
  spreadSources.set(key, source)
  return source
}

/** 홈 펼침면에 필요한 페이지만 읽는다. 목차가 없는 문서(옮기기 전 · 웹)는 전체를 읽는다. */
export async function loadEditorSpread(diary) {
  const key = editorDocKey(diary)
  const known = peekEditorSpread(key)
  if (known) return known
  const summary = pending.has(key) ? null : await documentStorage.loadSummary(key)
  if (summary?.pageCount && summary.filled.every((value) => typeof value === 'boolean')) {
    const latest = latestFilledNumber(summary.filled)
    const numbers = [...new Set(spreadNumbers(latest))].filter((number) => number >= 1 && number <= summary.pageCount)
    const pages = await documentStorage.loadPagesAt(key, numbers.map((number) => number - 1))
    // 읽는 사이에 편집기가 더 새로운 문서를 기억했다면 그것을 쓴다.
    if (docs.has(key)) return { doc: docs.get(key) }
    if (pages) {
      const byNumber = new Map(numbers.map((number, index) => [number, pages[index]]))
      const source = { total: summary.pageCount, latest, pageAt: (number) => byNumber.get(number) }
      spreadSources.set(key, source)
      while (spreadSources.size > DOC_CACHE_LIMIT) spreadSources.delete(spreadSources.keys().next().value)
      return source
    }
  }
  return { doc: await loadEditorDoc(diary) }
}

// 점진 로드 대상: 메모리에 없고 파일로 저장된 큰 기기 문서. 회원 문서는 협업 동기화가 모든 페이지를 쓰므로 제외한다.
async function progressiveSummary(diary) {
  const key = editorDocKey(diary)
  if (memberDocumentKey(diary) || isSessionDocumentKey(key) || docs.has(key) || pending.has(key)) return null
  const summary = await documentStorage.loadSummary(key).catch(() => null)
  return summary && summary.bytes > PROGRESSIVE_BYTES ? summary : null
}

/**
 * 편집기가 문서를 연다. 큰 기기 문서면 지금 페이지와 양옆만 채운 문서와 남은 페이지 id 를 돌려준다.
 * { doc, pendingIds } — pendingIds 가 비어 있으면 문서 전체다.
 */
export async function openEditorDoc(diary, viewedPageId) {
  const key = editorDocKey(diary)
  if (await progressiveSummary(diary)) {
    const outline = migrateUntouchedAnnualDoc(await documentStorage.loadOutline(key), diary)
    if (outline?.pages?.length) {
      const index = Math.max(0, outline.pages.findIndex((page) => page.id === viewedPageId))
      const first = outline.pages.slice(Math.max(0, index - 1), index + 2).filter((page) => page.unloaded).map((page) => page.id)
      const loaded = new Map((await documentStorage.loadObjects(key, first)).map((item) => [item.id, item.objects]))
      const pages = outline.pages.map((page) => {
        if (!loaded.has(page.id)) return page
        const { unloaded, ...rest } = page
        return { ...rest, objects: loaded.get(page.id) }
      })
      return { doc: { ...outline, pages }, pendingIds: pages.filter((page) => page.unloaded).map((page) => page.id) }
    }
  }
  return { doc: await loadEditorDoc(diary), pendingIds: [] }
}

/** 점진 로드에서 페이지 내용을 읽는다. */
export const loadEditorPages = (diary, ids) => documentStorage.loadObjects(editorDocKey(diary), ids)

/** 홈에서 다이어리들을 미리 준비한다. 문서 전체는 상한까지만 메모리에 올린다. */
export async function prefetchEditors(diaries, { isCancelled = () => false, limit = PREFETCH_BYTES_LIMIT } = {}) {
  let used = 0
  for (const diary of diaries) {
    if (isCancelled()) return
    const key = editorDocKey(diary)
    const summary = isSessionDocumentKey(key) || docs.has(key) ? null : await documentStorage.loadSummary(key).catch(() => null)
    if (isCancelled()) return
    if (summary && used + summary.bytes > limit) continue
    used += summary?.bytes ?? 0
    await prepareEditor(diary, { media: false })
  }
}

/** 페이지 속지를 미리 해석해 둔다. 실패는 편집 화면에서 다시 안내한다. */
export function prefetchPageTemplate(page) {
  try {
    const reference = page && templateReference(page)
    return reference ? loadTemplateAst(reference).then(() => {}, () => {}) : Promise.resolve()
  } catch {
    return Promise.resolve()
  }
}

/**
 * 편집기 진입 전에 문서와 첫 화면 속지를 준비한다. 사진은 기다리는 시간을 제한해
 * 사진이 많아도 화면 전환이 늦어지지 않게 한다. 실패해도 편집기는 연다.
 */
export async function prepareEditor(diary, { media = true, mediaWaitMs = 400 } = {}) {
  // 큰 문서는 여기서 읽지 않는다. 편집기가 지금 페이지부터 연다.
  if (await progressiveSummary(diary)) {
    await loadViewedPage(editorDocKey(diary)).catch(() => null)
    return
  }
  const [saved, pageId] = await Promise.all([
    loadEditorDoc(diary).catch(() => null),
    loadViewedPage(editorDocKey(diary)).catch(() => null),
  ])
  const doc = saved ?? createDefaultDoc(diary)
  const tasks = [prefetchPageTemplate(doc.pages.find((page) => page.id === pageId) ?? doc.pages[0])]
  if (saved && media) tasks.push(Promise.race([hydrateMedia(saved).catch(() => {}), wait(mediaWaitMs)]))
  await Promise.all(tasks)
}
