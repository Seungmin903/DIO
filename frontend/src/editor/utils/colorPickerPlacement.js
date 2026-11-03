export function colorPickerPlacement(anchor, width, height, insets = {}) {
  const left = 8 + (insets.left ?? 0), top = 8 + (insets.top ?? 0)
  const right = width - 8 - (insets.right ?? 0), bottom = height - 8 - (insets.bottom ?? 0)
  const w = Math.max(1, Math.min(296, right - left)), h = Math.max(1, Math.min(430, bottom - top))
  if (!anchor) return { left: left + (right - left - w) / 2, top: top + (bottom - top - h) / 2, width: w, maxHeight: h }
  const after = (anchor?.x ?? left) + (anchor?.width ?? 0) + 12
  const before = (anchor?.x ?? left) - w - 12
  const x = after + w <= right ? after : before >= left ? before : Math.max(left, (width - w) / 2)
  return { left: x, top: Math.max(top, Math.min(anchor?.y ?? top, bottom - h)), width: w, maxHeight: h }
}
