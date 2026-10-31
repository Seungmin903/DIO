import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE_KEYS, loadJSON, saveJSON } from '../../editor/services/storage'
import { DEFAULT_PAPER_APPEARANCE, normalizePaperAppearance } from '../../editor/templates/appearance.js'

/** 꾸미기 공방에서 정한 '새 다이어리의 기본 속지 스타일'(종이 색 · 선 색 · 글꼴). 저장된 것이 없거나 깨졌으면 원래 기본값. */
export async function loadDefaultPaperStyle() {
  return normalizePaperAppearance(await loadJSON(STORAGE_KEYS.defaultPaperStyle, DEFAULT_PAPER_APPEARANCE))
}

/**
 * 기본 속지 스타일 편집용. 이 값은 새 다이어리를 만들 때 처음 값으로만 쓰이고, 이미 만든 다이어리 · 속지는 자기 설정을 따로 저장해 바뀌지 않는다.
 * save(next) 는 저장에 성공하면 true. 실패하면 화면 값도 바꾸지 않는다.
 */
export default function useDefaultPaperStyle() {
  const [style, setStyle] = useState(() => normalizePaperAppearance(DEFAULT_PAPER_APPEARANCE))
  const [ready, setReady] = useState(false)
  const touched = useRef(false)
  useEffect(() => {
    let live = true
    loadDefaultPaperStyle().then(loaded => { if (live && !touched.current) setStyle(loaded) }).finally(() => { if (live) setReady(true) })
    return () => { live = false }
  }, [])
  const save = useCallback(async (next) => {
    const value = normalizePaperAppearance(next)
    touched.current = true
    if (!await saveJSON(STORAGE_KEYS.defaultPaperStyle, value)) return false
    setStyle(value)
    return true
  }, [])
  return { style, ready, save }
}
