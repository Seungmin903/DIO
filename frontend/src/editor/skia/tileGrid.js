// 완성 획을 **타일 격자**로 굽는다. 2026-11-10 까지는 보이는 범위만 한 그림으로 구웠는데,
// 한 장이라 **무엇 하나라도 어긋나면 전부 다시** 그려야 했다(배율 눈금이 바뀜 · 창이 밀림 · 획이 지워짐).
// 실기(SM-X510)에서 195획 417ms · 123획 589ms 가 그렇게 나왔고, 그중 GPU 읽어오기는 19ms 뿐이라
// 나머지는 전부 **다시 래스터화하는** 값이었다.
//
// 타일이면 바뀐 자리에 닿는 타일만 다시 굽는다. 그림 잘 그리는 앱들이 쓰는 방식과 같다
// (조사 2026-11-10: Vellum·sanenotes·ink-notes·notate 모두 256px 타일 + 옥타브 버킷 + LRU).
//
// 창 방식과 **결정적으로 다른 점**: 창은 테두리에 걸친 획을 굽지 않고 벡터로 돌려야 했다(구우면서
// 벡터로도 그리면 반투명 잉크가 두 번 곱해진다). 타일은 **자기 칸으로 잘라서** 그리므로 한 획이
// 이웃 타일 여러 장에 들어가도 픽셀은 정확히 한 장에만 속한다 — 걸친 획을 따로 뺄 필요가 없다.
import { reachOf, removedBetween } from './bakeDelta.js'
import { createBoxIndex, queryBoxIndex } from '../utils/boxIndex.js'

// 타일 한 장이 덮는 **페이지** 넓이. 굽는 픽셀은 여기에 배율을 곱한 값이다.
export const TILE = 256

export const tileBox = (col, row) => ({ x: col * TILE, y: row * TILE, w: TILE, h: TILE })
export const tileKey = (col, row, scale) => `${col}|${row}|${scale}`

/** 창을 덮는 타일 좌표들(왼쪽 위부터). 페이지 밖으로는 안 나간다. */
export function tilesFor(win, width, height) {
  const c0 = Math.max(0, Math.floor(win.x / TILE)), r0 = Math.max(0, Math.floor(win.y / TILE))
  const c1 = Math.floor((Math.min(width, win.x + win.w) - 1e-6) / TILE)
  const r1 = Math.floor((Math.min(height, win.y + win.h) - 1e-6) / TILE)
  const out = []
  for (let row = r0; row <= r1; row++) for (let col = c0; col <= c1; col++) out.push({ col, row })
  return out
}

/** 획이 칠한 범위가 타일 칸에 닿나 */
/** 획이 칠한 범위를 상자로 — 격자 색인이 쓰는 모양 */
const boundsOfReach = (object) => { const a = reachOf(object); return { left: a.x - a.r, right: a.x + a.r, top: a.y - a.r, bottom: a.y + a.r } }

export const hitsTile = (a, box) =>
  a.x + a.r > box.x && a.y + a.r > box.y && a.x - a.r < box.x + box.w && a.y - a.r < box.y + box.h

/** 타일 한 장에 그릴 획들(원래 순서 그대로 — 겹치는 차례가 바뀌면 안 된다) */
export const strokesInTile = (objects, box) => objects.filter(object => hitsTile(reachOf(object), box))

/** 구워 둔 타일을 그대로 쓸 수 있나: 같은 획들이 같은 차례로 들어가 있어야 한다 */
export const tileFresh = (tile, objects) =>
  Boolean(tile) && tile.objects.length === objects.length && tile.objects.every((object, i) => object === objects[i])

/**
 * 지금 창에 필요한 타일을 훑어, 그대로 쓸 것(fresh)과 다시 구울 것(stale)으로 가른다.
 * stale 에는 **지난 번에 구워 둔 그림(had)** 을 같이 들려 보낸다 — 다시 굽기 전까지는 그걸 깔아 두고
 * 모자란 획만 벡터로 얹으면, 지우거나 쓰는 중에도 화면이 비지 않는다.
 */
