// 넓은 범위에서 "이 상자에 닿는 것만" 빠르게 고르는 격자 색인.
//
// 왜 필요한가(2026-11-10 조사):
// - 지우개는 입력 한 번마다 **모든 획**을 돌았다(`eraser.js` 의 `for (const target of targets)`).
//   상자 겹침으로 일찍 거르지만, 획 300개면 입력 한 번에 300번이고 펜은 초당 백 번 넘게 들어온다.
// - 굽기도 **타일마다 모든 획**을 훑었다(`tileGrid.strokesInTile`). 타일 12장이면 12 x 획수다.
// 다른 구현들은 같은 색인으로 지우개가 훑는 획을 10,000 → 63 까지 줄였다(Vellum PR #23).
//
// 아주 큰 것(페이지를 가로지르는 획)은 칸을 수백 개 차지해 색인이 오히려 손해다 — 그런 것만
// 따로 모아 두고 모든 물음에 함께 돌려준다.
export const INDEX_CELL = 256
const BIG_CELLS = 24

const cellRange = (box, cell) => ({
  c0: Math.floor(box.left / cell), c1: Math.floor(box.right / cell),
  r0: Math.floor(box.top / cell), r1: Math.floor(box.bottom / cell),
})

/**
 * items: 색인할 것들. boundsOf(item) → { left, right, top, bottom }(페이지 좌표).
 * 차례는 보존한다 — 겹치는 차례가 바뀌면 그림이 달라진다.
 */
export function createBoxIndex(items, boundsOf, cell = INDEX_CELL) {
  const grid = new Map(), big = []
  items.forEach((item, i) => {
    const box = boundsOf(item)
    if (!box || !Number.isFinite(box.left) || !Number.isFinite(box.top)
      || !Number.isFinite(box.right) || !Number.isFinite(box.bottom)) { big.push(i); return }
    const { c0, c1, r0, r1 } = cellRange(box, cell)
    if ((c1 - c0 + 1) * (r1 - r0 + 1) > BIG_CELLS) { big.push(i); return }
    for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
      const key = `${col}|${row}`
      let bucket = grid.get(key)
      if (!bucket) grid.set(key, bucket = [])
      bucket.push(i)
    }
  })
  return { grid, big, items, cell }
}

/** 상자에 닿을 수 있는 것들을 **원래 차례대로** 돌려준다(칸 단위라 실제보다 넉넉하다 — 정확한 판정은 부르는 쪽에서) */
export function queryBoxIndex(index, box) {
  const { c0, c1, r0, r1 } = cellRange(box, index.cell)
  const seen = new Set(index.big)
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) {
    const bucket = index.grid.get(`${col}|${row}`)
    if (bucket) for (const i of bucket) seen.add(i)
  }
  if (!seen.size) return []
  return [...seen].sort((a, b) => a - b).map(i => index.items[i])
}
