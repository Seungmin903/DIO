import { outlineOf, shadowOf } from './effects.js'

/*
 * 페이지 GIF 층 합성. 장면이 바뀌어도 GIF 가 아닌 부분은 그대로라서, 페이지는 GIF 사이사이의 층으로 몇 번만 찍고
 * 장면마다 GIF 장면을 그 사이에 픽셀로 끼워 합친다. (예전에는 장면마다 페이지를 다시 그려 PNG 로 찍고 다시 풀었다)
 * 픽셀은 출력 픽셀 기준 RGBA(알파 곱하지 않음). 층은 같은 크기(페이지 전체)로 찍는다.
 */

const VIEW_CLIP_SHAPES = { rect: 0, round: 0.14, circle: 0.5 } // ObjectView 와 같은 값

/**
 * 이 GIF 요소를 픽셀 합치기로 화면과 똑같이 그릴 수 있는지. 테두리 · 그림자 · 틀 · 하트처럼 모양 경로로 자르는 요소는
 * 화면 그리기를 그대로 따라 하기 어려워 예전 방식(장면마다 찍기)으로 둔다.
 */
export function layerDrawable(object) {
  if (!object || !Number.isFinite(object.w) || !Number.isFinite(object.h) || object.w <= 0 || object.h <= 0) return false
  if (outlineOf(object).on || shadowOf(object).on) return false
  if (object.type === 'sticker') return !object.routeNode && !object.widget && !object.pdfSource && !object.builtin && !object.asset
  if (object.type === 'photo') {
    if (object.frame !== 'shape' || VIEW_CLIP_SHAPES[object.shape] == null) return false
    return object.imageWidth > 0 && object.imageHeight > 0 && Boolean(object.crop) && Number.isFinite(object.crop.zoom)
  }
  return false
}

/**
 * 뒤→앞 순서의 요소를 층과 GIF 로 나눈다: [층(바탕 포함), GIF, 층, GIF, …, 층(맨 위)].
 * 층 role: 'base'(바탕색 · 속지 · 맨 아래 요소), 'middle'(GIF 사이 요소, 투명 바탕), 'top'(맨 위 요소 + 속지 앞 그림, 투명 바탕).
 * 층마다 capture: 찍어야 하는지(바탕은 늘 찍고, 사이 층은 요소가 있을 때만, 맨 위는 요소나 속지 앞 그림이 있을 때만).
 * 합치기로 못 그리는 GIF 가 있거나, 찍을 층이 maxLayers 개를 넘으면 null (예전 방식으로 만든다).
 */