export function planTiles(objects, win, width, height, scale, cache) {
  const fresh = [], stale = []
  const cells = tilesFor(win, width, height)
  // 타일마다 전체 획을 훑으면 타일 12장 x 획 300개가 된다 — 격자 색인으로 닿을 수 있는 것만 고른다.
  // 색인 칸을 타일과 같은 크기로 두어 물음 하나가 칸 하나에 맞는다. 차례는 색인이 지켜 준다.
  const index = cells.length > 1 ? createBoxIndex(objects, boundsOfReach, TILE) : null
  for (const { col, row } of cells) {
    const box = tileBox(col, row)
    const near = index ? queryBoxIndex(index, { left: box.x, top: box.y, right: box.x + box.w, bottom: box.y + box.h }) : objects
    const mine = strokesInTile(near, box)
    const tile = cache.get(tileKey(col, row, scale))
    if (tileFresh(tile, mine)) { if (tile.image) fresh.push(tile); continue }
    if (!mine.length && !tile) continue                       // 빈 칸은 구울 것도 없다
    stale.push({ col, row, box, scale, objects: mine, had: tile ?? null })
  }
  return { fresh, stale }
}

/**
 * 다시 굽기 전까지 지난 그림(had)을 그대로 깔아도 되나.
 * **덧붙기만** 했을 때만 된다. 차례가 바뀐 경우는 못 쓴다 — 겹치는 차례가 달라지면 그림이 달라진다.
 */
export const reusable = tile => Boolean(tile.had?.image)
  && tile.objects.length >= tile.had.objects.length
  && tile.had.objects.every((object, i) => object === tile.objects[i])

/**
 * 지난 그림에서 **획이 빠지기만** 했으면 빠진 획들을 돌려준다(아니면 null).
 * 지우개 · 되돌리기가 여기다. 지난 그림을 그대로 깔면 지운 획이 남아 보이지만, 그렇다고 그 타일 획을
 * 전부 벡터로 돌리면 유리펜 50획짜리 타일에서 매 프레임 50개를 다시 만든다(실기에서 타일 한 장 굽는 데만
 * 67~126ms 인 획들이다). 그래서 지난 그림을 깔되 **지운 자리만 덧그림으로 비운다**.
 */
export const removedFrom = tile => tile.had?.image ? removedBetween(tile.had.objects, tile.objects) : null

/** 지난 그림을 깔 수 있는 타일(덧붙기만 했거나, 지우기만 했거나) */
export const showsHad = tile => reusable(tile) || Boolean(removedFrom(tile))

/** 지우기만 한 타일들에서 빠진 획을 모은다 — 덧그림으로 그 자리를 비운다 */
export function removedStrokes(stale) {
  const out = []
  for (const tile of stale) for (const object of removedFrom(tile) ?? []) if (!out.includes(object)) out.push(object)
  return out
}

/**
 * 아직 타일에 안 들어간 획 = 이번 프레임에 벡터로 그려야 할 것.
 * 지난 그림을 깔 수 있으면 **거기 없던 획만** 얹는다 — 다 얹으면 같은 획이 두 번 그려져
 * 반투명 잉크(형광펜)가 그 자리만 진해진다. 한 획이 여러 타일에 걸쳐도 한 번만 나오고,
 * 차례는 원래 목록 그대로다(겹치는 차례가 바뀌면 그림이 달라진다).
 */
export function pendingStrokes(objects, stale) {
  if (!stale.length) return []
  const need = new Set()
  for (const tile of stale) {
    if (removedFrom(tile)) continue              // 지우기만 한 칸은 덧그림이 맡는다
    const from = reusable(tile) ? tile.had.objects.length : 0
    for (let i = from; i < tile.objects.length; i++) need.add(tile.objects[i])
  }
  return objects.filter(object => need.has(object))
}

/** 다시 굽기 전까지 깔아 둘 지난 그림들 */
export const staleImages = stale => stale.filter(showsHad).map(tile => tile.had)

/**
 * LRU: 예산(픽셀 수)을 넘으면 **가장 오래 안 쓴** 타일부터 버린다.
 * 버린 타일은 따로 보관하지 않는다 — 필요하면 벡터에서 다시 굽는다.
 * 기기 메모리가 모자라 앱이 죽은 적이 있어서(2026-11-10, 7.83GB 중 5.87GB 사용) 상한은 꼭 있어야 한다.
 */
export function evictTiles(cache, budgetPx, dispose) {
  let used = 0
  for (const tile of cache.values()) used += tile.px ?? 0
  if (used <= budgetPx) return 0
  const order = [...cache.entries()].sort((a, b) => (a[1].used ?? 0) - (b[1].used ?? 0))
  let dropped = 0
  for (const [key, tile] of order) {
    if (used <= budgetPx) break
    cache.delete(key)
    used -= tile.px ?? 0
    dropped++
    dispose?.(tile)
  }
  return dropped
}
