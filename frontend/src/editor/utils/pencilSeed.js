// 연필 획 시드: 획 첫 점 좌표의 해시 0~1(무작위 아님). 쓰는 중 · 뗀 뒤 · 지우개 조각이 같은 값을 쓰도록 획을 만들 때 grainOrigin.seed 로 저장한다.
// strokes.js 와 pencilBrush.js 가 함께 쓰며, 순환 참조를 피하려고 따로 둔다.
export const seedHash = n => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v) }
export const brushSeed = p => Number.isFinite(p?.seed) ? p.seed : p && Number.isFinite(p.x) && Number.isFinite(p.y) ? seedHash(Math.round(p.x * 10) * 7.31 + Math.round(p.y * 10) * 3.17) : 0
