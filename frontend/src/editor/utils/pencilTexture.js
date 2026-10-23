// 흑연 입자와 종이 결은 모듈을 불러올 때 한 번만 만든다. 필기 중에 다시 만들지 않는다.
// 무늬 경로는 연필 획마다 복사되므로 좌표를 10배 정수로 적어 문자열을 줄인다.
export const GRAPHITE_TILE_SIZE = 24
const SCALE = 10
export const GRAPHITE_VIEWBOX = GRAPHITE_TILE_SIZE * SCALE
const noise = (i) => {
  const value = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return value - Math.floor(value)
}
const q = value => Math.round(value * SCALE)
// 절대 좌표를 먼저 반올림한 뒤 차이를 적어 상대 좌표 오차가 쌓이지 않게 한다.
function relative(points) {
  const [first, ...rest] = points.map(([x, y]) => [q(x), q(y)])
  let [px, py] = first
  const steps = rest.map(([x, y]) => { const step = `${x - px} ${y - py}`; px = x; py = y; return step })
  return `M${first[0]} ${first[1]}l${steps.join(' ')}`.replace(/ -/g, '-')
}
function particles(side, seed, radius) {
  const cell = GRAPHITE_TILE_SIZE / side
  return Array.from({ length: side * side }, (_, i) => {
    const r = radius * (0.5 + noise(seed + i) * 0.8)
    const x = (i % side + 0.2 + noise(seed + i + 311) * 0.6) * cell
    const y = (Math.floor(i / side) + 0.2 + noise(seed + i + 617) * 0.6) * cell
    return relative([[x - r, y], [x - r * 0.2, y - r * 0.65], [x + r * 1.1, y - r * 0.4], [x + r * 0.75, y + r * 0.55], [x - r * 0.25, y + r * 0.75]]) + 'Z'
  }).join('')
}
// 화면에서 1px보다 작던 미세 가루층은 경로 대신 바탕 농도로 표현한다.
export const GRAPHITE_GRAINS = particles(25, 1231, 0.44)
export const GRAPHITE_FIBERS = Array.from({ length: 110 }, (_, i) => {
  const x = 1 + noise(i + 2301) * 20, y = 2 + noise(i + 2501) * 20
  return relative([[x, y], [x + 0.8 + noise(i + 2701) * 1.8, y - 0.3 - noise(i + 2901) * 0.7]])
}).join('')
export function pencilTextureSettings(width) {
  return {
    // 굵은 연필을 골라도 종이 결은 곱게 유지한다.
    tileSize: 12,
    // 빠진 미세 가루층(덮는 면적 약 31%, 불투명도 0.58)을 합친 바탕 농도다.
    baseOpacity: width <= 2 ? 0.38 : 0.26,
  }
}
