// Coordinates follow the original 768×1024 / 1024×768 album SVGs.
export function photoAlbumSlots(assetId) {
  if (assetId === 'remote-photo-album-portrait') {
    return [120, 412.7, 705.3].flatMap(y => [40, 393].map(x => ({ x, y, w: 335, h: 232.7 })))
  }
  if (assetId === 'remote-photo-album-landscape') {
    return [120, 431].flatMap(y => [40, 360.7, 681.3].map(x => ({ x, y, w: 302.7, h: 251 })))
  }
  return []
}

export function photoAlbumSlotOccupied(page, index) {
  const box = photoAlbumSlots(page.backgroundAssetId)[index]
  return Boolean(box && page.objects.some(o => o.type === 'photo' && o.albumSlot === index &&
    Math.abs(o.x - box.x) < 1 && Math.abs(o.y - box.y) < 1 && Math.abs(o.w - box.w) < 1 && Math.abs(o.h - box.h) < 1 && Math.abs(o.rotation || 0) < 0.01))
}

export function photoAlbumSlotAt(page, point) {
  return photoAlbumSlots(page.backgroundAssetId).findIndex((box, index) => !photoAlbumSlotOccupied(page, index) &&
    point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h)
}

export function availablePhotoAlbumSlot(page, requested) {
  const slots = photoAlbumSlots(page.backgroundAssetId)
  if (slots[requested] && !photoAlbumSlotOccupied(page, requested)) return requested
  return slots.findIndex((_, index) => !photoAlbumSlotOccupied(page, index))
}

// A hidden or transparent photo should not hide the empty slot border.
export function visibleAlbumSlotIndices(page) {
  return photoAlbumSlots(page.backgroundAssetId).map((_, index) => index).filter(index =>
    photoAlbumSlotOccupied({ ...page, objects: (page.objects ?? []).filter(o => !o.hidden && o.opacity !== 0) }, index))
}

export function omitFilledAlbumBordersXml(xml, page) {
  const filled = new Set(visibleAlbumSlotIndices(page))
  if (!filled.size) return xml
  return xml.replace(/<rect\b[^>]*\bdata-album-slot=["'](\d+)["'][^>]*\/>/g, (tag, index) => filled.has(Number(index)) ? '' : tag)
}
