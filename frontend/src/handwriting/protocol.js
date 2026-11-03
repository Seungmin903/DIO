export const PROMPTS = [...'값같곬곶깎넋늪닫닭닻됩뗌략몃밟볘뺐뽈솩쐐앉않얘얾엌옳읊죡쮜춰츄퀭틔핀핥훟']
export const PREPROCESS_VERSION = 'dio-ink-safe90-margin4-fp32-v2'
export const MODEL_VERSION = 'dmfont-fp32-e5b28ca6-inference-v2'
export const SYLLABLE_COUNT = 11172
export const SAMPLE_TEXT = '안녕하세요 좋은 하루 되세요 나만의 손글씨'

export function jobMatchesModel(job, modelVersion = MODEL_VERSION) {
  return Boolean(job && job.modelVersion === modelVersion && job.preprocessVersion === PREPROCESS_VERSION)
}

export function componentAddresses(character) {
  const n = character.codePointAt(0) - 0xac00
  if (!Number.isInteger(n) || n < 0 || n >= SYLLABLE_COUNT) throw new Error('완성형 한글만 처리할 수 있어요.')
  return [Math.floor(n / 588), 19 + Math.floor(n / 28) % 21, 40 + n % 28]
}

export function validateSample(sample) {
  if (!sample || sample.coordinateSize !== 1024 || !Array.isArray(sample.strokes) || !sample.strokes.length || sample.strokes.length > 500) throw new Error('글자를 먼저 써 주세요.')
  let count = 0
  for (const stroke of sample.strokes) {
    if (!Number.isFinite(stroke.width) || stroke.width <= 0 || stroke.width > 100 || !Array.isArray(stroke.points) || !stroke.points.length) throw new Error('획 정보를 확인해 주세요.')
    for (const point of stroke.points) {
      if (++count > 50000 || !Number.isFinite(point.x) || !Number.isFinite(point.y) || point.x < 0 || point.x > 1024 || point.y < 0 || point.y > 1024) throw new Error('입력칸 안에 다시 써 주세요.')
      if (point.pressure != null && (!Number.isFinite(point.pressure) || point.pressure < 0 || point.pressure > 1)) throw new Error('필압 정보를 확인해 주세요.')
    }
  }
  return sample
}

// A deterministic 4x area rasterizer, shared by Expo Go and native inference.
// Guide letters never enter this function. Coordinates/widths are not overwritten.
export function rasterize(sample, { scale = 1, pivot = [64, 64], correction = [0, 0] } = {}) {
  validateSample(sample)
  const side = 512, bits = new Uint8Array(side * side)
  const point = p => [4 * (pivot[0] + ((p.x / 1024 + .04) * 128 / 1.08 - pivot[0]) * scale + correction[0]), 4 * (pivot[1] + ((p.y / 1024 + .04) * 128 / 1.08 - pivot[1]) * scale + correction[1])]
  for (const stroke of sample.strokes) {
    const radius = stroke.width / 1024 * 128 / 1.08 * scale * 2
    let previous = point(stroke.points[0])
    for (const p of stroke.points) {
      const next = point(p), dx = next[0] - previous[0], dy = next[1] - previous[1], norm = dx * dx + dy * dy
      const x0 = Math.max(0, Math.floor(Math.min(previous[0], next[0]) - radius)), x1 = Math.min(side - 1, Math.ceil(Math.max(previous[0], next[0]) + radius))
      const y0 = Math.max(0, Math.floor(Math.min(previous[1], next[1]) - radius)), y1 = Math.min(side - 1, Math.ceil(Math.max(previous[1], next[1]) + radius))
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const t = norm ? Math.max(0, Math.min(1, ((x + .5 - previous[0]) * dx + (y + .5 - previous[1]) * dy) / norm)) : 0
        if ((x + .5 - previous[0] - t * dx) ** 2 + (y + .5 - previous[1] - t * dy) ** 2 <= radius ** 2) bits[y * side + x] = 1
      }
      previous = next
    }
  }
  const pixels = new Uint8Array(128 * 128)
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    let ink = 0
    for (let yy = 0; yy < 4; yy++) for (let xx = 0; xx < 4; xx++) ink += bits[(y * 4 + yy) * side + x * 4 + xx]
    pixels[y * 128 + x] = Math.round(255 * (1 - ink / 16))
  }
  return pixels
}

