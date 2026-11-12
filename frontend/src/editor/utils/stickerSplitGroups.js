// Original candidates are immutable. Selection and explicit links are small session-only state.
export function splitGroups(parts, selected, edges = [], links = [], separated = []) {
  const active = new Set(selected), parent = new Map(parts.filter(p => active.has(p.id)).map(p => [p.id, p.id]))
  const isolated = new Set(separated)
  function root(id) { let p = id; while (parent.get(p) !== p) p = parent.get(p); return p }
  function join(a, b) { if (parent.has(a) && parent.has(b)) parent.set(root(b), root(a)) }
  for (const [a, b] of edges) if (!isolated.has(a) && !isolated.has(b)) join(a, b)
  // A manual group remains intact when an intermediate member is excluded.
  for (const link of links) { const ids = link.filter(id => active.has(id)); for (const id of ids.slice(1)) join(ids[0], id) }
  const groups = new Map()
  for (const p of parts) if (parent.has(p.id)) {
    const key = root(p.id); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(p)
  }
  return [...groups.values()].map((members, i) => {
    const x = Math.min(...members.map(p => p.x)), y = Math.min(...members.map(p => p.y))
    return { id: members[0].id, number: i + 1, members, x, y,
      width: Math.max(...members.map(p => p.x + p.width)) - x,
      height: Math.max(...members.map(p => p.y + p.height)) - y }
  })
}
export function brushSelection(selected, hits, add) {
  const next = new Set(selected); for (const id of hits) { if (add) next.add(id); else next.delete(id) }; return [...next]
}
// Only directly touched members leave a group; untouched members stay together.
export function splitBrushTargets(groups, hits) {
  const touched = new Set(hits)
  return [...new Set(groups.filter(group => group.members.length > 1 && group.members.some(part => touched.has(part.id)))
    .flatMap(group => group.members.filter(part => touched.has(part.id)).map(part => part.id)))]
}
export function sortedStickerGroups(groups) {
  return groups.map((group, index) => ({ group, index }))
    .sort((a, b) => b.group.width * b.group.height - a.group.width * a.group.height || a.index - b.index)
    .map(({ group }, index) => ({ ...group, number: index + 1 }))
}
export function thumbnailPlacements(group, frameWidth, frameHeight, padding = 8) {
  if (!group.width || !group.height || frameWidth <= padding * 2 || frameHeight <= padding * 2) return []
  const scale = Math.min((frameWidth - padding * 2) / group.width, (frameHeight - padding * 2) / group.height)
  const x = (frameWidth - group.width * scale) / 2, y = (frameHeight - group.height * scale) / 2
  return group.members.map(part => ({ id: part.id, uri: part.uri, left: x + (part.x - group.x) * scale,
    top: y + (part.y - group.y) * scale, width: part.width * scale, height: part.height * scale }))
}
export function excludeStickerGroup(selected, group) {
  const members = new Set(group.members.map(part => part.id))
  return selected.filter(id => !members.has(id))
}
export function linkSelection(links, selected) {
  const merged = new Set(selected), remaining = []
  for (const link of links) {
    if (link.some(id => merged.has(id))) for (const id of link) merged.add(id)
    else remaining.push(link)
  }
  return [...remaining, [...merged]]
}
export function editHistory(history, next) {
  if (JSON.stringify(history.present) === JSON.stringify(next)) return history
  return { past: [...history.past, history.present].slice(-30), present: next, future: [] }
}
export function moveHistory(history, redo = false) {
  const from = redo ? history.future : history.past
  if (!from.length) return history
  return redo ? { past: [...history.past, history.present].slice(-30), present: from[0], future: from.slice(1) }
    : { past: history.past.slice(0, -1), present: from.at(-1), future: [history.present, ...history.future] }
}
export async function materializeGroups(groups, merge, track) {
  const total = groups.reduce((sum, g) => sum + g.width * g.height, 0)
  if (groups.some(g => g.width * g.height > 8_000_000)) throw new Error('STICKER_TOO_LARGE')
  if (total > 32_000_000) throw new Error('OUTPUT_TOO_LARGE')
  const result = []
  for (const group of groups) {
    if (group.members.length === 1) result.push(group.members[0])
    else { const job = merge(group.members); track(job); result.push(await job.promise) }
  }
  return result
}
