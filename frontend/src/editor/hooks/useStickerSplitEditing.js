import { useEffect, useMemo, useRef, useState } from 'react'
import { stickerSplit } from '../services/stickerSplit'
import { editHistory, moveHistory, splitGroups, linkSelection, sortedStickerGroups } from '../utils/stickerSplitGroups.js'
import { splitError } from '../utils/stickerSplit.js'

const empty = () => ({ selected: [], distance: 0, links: [], separated: [] })
const noSeparation = []
export default function useStickerSplitEditing(parts, source, crop, jobIds) {
  const [history, setHistory] = useState(() => ({ past: [], present: empty(), future: [] }))
  const current = useRef(history); current.current = history
  const [draft, setDraft] = useState(null)
  const distance = draft ?? history.present.distance
  const separated = draft !== null && draft !== history.present.distance ? noSeparation : history.present.separated
  const [result, setResult] = useState(null)
  const [failure, setFailure] = useState(null)
  const [retry, setRetry] = useState(0)
  const committed = useRef({ source: null, groups: [] })
  const enabled = !!stickerSplit.selectionEditing
  const selected = history.present.selected
  const pixels = source ? Math.min(source.width * crop.width, source.height * crop.height) * distance / 100 : 0
  useEffect(() => {
    if (!enabled || selected.length < 2 || !parts.length || distance === 0) return
    if (result?.parts === parts && result.selected === selected && result.distance === distance && result.pixels === pixels) return
    let valid = true, job
    const timer = setTimeout(() => {
      const active = new Set(selected)
      job = stickerSplit.groupEdges(parts.filter(p => active.has(p.id)), pixels)
      jobIds.current.push(job.id)
      job.promise.then(edges => { if (valid) { setResult({ parts, selected, distance, pixels, edges }); setFailure(null) } }, error => {
        if (valid) setFailure({ parts, selected, distance, pixels, message: splitError(error) })
      }).finally(() => stickerSplit.cleanup([job.id]))
    }, 120)
    return () => { valid = false; clearTimeout(timer); if (job) stickerSplit.cancel(job.id) }
  }, [enabled, parts, selected, distance, pixels, retry])
  const ready = !enabled || selected.length < 2 || distance === 0 || (result?.parts === parts && result.selected === selected && result.distance === distance && result.pixels === pixels)
  const error = !ready && failure?.parts === parts && failure.selected === selected && failure.distance === distance && failure.pixels === pixels ? failure.message : ''
  const latestGroups = useMemo(() => ready ? sortedStickerGroups(splitGroups(parts, selected, distance > 0 ? result?.edges : [], history.present.links, separated)) : null,
    [ready, parts, selected, distance, result?.edges, history.present.links, separated])
  if (latestGroups) committed.current = { source: source?.uri, groups: latestGroups }
  const groups = committed.current.source === source?.uri ? committed.current.groups : []
  function update(patch) {
    setDraft(null)
    setHistory(previous => editHistory(previous, { ...previous.present, ...patch }))
  }
  return {
    enabled, selected: history.present.selected, distance, ready, pending: !ready && !error, error,
    groups,
    setSelected(value) { setHistory(previous => editHistory(previous, { ...previous.present, selected: typeof value === 'function' ? value(previous.present.selected) : value })) },
    reset(selected = [], initial = null) {
      const distance = initial?.distance ?? 0
      setDraft(null); setFailure(null)
      setResult(initial?.edges ? { parts: initial.parts, selected, distance,
        pixels: source ? Math.min(source.width * crop.width, source.height * crop.height) * distance / 100 : 0, edges: initial.edges } : null)
      setHistory({ past: [], present: { ...empty(), selected, distance }, future: [] })
    },
    previewDistance: setDraft, cancelDistance() { setDraft(null) },
    retry() { setFailure(null); setRetry(value => value + 1) },
    setDistance(distance) { update({ distance, separated: distance === current.current.present.distance ? current.current.present.separated : [] }) },
    mergeSelected(ids = current.current.present.selected) {
      const active = new Set(current.current.present.selected), members = ids.filter(id => active.has(id))
      if (members.length >= 2) update({ links: linkSelection(current.current.present.links, members) })
    },
    splitSelected(ids) {
      const value = current.current.present, active = new Set(value.selected)
      const members = new Set(ids.filter(id => active.has(id)))
      if (members.size < 2) return
      update({ links: value.links.map(link => link.filter(id => !members.has(id))).filter(link => link.length > 1),
        separated: [...new Set([...value.separated, ...members])] })
    },
    undo() { setDraft(null); setHistory(value => moveHistory(value)) }, redo() { setDraft(null); setHistory(value => moveHistory(value, true)) },
    canUndo: history.past.length > 0, canRedo: history.future.length > 0,
  }
}
