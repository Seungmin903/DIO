import test from 'node:test'
import assert from 'node:assert/strict'
import { TILE, evictTiles, hitsTile, pendingStrokes, planTiles, removedFrom, tilesBounds, removedStrokes, restClipRects, reusable, showsHad, staleImages, strokesInTile, tileBox, tileKey, tilesFor, pixelTileScale, tileScreenRect } from '../src/editor/skia/tileGrid.js'

// 획 하나: 왼쪽 위 (x, y) 에 w x h. reachOf 가 대각선 반지름 + 번짐 여유 8 을 붙인다.
const at = (id, x, y, w = 10, h = 10) => ({ id, x, y, w, h })

test('창을 덮는 타일만 고르고 페이지 밖으로는 안 나간다', () => {
  assert.equal(TILE, 256)
  // 창 (0,0,512,256) → 가로 두 칸 · 세로 한 칸
  assert.deepEqual(tilesFor({ x: 0, y: 0, w: 512, h: 256 }, 2000, 2000),
    [{ col: 0, row: 0 }, { col: 1, row: 0 }])
  // 칸 경계에 딱 맞으면 다음 칸을 끌어들이지 않는다(512 는 1번 칸의 끝이지 2번 칸의 시작이 아니다)
  assert.equal(tilesFor({ x: 0, y: 0, w: 512, h: 1 }, 2000, 2000).length, 2)
  // 창이 페이지를 넘어가면 페이지까지만
  assert.deepEqual(tilesFor({ x: 0, y: 0, w: 4000, h: 1 }, 300, 300), [{ col: 0, row: 0 }, { col: 1, row: 0 }])
  // 음수 쪽도 0 아래로는 안 간다
  assert.deepEqual(tilesFor({ x: -500, y: -500, w: 600, h: 600 }, 2000, 2000), [{ col: 0, row: 0 }])
})

test('타일에 닿는 획만 그 타일에 들어가고, 걸친 획은 양쪽 타일 모두에 들어간다', () => {
  // 창 방식은 걸친 획을 굽지 않고 벡터로 돌려야 했다(두 번 그리면 반투명 잉크가 진해져서).
  // 타일은 제 칸으로 잘라 그리므로 양쪽에 넣어도 픽셀은 한 장에만 속한다.
  const inside = at('a', 300, 300), straddling = at('b', 250, 300), far = at('c', 1500, 1500)
  const objects = [inside, straddling, far]
  assert.deepEqual(strokesInTile(objects, tileBox(1, 1)).map(o => o.id), ['a', 'b'])
  assert.deepEqual(strokesInTile(objects, tileBox(0, 1)).map(o => o.id), ['b'])
  assert.deepEqual(strokesInTile(objects, tileBox(5, 5)).map(o => o.id), ['c'])
  // 순서는 원래 목록 그대로여야 한다 — 겹치는 차례가 바뀌면 그림이 달라진다
  assert.deepEqual(strokesInTile([straddling, inside], tileBox(1, 1)).map(o => o.id), ['b', 'a'])
  assert.equal(hitsTile({ x: 0, y: 0, r: 1 }, tileBox(3, 3)), false)
})

test('타일은 들어간 획이 그대로일 때만 다시 쓰고, 바뀐 타일만 다시 굽는다', () => {
  const a = at('a', 10, 10), b = at('b', 300, 10), c = at('c', 20, 20)
  const win = { x: 0, y: 0, w: 512, h: 256 }
  const cache = new Map()
  // 처음에는 둘 다 구워야 한다
  let plan = planTiles([a, b], win, 2000, 2000, 2, cache)
  assert.equal(plan.fresh.length, 0)
  assert.deepEqual(plan.stale.map(t => `${t.col},${t.row}`), ['0,0', '1,0'])
  // 구운 셈 치고 넣는다
  for (const t of plan.stale) cache.set(tileKey(t.col, t.row, 2), { ...t, image: {}, px: 1 })
  // 아무것도 안 바뀌면 전부 그대로 쓴다 — 여기가 예전엔 '전부 다시 굽기'(실기 195획 417ms) 였다
  plan = planTiles([a, b], win, 2000, 2000, 2, cache)
  assert.equal(plan.stale.length, 0)
  assert.equal(plan.fresh.length, 2)
  // 왼쪽 타일에만 획을 더하면 **왼쪽만** 다시 굽는다
  plan = planTiles([a, b, c], win, 2000, 2000, 2, cache)
  assert.deepEqual(plan.stale.map(t => `${t.col},${t.row}`), ['0,0'])
  assert.equal(plan.fresh.length, 1)
  // 다시 굽기 전까지는 지난 그림(had)을 깔아 두고, **거기 없던 획만** 벡터로 얹는다
  assert.ok(plan.stale[0].had)
  assert.deepEqual(staleImages(plan.stale).length, 1)
  assert.deepEqual(pendingStrokes([a, b, c], plan.stale).map(o => o.id), ['c'])
  // 배율이 달라지면 다른 타일이다(열쇠에 배율이 들어간다)
  assert.equal(planTiles([a, b], win, 2000, 2000, 4, cache).stale.length, 2)
  // 획이 하나도 안 닿는 빈 칸은 아무 일도 안 한다
  const empty = planTiles([], win, 2000, 2000, 2, new Map())
  assert.equal(empty.stale.length, 0)
  assert.equal(empty.fresh.length, 0)
})

