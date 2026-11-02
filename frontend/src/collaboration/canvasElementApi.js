import { decodeElement, sharedElement, isUuid as uuid } from './canvasElements.js'
import { createCanvasApi, stable } from './canvasApi.js'

const invalid = () => { throw Object.assign(Error('캔버스 요소 응답을 확인하지 못했어요.'), { code: 'INVALID_CANVAS_ELEMENTS' }) }
const conflict = () => { throw Object.assign(Error('서버 요소가 달라졌어요. 최신 내용을 확인한 뒤 다시 시도해 주세요.'), { status: 409, code: 'CANVAS_ELEMENT_VERSION_CONFLICT' }) }
const numericFields = new Set(['sortKey','x','y','width','height','rotation','opacity'])
const matches = (row, expected) => Object.entries(expected).every(([key, value]) => {
  if (key === 'version') return true
  if (numericFields.has(key)) {
    // BigDecimal fields may arrive as JSON numbers or decimal strings. Do not
    // coerce arbitrary propertiesJson values or ignore actual geometry changes.
    const number = v => typeof v === 'number' && Number.isFinite(v) ? v
      : typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v) && Number.isFinite(Number(v)) ? Number(v) : NaN
    return Number.isFinite(number(value)) && number(row[key]) === number(value)
  }
  if (key === 'name' && typeof value === 'string') return row[key] === value.trim()
  return stable(row[key]) === stable(value)
})

// Element writes use only /elements. History and WebSocket remain separate
// collaboration APIs. Read before retry: element endpoints have no command key.
export function createCanvasElementApi(transport, media) {
  const historyApi = createCanvasApi(transport, media)
  const root = pageId => { if (!uuid(pageId)) invalid(); return `/pages/${pageId}/elements` }
  const target = (pageId, elementId) => { if (!uuid(elementId)) invalid(); return `${root(pageId)}/${elementId}` }
  const check = (row, pageId, elementId) => {
    if (!row || row.pageId !== pageId || !uuid(row.elementId) || (elementId && row.elementId !== elementId)) invalid()
    if (sharedElement(row)) decodeElement(row)
    return row
  }
  const list = async pageId => {
    const response = await transport({ path: root(pageId) })
    if (!Array.isArray(response?.items)) invalid()
    const rows = response.items.map(row => check(row, pageId))
    if (new Set(rows.map(row => row.elementId)).size !== rows.length) invalid()
    return rows
  }
  const supported = rows => {
    const result = rows.filter(sharedElement)
    Object.defineProperty(result, 'sortKeys', { value: rows.map(row => Number(row.sortKey)).filter(Number.isFinite) })
    media?.hydrate(result).catch(() => {})
    return result
  }
  const single = async (method, pageId, elementId, body, suffix = '') => {
    const path = elementId ? `${target(pageId, elementId)}${suffix}` : root(pageId)
    const response = await transport({ method, path, ...(body ? { body } : {}) })
    if (method === 'DELETE') return null
    return check(response?.element, pageId, elementId ?? body?.elementId)
  }
  const api = {
    prepare: historyApi.prepare,
    history: historyApi.history,
    control: historyApi.control,
    async load(pageId) { return supported(await list(pageId)) },
    create: (pageId, body) => single('POST', pageId, null, body),
    update: (pageId, elementId, body) => single('PATCH', pageId, elementId, body),
    remove: (pageId, elementId) => single('DELETE', pageId, elementId),
    restore: (pageId, elementId) => single('POST', pageId, elementId, null, '/restore'),
    async batch(pageId, body) {
      const response = await transport({ method: 'POST', path: `${root(pageId)}/batch`, body })
      if (!Array.isArray(response?.items)) invalid()
      const rows = response.items.map(row => check(row, pageId))
      if (new Set(rows.map(row => row.elementId)).size !== rows.length) invalid()
      return supported(rows)
    },
    async apply(pageId, request) {
      const rows = await list(pageId), byId = new Map(rows.map(row => [row.elementId, row]))
      const creates = [], updates = [], deleteElementIds = [], restoreElementIds = []
      for (const value of request.changes.creates ?? []) {
        const current = byId.get(value.elementId)
        if (!current) creates.push(value)
        else if (!matches(current, value)) conflict()
      }
      for (const value of request.changes.updates ?? []) {
        const current = byId.get(value.elementId)
        if (current && matches(current, value)) continue
        if (!current || current.version !== value.version) conflict()
        updates.push(value)
      }
      for (const id of request.changes.deleteElementIds ?? []) {
        const current = byId.get(id)
        if (!current) continue
        if (current.version !== request.expectedVersions?.[id]) conflict()
        deleteElementIds.push(id)
      }
      for (const id of request.changes.restoreElementIds ?? []) if (!byId.has(id)) restoreElementIds.push(id)
      const body = { ...(creates.length ? { creates } : {}), ...(updates.length ? { updates } : {}), ...(deleteElementIds.length ? { deleteElementIds } : {}), ...(restoreElementIds.length ? { restoreElementIds } : {}) }
      const count = creates.length + updates.length + deleteElementIds.length + restoreElementIds.length
      if (!count) return { items: supported(rows) }
      if (count > 1) return { items: await api.batch(pageId, body) }
      let element
      if (creates.length) element = await api.create(pageId, creates[0])
      else if (updates.length) { const { elementId, ...patch } = updates[0]; element = await api.update(pageId, elementId, patch) }
      else if (deleteElementIds.length) { await api.remove(pageId, deleteElementIds[0]); byId.delete(deleteElementIds[0]) }
      else element = await api.restore(pageId, restoreElementIds[0])
      // Confirm the write from its validated response. A later poll imports
      // concurrent changes; a second GET cannot turn this success into failure.
      if (element) byId.set(element.elementId, element)
      return { items: supported([...byId.values()].sort((a,b) => Number(a.sortKey)-Number(b.sortKey))) }
    },
  }
  return api
}
