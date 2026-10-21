// 편집 문서는 서버가 아니라 기기 저장소에 있다. 편집기를 열 때 "로딩 중" 화면이 생기지 않도록
// 문서·첫 화면 속지·사진을 편집기 진입 전에 준비하고, 한 번 읽은 문서는 메모리에 둔다.
import { createDefaultDoc, migrateUntouchedAnnualDoc } from '../state/defaultDoc'
import { templateReference } from '../templates/catalog.js'
import { loadTemplateAst } from '../templates/loadTemplate'
import { hydrateMedia } from './mediaStore'
import { loadJSON, saveJSON, STORAGE_KEYS } from './storage'

const docs = new Map() // 저장 키 → 저장된 문서 (null: 아직 저장된 문서 없음)
const pending = new Map()
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const editorDocKey = (diary) => (diary?.id ? `${STORAGE_KEYS.doc}:${diary.id}` : STORAGE_KEYS.doc)

/** 메모리에 있으면 { doc }를, 아직 읽지 않았으면 null을 돌려준다. */
export function peekEditorDoc(key) {
  return docs.has(key) ? { doc: docs.get(key) } : null
}

/** 편집 중인 최신 문서로 메모리 사본을 갱신한다. (다시 열 때 저장소를 기다리지 않게) */
export function rememberEditorDoc(key, doc) {
  docs.set(key, doc)
}

export function forgetEditorDoc(key) {
  docs.delete(key)
}

/** 저장된 문서를 읽는다. 내용 없는 예전 연간 78쪽 문서는 한 페이지로 이전한다. */
export function loadEditorDoc(diary) {
  const key = editorDocKey(diary)
  if (docs.has(key)) return Promise.resolve(docs.get(key))
  if (pending.has(key)) return pending.get(key)
  const request = loadJSON(key, null).then((saved) => {
    const migrated = migrateUntouchedAnnualDoc(saved, diary)
    if (migrated !== saved) saveJSON(key, migrated)
    // 읽는 사이에 편집기가 더 새로운 문서를 기억했다면 그것을 유지한다.
    if (!docs.has(key)) docs.set(key, migrated?.pages?.length ? migrated : null)
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
  const saved = await loadEditorDoc(diary).catch(() => null)
  const doc = saved ?? createDefaultDoc(diary)
  const tasks = [prefetchPageTemplate(doc.pages[0])]
  if (saved && media) tasks.push(Promise.race([hydrateMedia(saved).catch(() => {}), wait(mediaWaitMs)]))
  await Promise.all(tasks)
}
