import { useCallback, useEffect, useMemo, useState } from 'react'
import { STORAGE_KEYS, loadJSON, removeJSON, saveJSON } from '../../editor/services/storage'
import { DEFAULT_PAPER_APPEARANCE, normalizePaperAppearance } from '../../editor/templates/appearance.js'

// 기본 속지 스타일은 앱 전체가 한 벌을 함께 쓴다(꾸미기 공방 화면, 계정 서버 동기화). useMyLibrary 와 같은 방식으로 읽기 · 저장을 여기 하나로 모은다.
// saved 는 사용자가 고른 적이 있으면 그 값, 없으면 null(원래 기본값을 쓴다). 서버 동기화는 null 이면 '아직 고르지 않음'으로 본다.
const store = { saved: null, loaded: null, queue: Promise.resolve(), listeners: new Set() }
const notify = () => store.listeners.forEach(listener => listener())
const styleOf = saved => normalizePaperAppearance(saved ?? DEFAULT_PAPER_APPEARANCE)

function load() {
  store.loaded ??= (store.queue = loadJSON(STORAGE_KEYS.defaultPaperStyle, null).then(raw => {
    store.saved = raw && typeof raw === 'object' ? normalizePaperAppearance(raw) : null
    notify()
  }))
  return store.loaded
}

// 저장에 성공한 값만 반영한다. 실패하면 false. change 가 undefined 를 돌려주면 바꾸지 않고 false(null 은 '고른 적 없음'으로 되돌림)
function commit(change) {
  load()
  const run = store.queue.then(async () => {
    const next = change(store.saved)
    if (next === undefined) return false
    if (!await (next === null ? removeJSON(STORAGE_KEYS.defaultPaperStyle) : saveJSON(STORAGE_KEYS.defaultPaperStyle, next))) return false
    store.saved = next
    notify()
    return true
  })
  store.queue = run.catch(() => false)
  return run
}

/** 꾸미기 공방에서 정한 '새 다이어리의 기본 속지 스타일'(종이 색 · 선 색 · 글꼴). 저장된 것이 없거나 깨졌으면 원래 기본값. */
export async function loadDefaultPaperStyle() {
  await load()
  return styleOf(store.saved)
}

// 계정 서버 동기화(services/paperLibrarySync.js)가 쓰는 창구
/** 기기 값을 읽은 뒤 풀린다 */
export const defaultPaperStyleReady = () => load()
/** 사용자가 고른 기본 속지 스타일. 고른 적 없으면 null */
export const defaultPaperStyleSnapshot = () => store.saved
/** 바뀔 때마다 불린다. 해제 함수를 돌려준다 */
export function subscribeDefaultPaperStyle(listener) {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}
/**
 * 서버에서 받은 값으로 바꾸고 { style: 적용한 값 }을 돌려준다(null 이면 고른 적 없음으로). base(받기 전에 본 값)가 지금 값과 다르면(그 사이 사용자가 고쳤으면) 바꾸지 않고 null.
 * 동기화는 돌려받은 값과 지금 값을 비교해, 바꾼 직후 들어온 사용자 편집을 놓치지 않는다
 */
export async function replaceDefaultPaperStyle(style, base) {
  let applied = null
  const done = await commit(saved => {
    if (saved !== base) return undefined
    applied = style == null ? null : normalizePaperAppearance(style)
    return applied
  })
  return done ? { style: applied } : null
}

/** 테스트에서 기기 저장소를 새로 읽게 한다 */
export function resetDefaultPaperStyleForTests() {
  store.saved = null; store.loaded = null; store.queue = Promise.resolve(); store.listeners.clear()
}

/**
 * 기본 속지 스타일 편집용. 이 값은 새 다이어리를 만들 때 처음 값으로만 쓰이고, 이미 만든 다이어리 · 속지는 자기 설정을 따로 저장해 바뀌지 않는다.
 * 로그인한 동안에는 계정 서버와도 맞춘다(PaperLibrarySync). save(next) 는 저장에 성공하면 true. 실패하면 화면 값도 바꾸지 않는다.
 */
export default function useDefaultPaperStyle() {
  const [state, setState] = useState(() => ({ saved: store.saved, ready: false }))
  useEffect(() => {
    let live = true
    const update = () => { if (live) setState(previous => (previous.saved === store.saved && previous.ready) ? previous : { saved: store.saved, ready: true }) }
    store.listeners.add(update)
    load().then(update, update)
    return () => { live = false; store.listeners.delete(update) }
  }, [])
  const save = useCallback(next => commit(() => normalizePaperAppearance(next)), [])
  const style = useMemo(() => styleOf(state.saved), [state.saved])
  return { style, ready: state.ready, save }
}
