import { useCallback, useEffect, useState } from 'react'
import documentStorage from '../../editor/services/documentStorage'
import { STORAGE_KEYS, loadJSON, saveJSON } from '../../editor/services/storage'
import { collectMediaIds } from '../../editor/utils/mediaReferences'
import * as mediaRepository from '../../editor/utils/mediaRepository'
import { addMyCover, addMyPaper, normalizeMyCovers, normalizeMyPapers, removeEntry, renameEntry, replaceCoverDesign } from '../utils/myLibrary.js'
import { cleanupRemovedEntry } from '../utils/libraryCleanup.js'
import { collectPdfSourceIds } from '../utils/pdfSource.js'
import { removePdfSource } from '../utils/pdfSourceStore'

// 내 표지 · 내 속지는 앱 전체가 한 벌을 함께 쓴다(새 다이어리 · 꾸미기 공방 · 편집기 화면, 계정 서버 동기화).
// 화면마다 따로 읽어 두면 한쪽에서 고친 것을 다른 쪽이 예전 목록 위에 덮어쓰므로, 읽기 · 저장을 여기 하나로 모은다.
// 저장은 읽은 값 위에 차례로 얹어(queue) 빠르게 두 번 눌러도 서로 덮어쓰지 않는다.
const store = { covers: [], papers: [], loaded: null, queue: Promise.resolve(), listeners: new Set() }
const notify = () => store.listeners.forEach(listener => listener())

function load() {
  // 읽기가 끝나기 전에 저장이 들어오면 빈 목록 위에 덮어쓰지 않도록, 저장은 이 읽기 뒤에 줄을 선다.
  store.loaded ??= (store.queue = Promise.all([loadJSON(STORAGE_KEYS.myCovers, []), loadJSON(STORAGE_KEYS.myPapers, [])]).then(([rawCovers, rawPapers]) => {
    store.covers = normalizeMyCovers(rawCovers); store.papers = normalizeMyPapers(rawPapers)
    notify()
  }))
  return store.loaded
}

// 저장에 성공한 값만 반영한다. 실패하면 false. change 가 null 을 돌려주면 바꾸지 않고 false
function commit(kind, change) {
  load() // 처음이면 읽기가 store.queue 에 먼저 선다
  const run = store.queue.then(async () => {
    const key = kind === 'covers' ? STORAGE_KEYS.myCovers : STORAGE_KEYS.myPapers
    const next = change(store[kind])
    if (next == null) return false
    if (!await saveJSON(key, next)) return false
    store[kind] = next
    notify()
    return true
  })
  store.queue = run.catch(() => false)
  return run
}

// 계정 서버 동기화(services/coverLibrarySync.js)가 쓰는 내 표지 창구
/** 기기 목록을 읽은 뒤 풀린다 */
export const myCoversReady = () => load()
/** 지금 내 표지 목록 */
export const myCoversSnapshot = () => store.covers
/** 목록이 바뀔 때마다 불린다(내 속지가 바뀌어도 불린다). 해제 함수를 돌려준다 */
export function subscribeMyLibrary(listener) {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}
/**
 * 서버에서 받은 목록으로 바꾸고 적용한 목록을 돌려준다. base(받기 전에 본 목록)가 지금 목록과 다르면(그 사이 사용자가 고쳤으면) 바꾸지 않고 null.
 * 동기화는 돌려받은 목록과 지금 목록을 비교해, 바꾼 직후 들어온 사용자 편집을 놓치지 않는다
 */
export async function replaceMyCovers(covers, base) {
  let applied = null
  const done = await commit('covers', list => (list === base ? (applied = normalizeMyCovers(covers)) : null))
  return done ? applied : null
}

/** 테스트에서 기기 저장소를 새로 읽게 한다 */
export function resetMyLibraryForTests() {
  store.covers = []; store.papers = []; store.loaded = null; store.queue = Promise.resolve(); store.listeners.clear()
}

/**
 * 내 표지 · 내 속지. 기기에 저장하고 새 다이어리 화면에서 꺼내 쓴다. 로그인한 동안 내 표지는 계정 서버와도 맞춘다(CoverLibrarySync).
 */
export default function useMyLibrary() {
  const [state, setState] = useState(() => ({ covers: store.covers, papers: store.papers, ready: false }))
  useEffect(() => {
    let live = true
    const update = () => { if (live) setState(previous => (previous.covers === store.covers && previous.papers === store.papers && previous.ready) ? previous : { covers: store.covers, papers: store.papers, ready: true }) }
    store.listeners.add(update)
    load().then(update)
    return () => { live = false; store.listeners.delete(update) }
  }, [])

  // 항목을 지운 뒤, 그 항목만 쓰던 쪽 그림과 원본 PDF 를 함께 지운다(다른 다이어리 · 보관함이 쓰면 남긴다). 정리가 실패해도 지우기는 성공으로 본다.
  const remove = useCallback(async (kind, id) => {
    let removed = null
    const done = await commit(kind, list => { removed = list.find(item => item.id === id) ?? null; return removeEntry(list, id) })
    if (done && removed) {
      cleanupRemovedEntry({ entry: removed, storage: documentStorage, keys: STORAGE_KEYS, collectMediaIds, collectSourceIds: collectPdfSourceIds,
        removeMedia: mediaRepository.remove, removeSource: removePdfSource }).catch(() => {})
    }
    return done
  }, [])

  return {
    covers: state.covers, papers: state.papers, ready: state.ready,
    addCover: useCallback(entry => commit('covers', list => addMyCover(list, entry)), []),
    addPaper: useCallback(entry => commit('papers', list => addMyPaper(list, entry)), []),
    removeCover: useCallback(id => remove('covers', id), [remove]),
    removePaper: useCallback(id => remove('papers', id), [remove]),
    renameCover: useCallback((id, name) => commit('covers', list => renameEntry(list, id, name)), []),
    renamePaper: useCallback((id, name) => commit('papers', list => renameEntry(list, id, name)), []),
    // 표지 편집 저장. 바꾸면서 더 이상 아무도 쓰지 않게 된 그림(예전 사진 등)은 지우기와 같은 정리로 참조를 세어 지운다
    updateCover: useCallback(async (id, cover) => {
      let before = null
      const done = await commit('covers', list => { before = list.find(item => item.id === id) ?? null; return replaceCoverDesign(list, id, cover) })
      if (done && before) {
        cleanupRemovedEntry({ entry: before, storage: documentStorage, keys: STORAGE_KEYS, collectMediaIds, collectSourceIds: collectPdfSourceIds,
          removeMedia: mediaRepository.remove, removeSource: removePdfSource }).catch(() => {})
      }
      return done
    }, []),
  }
}