export function inkGeometry(pixels) {
  let mass = 0, sx = 0, sy = 0, x0 = 128, y0 = 128, x1 = 0, y1 = 0
  for (let i = 0; i < pixels.length; i++) {
    const x = i % 128, y = Math.floor(i / 128), m = 255 - pixels[i]
    mass += m; sx += (x + .5) * m; sy += (y + .5) * m
    if (pixels[i] < 245) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x + 1); y1 = Math.max(y1, y + 1) }
  }
  if (!mass || x0 >= x1 || y0 >= y1) throw new Error('글씨가 너무 작거나 비어 있어요. 다시 써 주세요.')
  return { center: [sx / mass, sy / mass], bounds: [x0, y0, x1, y1], margin: Math.min(x0, y0, 128 - x1, 128 - y1) }
}

export function prepareSample(sample) {
  const original = rasterize(sample), geometry = inkGeometry(original), [cx, cy] = geometry.center, [x0, y0, x1, y1] = geometry.bounds
  const evaluate = scale => {
    let correction = [0, 0], best = null
    for (let i = 0; i < 12; i++) {
      const pixels = rasterize(sample, { scale, pivot: geometry.center, correction })
      let actual
      try { actual = inkGeometry(pixels) } catch { return null }
      const centerError = Math.hypot(cx - actual.center[0], cy - actual.center[1])
      if (!best || centerError < best.centerError) best = { pixels, actual, correction, centerError }
      if (centerError <= .2) return { pixels, actual, correction, centerError }
      if (actual.margin < 4) return null
      correction = [correction[0] + cx - actual.center[0], correction[1] + cy - actual.center[1]]
    }
    // Thin strokes can oscillate across raster cells. Search around the best
    // correction rather than accepting a drifting centroid or weakening tolerance.
    for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) {
      const correction = [best.correction[0] + x * .05, best.correction[1] + y * .05]
      const pixels = rasterize(sample, { scale, pivot: geometry.center, correction })
      const actual = inkGeometry(pixels), centerError = Math.hypot(cx - actual.center[0], cy - actual.center[1])
      if (actual.margin >= 4 && centerError <= .2) return { pixels, actual, correction, centerError }
    }
    return null
  }
  const safeResult = result => result && result.actual.margin >= 4
  // Raster-check the maximum safe scale; every reference uses the same 90% policy.
  // Bounds give a starting bracket, not a target size or an absolute scale cap.
  let low = Math.min(1, (cx - 4) / (cx - x0), (124 - cx) / (x1 - cx), (cy - 4) / (cy - y0), (124 - cy) / (y1 - cy))
  if (!(low > 0)) throw new Error('글씨가 가장자리에 너무 가까워요. 입력칸 안쪽에 다시 써 주세요.')
  let found = false
  for (let i = 0; i < 20; i++) {
    if (safeResult(evaluate(low))) { found = true; break }
    low *= .8
  }
  if (!found) throw new Error('잘리지 않는 입력 크기를 정하지 못했어요. 다시 써 주세요.')
  let high = low * 2
  for (let i = 0; safeResult(evaluate(high)); i++) {
    if (i >= 20) throw new Error('입력 크기를 확인하지 못했어요. 다시 써 주세요.')
    low = high; high *= 2
  }
  for (let i = 0; i < 14; i++) {
    const mid = (low + high) / 2
    if (safeResult(evaluate(mid))) low = mid
    else high = mid
  }
  const maximumSafeScale = low
  let scale = maximumSafeScale * .9, result = evaluate(scale)
  // Quantization can affect the last pixel of margin even at a smaller scale.
  for (let i = 0; i < 12 && !safeResult(result); i++) { scale *= .99; result = evaluate(scale) }
  if (!safeResult(result)) throw new Error('잘리지 않는 입력 크기를 정하지 못했어요. 다시 써 주세요.')
  return { original, pixels: result.pixels, metadata: { version: PREPROCESS_VERSION, scale, maximumSafeScale, safetyFraction: .9, pivot: geometry.center, correction: result.correction, bounds: result.actual.bounds, margin: result.actual.margin, centerError: result.centerError } }
}

export function validateDraft(draft, complete = false) {
  if (!draft || draft.schema !== 1 || typeof draft.id !== 'string' || !draft.samples || typeof draft.samples !== 'object') throw new Error('DIO 손글씨 초안 파일이 아니에요.')
  for (const [character, sample] of Object.entries(draft.samples)) {
    if (!PROMPTS.includes(character)) throw new Error('안내 목록과 다른 글자가 있어요.')
    validateSample(sample)
  }
  if (complete && PROMPTS.some(c => !draft.samples[c])) throw new Error('36자를 모두 작성해 주세요.')
  return draft
}
