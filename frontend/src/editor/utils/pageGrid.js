export const DEFAULT_GRID_COLOR = '#DCE5F1'
export const GRID_SPACINGS = [
  { id: 'narrow', label: '좁게', value: 16 },
  { id: 'normal', label: '보통', value: 32 },
  { id: 'wide', label: '넓게', value: 64 },
]
export const gridColor = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_GRID_COLOR
export const gridSpacing = id => (GRID_SPACINGS.find(value => value.id === id) ?? GRID_SPACINGS[1]).value

// Explicit screen guides take priority. A saved page grid is the fallback;
// neither the screen preference object nor the page is changed here.
export function pageGridGuides(page, guides) {
  if (!page.gridVisible || (guides.grid && guides.grid !== 'none')) return guides
  return { ...guides, grid: 'lines', spacing: GRID_SPACINGS.some(value => value.id === guides.spacing) ? guides.spacing : 'normal', gridColor: gridColor(page.gridColor) }
}