export function planLayers(objects, isGif, { hasFrontLayer = false, maxLayers = 4 } = {}) {
  const segments = []
  let current = []
  for (const object of objects) {
    if (!isGif(object)) { current.push(object); continue }
    if (!layerDrawable(object)) return null
    segments.push({ kind: 'layer', objects: current }, { kind: 'gif', object })
    current = []
  }
  segments.push({ kind: 'layer', objects: current })
  const layers = segments.filter((s) => s.kind === 'layer')
  if (layers.length < 2) return null // GIF 가 없다
  layers.forEach((layer, i) => {
    layer.role = i === 0 ? 'base' : i === layers.length - 1 ? 'top' : 'middle'
    layer.capture = layer.role === 'base' || layer.objects.length > 0 || (layer.role === 'top' && hasFrontLayer)
  })
  if (layers.filter((l) => l.capture).length > maxLayers) return null
  return segments
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * GIF 요소 안에서 그림이 놓이는 곳과 잘라 내는 모양(요소 상자 기준, 페이지 단위).
 * content: 그림 사각형, clip: { x, y, width, height, radius(모서리 반지름, 'ellipse' 면 타원) }
 */
export function gifPlacement(object, frameWidth, frameHeight) {
  const { w, h } = object
  if (object.type === 'photo') {
    // ObjectView 의 coverLayout 과 같다
    const scale = Math.max(w / object.imageWidth, h / object.imageHeight) * object.crop.zoom
    const width = object.imageWidth * scale, height = object.imageHeight * scale
    const content = { x: -(width - w) * (object.crop.fx ?? 0.5), y: -(height - h) * (object.crop.fy ?? 0.5), width, height }
    const radius = object.shape === 'circle' ? 'ellipse' : Math.min(w, h) * (object.radius ?? VIEW_CLIP_SHAPES[object.shape] ?? 0)
    return { content, clip: { x: 0, y: 0, width: w, height: h, radius } }
  }
  // 스티커: 배경 스티커는 늘이고(stretch), 나머지는 비율대로 상자 안에(contain)
  if (object.backdrop) return { content: { x: 0, y: 0, width: w, height: h }, clip: { x: 0, y: 0, width: w, height: h, radius: 0 } }
  const s = Math.min(w / frameWidth, h / frameHeight)
  const content = { x: (w - frameWidth * s) / 2, y: (h - frameHeight * s) / 2, width: frameWidth * s, height: frameHeight * s }
  return { content, clip: { ...content, radius: 0 } }
}

/** 잘라 내는 모양 안쪽으로 얼마나 들어와 있는지(페이지 단위, 바깥이면 음수) */
function insideDistance(x, y, clip) {
  if (clip.radius === 'ellipse') {
    const rx = clip.width / 2, ry = clip.height / 2
    const nx = (x - clip.x - rx) / rx, ny = (y - clip.y - ry) / ry
    const length = Math.hypot(nx, ny)
    // 타원 경계까지 거리를 짧은 반지름 기준으로 어림한다
    return (1 - length) * Math.min(rx, ry)
  }
  const r = Math.min(clip.radius, clip.width / 2, clip.height / 2)
  const dx = Math.min(x - clip.x, clip.x + clip.width - x), dy = Math.min(y - clip.y, clip.y + clip.height - y)
  if (r > 0 && dx < r && dy < r) return r - Math.hypot(r - dx, r - dy)
  return Math.min(dx, dy)
}

/**
 * GIF 장면 하나를 요소 자리(위치 · 크기 · 회전 · 뒤집기 · 불투명도 · 자르기)에 맞춰 dest 에 덮어 그린다.
 * dest: region 크기 RGBA(출력 픽셀), region: { x, y, width, height } 출력 픽셀, ratio: { x, y } 페이지 단위 → 출력 픽셀
 * frame: { rgba, width, height } (보이는 크기로 줄여 둔 장면), source: { width, height } 원본 GIF 크기(비율 계산용)
 */
export function drawGifObject(dest, region, ratio, object, frame, source = frame) {
  const { content, clip } = gifPlacement(object, source.width, source.height)
  const opacity = clamp01(object.opacity ?? 1)
  if (opacity <= 0) return
  const angle = ((object.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(angle), sin = Math.sin(angle)
  const cx = object.x + object.w / 2, cy = object.y + object.h / 2
  // 요소 상자를 돌린 뒤의 바깥 사각형(출력 픽셀)과 그릴 영역이 겹치는 곳만 돈다
  const halfW = (Math.abs(object.w * cos) + Math.abs(object.h * sin)) / 2, halfH = (Math.abs(object.w * sin) + Math.abs(object.h * cos)) / 2
  const x0 = Math.max(region.x, Math.floor((cx - halfW) * ratio.x) - 1), x1 = Math.min(region.x + region.width, Math.ceil((cx + halfW) * ratio.x) + 1)
  const y0 = Math.max(region.y, Math.floor((cy - halfH) * ratio.y) - 1), y1 = Math.min(region.y + region.height, Math.ceil((cy + halfH) * ratio.y) + 1)
  if (x0 >= x1 || y0 >= y1) return
  const pixelScale = (ratio.x + ratio.y) / 2 // 페이지 단위 1 = 출력 픽셀 몇 개 (가장자리 부드럽게)
  const flipX = object.flipX ? -1 : 1, flipY = object.flipY ? -1 : 1
  const { rgba, width: fw, height: fh } = frame
  const ux = fw / content.width, vy = fh / content.height
  for (let py = y0; py < y1; py++) {
    const pageY = (py + 0.5) / ratio.y - cy
    for (let px = x0; px < x1; px++) {
      const pageX = (px + 0.5) / ratio.x - cx
      // 화면처럼 요소 가운데를 기준으로 돌린 것을 되돌리고, 뒤집기를 되돌린다
      const bx = (pageX * cos + pageY * sin) * flipX + object.w / 2
      const by = (-pageX * sin + pageY * cos) * flipY + object.h / 2
      const coverage = clamp01(insideDistance(bx, by, clip) * pixelScale + 0.5)
      if (coverage <= 0) continue
      // 장면에서 쌍선형으로 뽑는다 (알파를 곱해 섞어야 투명 가장자리가 검게 번지지 않는다)
      const u = Math.min(fw - 1, Math.max(0, (bx - content.x) * ux - 0.5)), v = Math.min(fh - 1, Math.max(0, (by - content.y) * vy - 0.5))
      const iu = Math.floor(u), iv = Math.floor(v), tu = u - iu, tv = v - iv
      const iu1 = Math.min(fw - 1, iu + 1), iv1 = Math.min(fh - 1, iv + 1)
      let a = 0, r = 0, g = 0, b = 0
      const take = (sx, sy, weight) => {
        if (weight <= 0) return
        const i = (sy * fw + sx) * 4, wa = rgba[i + 3] * weight
        a += wa; r += rgba[i] * wa; g += rgba[i + 1] * wa; b += rgba[i + 2] * wa
      }
      take(iu, iv, (1 - tu) * (1 - tv)); take(iu1, iv, tu * (1 - tv)); take(iu, iv1, (1 - tu) * tv); take(iu1, iv1, tu * tv)
      if (a <= 0) continue
      const alpha = (a / 255) * coverage * opacity
      const o = ((py - region.y) * region.width + (px - region.x)) * 4
      blendPixel(dest, o, r / a, g / a, b / a, alpha)
    }
  }
}

/** dest[o] 위에 (r, g, b) 를 alpha(0~1) 로 덮는다 (source-over, 알파 곱하지 않은 값). Uint8Array 는 소수를 버려 반올림해 넣는다 */
function blendPixel(dest, o, r, g, b, alpha) {
  if (alpha >= 1) { dest[o] = r + 0.5; dest[o + 1] = g + 0.5; dest[o + 2] = b + 0.5; dest[o + 3] = 255; return }
  const da = dest[o + 3] / 255, outA = alpha + da * (1 - alpha)
  if (outA <= 0) return
  const keep = (da * (1 - alpha)) / outA, put = alpha / outA
  dest[o] = r * put + dest[o] * keep + 0.5
  dest[o + 1] = g * put + dest[o + 1] * keep + 0.5
  dest[o + 2] = b * put + dest[o + 2] * keep + 0.5
  dest[o + 3] = outA * 255 + 0.5
}

/** 페이지 전체 크기(pageWidth 출력 픽셀 폭)로 찍은 층 layer 의 region 부분을 dest 위에 덮는다 */
export function blendLayer(dest, region, layer, pageWidth) {
  for (let y = 0; y < region.height; y++) {
    let s = ((region.y + y) * pageWidth + region.x) * 4, o = y * region.width * 4
    for (let x = 0; x < region.width; x++, s += 4, o += 4) {
      const alpha = layer[s + 3]
      if (alpha === 0) continue
      if (alpha === 255) { dest[o] = layer[s]; dest[o + 1] = layer[s + 1]; dest[o + 2] = layer[s + 2]; dest[o + 3] = 255; continue }
      blendPixel(dest, o, layer[s], layer[s + 1], layer[s + 2], alpha / 255)
    }
  }
}

/** 페이지 전체 크기 층에서 region 부분을 잘라 새 RGBA 로 */
export function cropLayer(layer, region, pageWidth) {
  const out = new Uint8Array(region.width * region.height * 4)
  for (let y = 0; y < region.height; y++) {
    const start = ((region.y + y) * pageWidth + region.x) * 4
    out.set(layer.subarray(start, start + region.width * 4), y * region.width * 4)
  }
  return out
}

/**
 * 장면 하나를 합친다: 바탕 층 → (GIF 장면 · 사이 층)… → 맨 위 층. 결과는 region 크기 RGBA(바탕이 불투명이라 불투명).
 * segments: planLayers 결과, layers: 찍은 층 픽셀(segments 의 층과 같은 순서, 안 찍은 층은 null),
 * frameOf(object): 이 장면에서 그 GIF 요소의 { frame, source }
 */
export function composeFrame({ segments, layers, region, pageWidth, ratio, frameOf }) {
  let layerIndex = 0, dest = null
  for (const segment of segments) {
    if (segment.kind === 'layer') {
      const pixels = layers[layerIndex++]
      if (!dest) { dest = cropLayer(pixels, region, pageWidth); continue }
      if (pixels) blendLayer(dest, region, pixels, pageWidth)
      continue
    }
    const { frame, source } = frameOf(segment.object)
    drawGifObject(dest, region, ratio, segment.object, frame, source)
  }
  return dest
}
