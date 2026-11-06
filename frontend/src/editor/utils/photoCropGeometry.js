import { clamp } from './common.js'

export function visibleRect(crop, boxAspect, imageAspect) {
  const vw = Math.min(1, Math.min(1, boxAspect / imageAspect) / crop.zoom)
  const vh = Math.min(1, Math.min(1, imageAspect / boxAspect) / crop.zoom)
  const u0 = crop.fx * (1 - vw), v0 = crop.fy * (1 - vh)
  return { u0, v0, u1: u0 + vw, v1: v0 + vh }
}

export function fitAspect(rect, ratio) {
  const rw = rect.u1 - rect.u0, rh = rect.v1 - rect.v0
  let w = rw / rh > ratio ? rh * ratio : rw
  let h = w / ratio
  if (w > 1) { w = 1; h = w / ratio }
  if (h > 1) { h = 1; w = h * ratio }
  const cx = clamp((rect.u0 + rect.u1) / 2, w / 2, 1 - w / 2)
  const cy = clamp((rect.v0 + rect.v1) / 2, h / 2, 1 - h / 2)
  return { u0: cx - w / 2, v0: cy - h / 2, u1: cx + w / 2, v1: cy + h / 2 }
}

export const freeZoom = rect => 1 / Math.max(rect.u1 - rect.u0, rect.v1 - rect.v0)

// 긴 변을 유지해 비율 전환이 확대 수치를 바꾸지 않도록 한다.
export function changeCropRatio(rect, ratio) {
  const longest = Math.max(rect.u1 - rect.u0, rect.v1 - rect.v0)
  const w = longest * Math.min(1, ratio), h = longest * Math.min(1, 1 / ratio)
  const cx = clamp((rect.u0 + rect.u1) / 2, w / 2, 1 - w / 2)
  const cy = clamp((rect.v0 + rect.v1) / 2, h / 2, 1 - h / 2)
  return { u0: cx - w / 2, v0: cy - h / 2, u1: cx + w / 2, v1: cy + h / 2 }
}

// 自由比率では短い辺も小さくできる。長い辺が最小値を下回る場合だけ制限する。
export function resizeFreeCrop(rect, handle, du, dv, minLongSide) {
  const r = { ...rect }
  const width = r.u1 - r.u0, height = r.v1 - r.v0
  const minWidth = Math.min(width, 0.001), minHeight = Math.min(height, 0.001)
  if (handle.sx < 0) r.u0 = clamp(r.u0 + du, 0, r.u1 - minWidth)
  if (handle.sx > 0) r.u1 = clamp(r.u1 + du, r.u0 + minWidth, 1)
  if (handle.sy < 0) r.v0 = clamp(r.v0 + dv, 0, r.v1 - minHeight)
  if (handle.sy > 0) r.v1 = clamp(r.v1 + dv, r.v0 + minHeight, 1)
  const required = Math.min(minLongSide, Math.max(width, height))
  if (Math.max(r.u1 - r.u0, r.v1 - r.v0) < required) {
    const preferX = handle.sx && (!handle.sy || width >= height)
    if (preferX) {
      if (handle.sx > 0) r.u1 = r.u0 + required
      else r.u0 = r.u1 - required
    } else if (handle.sy) {
      if (handle.sy > 0) r.v1 = r.v0 + required
      else r.v0 = r.v1 - required
    }
  }
  return r
}

export function cropFromRect(rect) {
  const rw = rect.u1 - rect.u0, rh = rect.v1 - rect.v0
  return {
    zoom: Math.round((1 / Math.max(rw, rh)) * 1000) / 1000,
    fx: rw < 0.999 ? clamp(rect.u0 / (1 - rw), 0, 1) : 0.5,
    fy: rh < 0.999 ? clamp(rect.v0 / (1 - rh), 0, 1) : 0.5,
  }
}

function zoomRect(rect, zoom) {
  const rw = rect.u1 - rect.u0, rh = rect.v1 - rect.v0
  const k = 1 / zoom / Math.max(rw, rh)
  const w = Math.min(1, rw * k), h = Math.min(1, rh * k)
  const cx = clamp((rect.u0 + rect.u1) / 2, w / 2, 1 - w / 2)
  const cy = clamp((rect.v0 + rect.v1) / 2, h / 2, 1 - h / 2)
  return { u0: cx - w / 2, v0: cy - h / 2, u1: cx + w / 2, v1: cy + h / 2 }
}

export function freeTransform(rect, view, zoom, dx, dy) {
  const k = zoom / freeZoom(rect)
  const center = { x: view.left + ((rect.u0 + rect.u1) / 2) * view.width, y: view.top + ((rect.v0 + rect.v1) / 2) * view.height }
  const width = view.width * k, height = view.height * k
  let next = zoomRect(rect, zoom)
  const rw = next.u1 - next.u0, rh = next.v1 - next.v0
  const u0 = clamp(next.u0 - dx / width, 0, 1 - rw), v0 = clamp(next.v0 - dy / height, 0, 1 - rh)
  next = { u0, v0, u1: u0 + rw, v1: v0 + rh }
  return { rect: next, view: { left: center.x - ((next.u0 + next.u1) / 2) * width, top: center.y - ((next.v0 + next.v1) / 2) * height, width, height } }
}