test('아직 타일에 안 들어간 획만 벡터로 돌린다 — 두 번 그리면 반투명 잉크가 진해진다', () => {
  const objects = [at('a', 10, 10), at('b', 300, 10), at('c', 600, 10), at('d', 900, 10)]
  const win = { x: 0, y: 0, w: 1024, h: 256 }
  const plan = planTiles(objects, win, 2000, 2000, 2, new Map())
  assert.equal(plan.stale.length, 4)
  // 구운 적이 없는 타일은 제 획을 전부 벡터로
  assert.deepEqual(pendingStrokes(objects, plan.stale).map(o => o.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(pendingStrokes(objects, []), [])
  // 한 획이 두 타일에 걸쳐도 한 번만 나온다
  const straddling = at('s', 250, 10)
  const two = planTiles([straddling], { x: 0, y: 0, w: 512, h: 256 }, 2000, 2000, 2, new Map())
  assert.equal(two.stale.length, 2)
  assert.deepEqual(pendingStrokes([straddling], two.stale).map(o => o.id), ['s'])
  // 지난 그림에 이미 든 획은 안 얹는다
  const had = { objects: [objects[0]], image: {} }
  assert.deepEqual(pendingStrokes(objects, [{ objects: [objects[0], objects[1]], had }]).map(o => o.id), ['b'])
})

test('타일 예산을 넘으면 가장 오래 안 쓴 것부터 버린다', () => {
  // 기기 메모리가 모자라 앱이 죽은 적이 있다(2026-11-10) — 상한이 꼭 있어야 한다.
  const cache = new Map()
  for (let i = 0; i < 5; i++) cache.set(`t${i}`, { px: 10, used: i, image: {} })
  const dropped = []
  assert.equal(evictTiles(cache, 30, tile => dropped.push(tile.used)), 2)
  assert.deepEqual(dropped, [0, 1])          // 오래된 것부터
  assert.deepEqual([...cache.keys()], ['t2', 't3', 't4'])
  // 예산 안이면 아무것도 안 버린다
  assert.equal(evictTiles(cache, 1000, () => { throw new Error('버리면 안 된다') }), 0)
})

test('지우기만 한 타일은 지난 그림을 깔고 지운 자리만 덧그림으로 비운다', () => {
  const a = at('a', 10, 10), b = at('b', 20, 20), c = at('c', 30, 30)
  // 덧붙기만 했으면 지난 그림을 깔고 새 획만 얹는다
  const added = { objects: [a, b, c], had: { objects: [a, b], image: {} } }
  assert.equal(reusable(added), true)
  assert.equal(removedFrom(added), null)
  assert.deepEqual(pendingStrokes([a, b, c], [added]).map(o => o.id), ['c'])
  // 가운데가 빠졌으면(지우개 · 되돌리기) 지난 그림은 그대로 쓰되 빠진 획을 덧그림이 맡는다.
  // 전에는 그 칸 획을 전부 벡터로 돌렸는데, 유리펜 50획짜리 타일이면 매 프레임 50개를 다시 만들었다.
  const erased = { objects: [a, c], had: { objects: [a, b, c], image: {} } }
  assert.equal(reusable(erased), false)
  assert.deepEqual(removedFrom(erased).map(o => o.id), ['b'])
  assert.equal(showsHad(erased), true)
  assert.equal(staleImages([erased]).length, 1)
  assert.deepEqual(pendingStrokes([a, b, c], [erased]), [])
  assert.deepEqual(removedStrokes([erased, added]).map(o => o.id), ['b'])
  // 차례가 바뀐 경우는 어느 쪽도 못 쓴다 - 전부 벡터로
  const reordered = { objects: [b, a], had: { objects: [a, b], image: {} } }
  assert.equal(reusable(reordered), false)
  assert.equal(removedFrom(reordered), null)
  assert.equal(showsHad(reordered), false)
  assert.deepEqual(staleImages([reordered]), [])
  assert.deepEqual(pendingStrokes([a, b], [reordered]).map(o => o.id), ['a', 'b'])
})

test('격자 색인으로 고른 결과가 전수 조사와 글자 하나까지 같다', () => {
  // 타일마다 전체 획을 훑던 것을 색인으로 바꿨다. 색인은 칸 단위라 실제보다 넉넉히 주고
  // 정확한 판정은 hitsTile 이 한다 — 그래도 **차례와 내용이 완전히 같아야** 그림이 안 바뀐다.
  let seed = 4242
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  const objects = []
  for (let i = 0; i < 400; i++) {
    const big = rnd() < 0.05                       // 페이지를 가로지르는 큰 획도 섞는다
    objects.push(at(`o${i}`, rnd() * 1800, rnd() * 1800, big ? 1500 : 4 + rnd() * 60, big ? 1500 : 4 + rnd() * 60))
  }
  const win = { x: 0, y: 0, w: 1024, h: 1024 }
  const plan = planTiles(objects, win, 2000, 2000, 2, new Map())
  // planTiles 가 각 칸에 넣은 획이, 전체를 훑어 고른 것과 같아야 한다
  for (const entry of plan.stale) {
    assert.deepEqual(entry.objects.map(o => o.id), strokesInTile(objects, tileBox(entry.col, entry.row)).map(o => o.id),
      `${entry.col},${entry.row}`)
  }
  // 칸이 하나뿐이면 색인을 안 쓰는데, 그때도 같아야 한다
  const one = planTiles(objects, { x: 0, y: 0, w: 256, h: 256 }, 2000, 2000, 2, new Map())
  assert.deepEqual(one.stale[0].objects.map(o => o.id), strokesInTile(objects, tileBox(0, 0)).map(o => o.id))
})

test('타일이 덮는 네모는 창보다 넓다 — 창으로 자르면 그 띠에서 바탕과 겹친다', () => {
  // 창은 160 격자, 타일은 256 칸이라 타일이 창 밖으로 최대 255 더 뻗는다.
  const win = { x: 640, y: 800, w: 800, h: 1120 }
  const covered = tilesBounds(win, 4000, 4000)
  assert.deepEqual(covered, { x: 512, y: 768, w: 1024, h: 1280 })
  assert.ok(covered.x <= win.x && covered.y <= win.y, '창을 다 품어야 한다')
  assert.ok(covered.x + covered.w >= win.x + win.w && covered.y + covered.h >= win.y + win.h)
  // 페이지 밖으로는 안 나가고, 덮을 칸이 없으면 null
  assert.deepEqual(tilesBounds({ x: 0, y: 0, w: 100, h: 100 }, 4000, 4000), { x: 0, y: 0, w: 256, h: 256 })
  assert.equal(tilesBounds({ x: 5000, y: 5000, w: 10, h: 10 }, 4000, 4000), null)
})

test('이번 렌더에 쓰는 타일은 예산을 넘겨도 버리지 않는다', () => {
  // 버리면 1초 뒤 그림이 풀리는데 아직 화면에 그리고 있어 빈 자리가 생긴다.
  const cache = new Map()
  for (let i = 0; i < 4; i++) cache.set(`t${i}`, { px: 10, used: i, image: {} })
  const dropped = []
  // 예산 10 이면 셋을 버려야 하지만, 오래된 둘이 화면에 쓰이는 중이면 건너뛴다
  evictTiles(cache, 10, tile => dropped.push(tile.used), new Set(['t0', 't1']))
  assert.deepEqual(dropped, [2, 3])
  assert.deepEqual([...cache.keys()], ['t0', 't1'])
  // 화면 타일만으로 예산을 넘으면 넘긴 채로 둔다(그리는 것이 먼저다)
  const only = new Map([['a', { px: 100, used: 1, image: {} }]])
  assert.equal(evictTiles(only, 10, () => { throw new Error('버리면 안 된다') }, new Set(['a'])), 0)
})

test('타일 굽기 배율은 한 칸이 정수 픽셀이 되게 맞추고, 화면 자리는 이웃과 같은 정수 픽셀에서 만난다', () => {
  // ¼옥타브 배율 그대로면 256 x 1.189 = 304.4 픽셀이라 그림이 칸 밖 한 줄을 가리킨다
  for (const scale of [1, 2 ** 0.25, 2 ** 0.5, 2 ** 0.75, 1.7, 3]) {
    const px = TILE * pixelTileScale(scale)
    assert.ok(Math.abs(px - Math.round(px)) < 1e-9, `${scale}: ${px}`)
    assert.ok(Math.abs(pixelTileScale(scale) - scale) <= 0.5 / TILE)
  }
  // 아주 작은 배율에서도 0 이 되지 않는다(한 칸 1픽셀)
  for (const scale of [0, 0.001, 0.5 / TILE - 1e-6]) assert.equal(pixelTileScale(scale), 1 / TILE, String(scale))
  // 경계 픽셀을 두 타일이 반씩 덮으면 반투명 잉크가 옅어져 1px 줄이 뜬다(실기 SM-X510 2026-11-11)
  for (const zoom of [0.37, 0.5, 1, 1.189, 2.3]) {
    for (let col = 0; col < 4; col++) for (let row = 0; row < 3; row++) {
      const here = tileScreenRect({ col, row }, zoom), right = tileScreenRect({ col: col + 1, row }, zoom), below = tileScreenRect({ col, row: row + 1 }, zoom)
      for (const value of Object.values(here)) assert.ok(Number.isInteger(value), `${zoom} ${col},${row}`)
      assert.equal(here.x + here.width, right.x, `${zoom} 가로 이음매`)
      assert.equal(here.y + here.height, below.y, `${zoom} 세로 이음매`)
    }
  }
  // 기기 픽셀비를 주면 **기기 픽셀**에 맞춘다. dp 로만 맞추면 PixelRatio 2.625 기기에서 경계가
  // 픽셀 한가운데에 떨어져, 벡터로 얹는 획을 자르는 자리와 반 픽셀 어긋난다(실기 2026-11-13).
  for (const dpr of [2, 2.625, 3]) {
    for (const zoom of [0.37, 1, 1.189]) {
      for (let col = 0; col < 4; col++) {
        const here = tileScreenRect({ col, row: 0 }, zoom, dpr), right = tileScreenRect({ col: col + 1, row: 0 }, zoom, dpr)
        const device = here.x * dpr
        assert.ok(Math.abs(device - Math.round(device)) < 1e-9, `${dpr} ${zoom} ${col}: ${device}`)
        // dp 값은 이제 정수가 아니라 나눗셈 결과라 더하면 1ulp 어긋날 수 있다 — **기기 픽셀 정수**로 견준다
        assert.equal(Math.round((here.x + here.width) * dpr), Math.round(right.x * dpr), `${dpr} ${zoom} 이음매`)
      }
    }
  }
})

test('벡터 획을 자를 자리: 못 구운 칸 + 타일이 덮지 않는 바깥', () => {
  // 자르지 않으면 이미 구운 타일에도 같은 획이 겹쳐 그려져 반투명 잉크가 두 번 올라간다.
  const W = 1000, H = 800
  const area = rects => rects.reduce((sum, r) => sum + r.w * r.h, 0)
  const covers = (rects, point) => rects.some(r => point.x >= r.x && point.x <= r.x + r.w && point.y >= r.y && point.y <= r.y + r.h)

  // 덮인 네모가 없으면 못 구운 칸만
  const only = restClipRects([{ x: 0, y: 0, w: 256, h: 256 }], null, W, H)
  assert.deepEqual(only, [{ x: 0, y: 0, w: 256, h: 256 }])

  // 바깥은 네 띠. 겹치지 않고, 넓이 합이 페이지 − 덮인 네모와 같아야 한다
  const covered = { x: 200, y: 100, w: 400, h: 300 }
  const outside = restClipRects([], covered, W, H)
  assert.equal(outside.length, 4)
  assert.equal(area(outside), W * H - covered.w * covered.h)
  assert.equal(covers(outside, { x: 400, y: 250 }), false, '덮인 안쪽은 자를 자리가 아니다')
  assert.equal(covers(outside, { x: 50, y: 250 }), true, '왼쪽 바깥은 자를 자리다')
  assert.equal(covers(outside, { x: 400, y: 50 }), true, '위쪽 바깥은 자를 자리다')

  // 페이지를 다 덮으면 바깥이 없다 — 못 구운 칸이 없으면 빈 배열(= 자르지 말라)
  assert.deepEqual(restClipRects([], { x: 0, y: 0, w: W, h: H }, W, H), [])
  assert.equal(restClipRects([{ x: 0, y: 0, w: 10, h: 10 }], { x: 0, y: 0, w: W, h: H }, W, H).length, 1)

  // 페이지 밖으로 튀어나온 덮임도 띠가 음수 크기로 생기지 않는다
  for (const r of restClipRects([], { x: -50, y: -50, w: W + 100, h: 200 }, W, H)) {
    assert.ok(r.w > 0 && r.h > 0, JSON.stringify(r))
  }
  // 넘겨준 것이 없어도 터지지 않는다
  assert.deepEqual(restClipRects(null, null, W, H), [])
})
