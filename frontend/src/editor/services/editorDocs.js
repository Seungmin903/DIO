// 편집 문서는 서버가 아니라 기기 저장소에 있다. 편집기를 열 때 "로딩 중" 화면이 생기지 않도록
// 문서·첫 화면 속지·사진을 편집기 진입 전에 준비하고, 한 번 읽은 문서는 메모리에 둔다.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../state/defaultDoc'
import { templateReference } from '../templates/catalog.js'
import { loadTemplateAst } from '../templates/loadTemplate'
import { hydrateMedia } from './mediaStore'
import { saveJSON, STORAGE_KEYS } from './storage'
import { isSessionDocumentKey, readSessionDocument, writeSessionDocument, forgetSessionDocument } from './sessionDocuments.js'
import { loadViewedPage } from './editorViewState'

// 홈에서 미리 읽는 다이어리 수(8)와 최근에 연 문서를 담을 만큼만 메모리에 둔다.
const DOC_CACHE_LIMIT = 12
const docs = new Map() // 저장 키 → 저장된 문서 (null: 아직 저장된 문서 없음), 오래 안 쓴 순
const pending = new Map()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const editorDocKey = (diary) => isSessionDocumentKey(diary?.sessionStorageKey) ? diary.sessionStorageKey : (diary?.id ? `${STORAGE_KEYS.doc}:${diary.id}` : STORAGE_KEYS.doc)

/** 메모리에 있으면 { doc }를, 아직 읽지 않았으면 null을 돌려준다. */
export function peekEditorDoc(key) {
  if (isSessionDocumentKey(key)) return {doc: readSessionDocument(key)}
  if (!docs.has(key)) return null
  const doc = docs.get(key)
  remember(key, doc)
  return { doc }
}

function remember(key, doc) {
  docs.delete(key)
  docs.set(key, doc)
  while (docs.size > DOC_CACHE_LIMIT) docs.delete(docs.keys().next().value)
}

/** 편집 중인 최신 문서로 메모리 사본을 갱신한다. (다시 열 때 저장소를 기다리지 않게) */
export function rememberEditorDoc(key, doc) {
  if (isSessionDocumentKey(key)) { writeSessionDocument(key, doc); return }
  remember(key, doc)
}

export function forgetEditorDoc(key) {
  if (isSessionDocumentKey(key)) { forgetSessionDocument(key); return true }
  docs.delete(key)
  return true
}

/** 일반 문서는 기존 저장소, 임시 공유 문서는 세션 메모리에 저장한다. */
export function saveEditorDoc(key, doc) {
  return isSessionDocumentKey(key) ? Promise.resolve(writeSessionDocument(key, doc)) : saveJSON(key, doc)
}

/**
 * 저장된 문서를 읽는다. 비어 있는 연간 문서도 페이지 구성 그대로 보존한다.
 * 저장소 읽기 자체가 실패하면 "문서 없음"으로 착각해 덮어쓰지 않도록 reject하고 기억하지 않는다.
 * (JSON이 손상된 경우는 이전처럼 문서 없음으로 본다)
 */
export function loadEditorDoc(diary) {
  const key = editorDocKey(diary)
  if (isSessionDocumentKey(key)) return Promise.resolve(readSessionDocument(key))
  if (docs.has(key)) return Promise.resolve(docs.get(key))
  if (pending.has(key)) return pending.get(key)
  const request = AsyncStorage.getItem(key).then((raw) => {
    let saved = null
    try { saved = raw ? JSON.parse(raw) : null } catch { saved = null }
    const migrated = migrateUntouchedAnnualDoc(saved, diary)
    if (migrated !== saved) saveJSON(key, migrated)
    // 읽는 사이에 편집기가 더 새로운 문서를 기억했다면 그것을 유지한다.
    if (!docs.has(key)) remember(key, migrated?.pages?.length ? migrated : null)
    return docs.get(key)
  }).finally(() => pending.delete(key))
  pending.set(key, request)
  return request
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
  const [saved, pageId] = await Promise.all([
    loadEditorDoc(diary).catch(() => null),
    loadViewedPage(editorDocKey(diary)).catch(() => null),
  ])
  const doc = saved ?? createDefaultDoc(diary)
  const tasks = [prefetchPageTemplate(doc.pages.find((page) => page.id === pageId) ?? doc.pages[0])]
  if (saved && media) tasks.push(Promise.race([hydrateMedia(saved).catch(() => {}), wait(mediaWaitMs)]))
  await Promise.all(tasks)
}
