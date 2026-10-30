import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE_KEYS, loadJSON, saveJSON } from '../../editor/services/storage'
import { addMyCover, addMyPaper, normalizeMyCovers, normalizeMyPapers, removeEntry } from '../utils/myLibrary.js'

/**
 * 나의 표지 · 나의 속지. 기기에 저장하고 새 다이어리 화면에서 꺼내 쓴다.
 * 저장은 읽은 값 위에 차례로 얹어(queue) 빠르게 두 번 눌러도 서로 덮어쓰지 않는다.
 */
export default function useMyLibrary() {
  const [covers, setCovers] = useState([])
  const [papers, setPapers] = useState([])
  const [ready, setReady] = useState(false)
  const latest = useRef({ covers: [], papers: [] })
  const queue = useRef(Promise.resolve())
  useEffect(() => {
    let live = true
    // 읽기가 끝나기 전에 저장이 들어오면 빈 목록 위에 덮어쓰지 않도록, 저장은 이 읽기 뒤에 줄을 선다.
    queue.current = Promise.all([loadJSON(STORAGE_KEYS.myCovers, []), loadJSON(STORAGE_KEYS.myPapers, [])]).then(([rawCovers, rawPapers]) => {
      latest.current = { covers: normalizeMyCovers(rawCovers), papers: normalizeMyPapers(rawPapers) }
      if (!live) return
      setCovers(latest.current.covers); setPapers(latest.current.papers); setReady(true)
    })
    return () => { live = false }
  }, [])

  // 저장에 성공한 값만 화면에 반영한다. 실패하면 false.
  const commit = useCallback((kind, change) => {
    const run = queue.current.then(async () => {
      const key = kind === 'covers' ? STORAGE_KEYS.myCovers : STORAGE_KEYS.myPapers
      const next = change(latest.current[kind])
      if (!await saveJSON(key, next)) return false
      latest.current = { ...latest.current, [kind]: next }
      ;(kind === 'covers' ? setCovers : setPapers)(next)
      return true
    })
    queue.current = run.catch(() => false)
    return run
  }, [])

  return {
    covers, papers, ready,
    addCover: useCallback(entry => commit('covers', list => addMyCover(list, entry)), [commit]),
    addPaper: useCallback(entry => commit('papers', list => addMyPaper(list, entry)), [commit]),
    removeCover: useCallback(id => commit('covers', list => removeEntry(list, id)), [commit]),
    removePaper: useCallback(id => commit('papers', list => removeEntry(list, id)), [commit]),
  }
}
