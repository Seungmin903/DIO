import { useEffect, useState, useSyncExternalStore } from 'react'
import { TAPE_DEFAULT, TAPE_PALETTES, TAPE_PATTERN_NAMES, TAPE_SIZES } from '../constants'
import { loadJSON, saveJSON, STORAGE_KEYS } from '../services/storage'
import { createTapePreferences } from '../services/tapePreferences.js'

const store = createTapePreferences({
  load: () => loadJSON(STORAGE_KEYS.tapePreferences, null),
  save: value => saveJSON(STORAGE_KEYS.tapePreferences, value),
  sizes: TAPE_SIZES.map(item => item.id), palettes: TAPE_PALETTES.map(item => item.id),
  patterns: Object.keys(TAPE_PATTERN_NAMES), defaultSize: TAPE_DEFAULT.size,
})

export function useTapePreferences() {
  const preferences = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    store.ensureLoaded().then(() => { if (active) setReady(true) })
    return () => { active = false }
  }, [])
  return [preferences, store.update, ready]
}
