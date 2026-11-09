import { useCallback, useEffect, useRef, useState } from 'react'
import { savedLibraryView } from '../utils/libraryView.js'

export function useLibraryView(load, save, key) {
  const [view, setView] = useState(null)
  const viewChosen = useRef(false)

  useEffect(() => {
    let alive = true
    Promise.resolve().then(() => load(key, null)).then(saved => {
      if (alive && !viewChosen.current) setView(savedLibraryView(saved) ?? 'carousel')
    }).catch(() => {
      if (alive && !viewChosen.current) setView('carousel')
    })
    return () => { alive = false }
  }, [load, key])

  const changeView = useCallback(next => {
    viewChosen.current = true
    setView(next)
    save(key, next).catch(() => {})
  }, [save, key])

  return [view, changeView]
}
