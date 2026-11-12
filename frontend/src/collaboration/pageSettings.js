import { gridColor } from '../editor/utils/pageGrid.js'

export function normalizePageSettings(page) {
  return { ...page, gridVisible: page.gridVisible === true, gridColor: gridColor(page.gridColor) }
}

const allowed = new Set(['title', 'templateId', 'templateConfig', 'canvasWidth', 'canvasHeight', 'gridVisible', 'gridColor', 'paperAppearance', 'applyPaperAppearanceToAllPages'])
const invalid = message => { throw Object.assign(new Error(message), { code: 'INVALID_PAGE_SETTINGS' }) }
export function pageSettingsBody(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || !Object.keys(input).length) invalid('수정할 페이지 설정을 입력해 주세요.')
  const body = { ...input }
  for (const [key, value] of Object.entries(body)) if (!allowed.has(key) || value == null) invalid('수정할 수 없는 페이지 설정이에요.')
  if ('title' in body) {
    if (typeof body.title !== 'string') invalid('페이지 이름을 확인해 주세요.')
    body.title = body.title.trim()
    if (!body.title || body.title.length > 100) invalid('페이지 이름은 1~100자로 입력해 주세요.')
  }
  if (('canvasWidth' in body) !== ('canvasHeight' in body)) invalid('가로와 세로 크기를 함께 입력해 주세요.')
  for (const key of ['canvasWidth', 'canvasHeight']) if (key in body) {
    const value = body[key]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0.01 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) invalid('크기는 0.01 이상, 소수 둘째 자리까지 입력해 주세요.')
  }
  if ('gridVisible' in body && typeof body.gridVisible !== 'boolean') invalid('격자 표시를 확인해 주세요.')
  if ('gridColor' in body && (typeof body.gridColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(body.gridColor))) invalid('격자 색은 #RRGGBB 형식으로 입력해 주세요.')
  if ('templateId' in body && (!Number.isSafeInteger(body.templateId) || body.templateId <= 0)) invalid('속지 정보를 확인해 주세요.')
  if ('templateConfig' in body && (typeof body.templateConfig !== 'object' || Array.isArray(body.templateConfig))) invalid('속지 설정을 확인해 주세요.')
  if ('paperAppearance' in body) {
    if (typeof body.paperAppearance !== 'object' || Array.isArray(body.paperAppearance)
      || Object.keys(body).some(key => key !== 'paperAppearance' && key !== 'applyPaperAppearanceToAllPages'))
      invalid('속지 설정을 확인해 주세요.')
  }
  if ('applyPaperAppearanceToAllPages' in body && (!body.paperAppearance || typeof body.applyPaperAppearanceToAllPages !== 'boolean'))
    invalid('속지 적용 범위를 확인해 주세요.')
  return body
}

export function pageSettingsChanges(page, { title, width, height, grid, color }) {
  page = normalizePageSettings(page)
  const body = {}
  if (title !== (page.title ?? '')) body.title = title
  if (Number(width) !== page.canvasWidth || Number(height) !== page.canvasHeight) {
    body.canvasWidth = Number(width); body.canvasHeight = Number(height)
  }
  if (grid !== page.gridVisible) body.gridVisible = grid
  if (grid && color !== page.gridColor) body.gridColor = color
  return Object.keys(body).length ? pageSettingsBody(body) : null
}

// A settings acknowledgement never replaces unsent canvas objects or creates a
// local undo operation for a setting already committed on the server.
export function applyPageSettings(state, settings, paperAppearance) {
  const byId = new Map(settings.map(p => [p.id, p]))
  const adapt = doc => ({ ...doc, ...(paperAppearance && { paperAppearance }), pages: doc.pages.map(page => {
    const patch = byId.get(page.id)
    return patch ? { ...page, ...patch, objects: page.objects } : page
  }) })
  return { ...state, externalDirty: true, doc: adapt(state.doc),
    past: state.past.map(adapt), future: state.future.map(adapt),
    pendingCheckpoint: state.pendingCheckpoint ? { ...state.pendingCheckpoint, doc: adapt(state.pendingCheckpoint.doc) } : null }
}
