import { Children, cloneElement, isValidElement } from 'react'
import { photoAlbumSlots, visibleAlbumSlotIndices } from './photoAlbumSlots.js'

// Cache belongs to all pages, so clone only the branches containing album borders.
export function omitFilledAlbumBordersAst(ast, page) {
  const slots = photoAlbumSlots(page.backgroundAssetId)
  const filled = visibleAlbumSlotIndices(page)
  if (!ast || !filled.length) return ast
  const visit = node => {
    if (!isValidElement(node)) return node
    const p = node.props
    if (filled.some(i => { const b = slots[i]; return Number(p.x) === b.x && Number(p.y) === b.y && Number(p.width) === b.w && Number(p.height) === b.h && p.fill === 'none' })) return null
    return p.children == null ? node : cloneElement(node, {}, Children.map(p.children, visit))
  }
  return { ...ast, children: Children.map(ast.children, visit) }
}
