// 사진 표지의 대표 색: 작게 줄인 사진 픽셀(RGBA)에서 가장 많이 보이는 색 계열을 고른다.
// 채도가 있는 픽셀을 색상 12칸으로 나눠 (채도만큼 무게를 두고) 가장 무거운 칸의 평균색을 쓰고,
// 채도 있는 픽셀이 적은 사진(흑백 · 무채색)은 전체 평균색을 쓴다.
const BINS = 12

const hex = rgb => '#' + rgb.map(value => Math.round(value).toString(16).padStart(2, '0')).join('').toUpperCase()

export function photoTone(rgba) {
  const bins = Array.from({ length: BINS }, () => ({ weight: 0, sum: [0, 0, 0] }))
  const all = [0, 0, 0]
  let count = 0, colorful = 0
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2]
    all[0] += r; all[1] += g; all[2] += b; count += 1
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const saturation = max ? (max - min) / max : 0
    // 너무 어둡거나 밝은 픽셀 · 거의 회색인 픽셀은 색 계열을 정하는 데서 뺀다
    if (saturation < 0.18 || max < 40 || min > 235) continue
    let hue = max === r ? (g - b) / (max - min) : max === g ? 2 + (b - r) / (max - min) : 4 + (r - g) / (max - min)
    hue = (hue * 60 + 360) % 360
    const bin = bins[Math.floor(hue / (360 / BINS)) % BINS]
    bin.weight += saturation
    bin.sum[0] += r * saturation; bin.sum[1] += g * saturation; bin.sum[2] += b * saturation
    colorful += 1
  }
  if (!count) return null
  if (colorful < count * 0.12) return hex(all.map(value => value / count))
  const best = bins.reduce((top, bin) => bin.weight > top.weight ? bin : top)
  return hex(best.sum.map(value => value / best.weight))
}
