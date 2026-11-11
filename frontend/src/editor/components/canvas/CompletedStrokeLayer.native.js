import { memo, useContext, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import { PixelRatio } from 'react-native'
import { BlendMode, Canvas, ClipOp, Group, Image, Picture, Skia } from '@shopify/react-native-skia'
import { nowMs, PENCIL_PROFILE, previewPicture, recordProfile, strokesPicture } from '../../skia/strokeSkia.js'
import { liveStroke } from '../../skia/liveStroke.js'
import { bakeWindow, coversPage, keepScale, keepWindow, reachOf, reachTouches, sameObjects, stepUpScale } from '../../skia/bakeDelta.js'
import { TILE, evictTiles, pendingStrokes, planTiles, removedFrom, removedStrokes, reusable, staleImages, tileKey, tilesBounds } from '../../skia/tileGrid.js'
import { ViewportMotion } from './viewportMotion'

const DRAG_OPACITY = 0.5

// 앱: 다 그린 획을 그리기 앱처럼 Skia 캔버스에 그린다(웹 · 테스트는 CompletedStrokeLayer.js 의 SVG 묶음).
// 원래 레이어 순서대로 이어진 획을 페이지 크기 캔버스 하나에 그리고, 사진 · 글자가 끼면 그 자리에서 캔버스를 나눈다.
// 쓰는 중인 획(live)도 맨 위 캔버스에 같은 그리기 함수로 얹는다: 펜을 떼면 같은 캔버스 안에서 한 번에 바뀌어
// 깜박이지 않고(캔버스가 둘이면 한 프레임 어긋났다) 픽셀도 그대로다.
// fade: 끌어 옮기는 중인 획 id 목록(반투명). 옮기는 동안에도 같은 캔버스에 그려 연필 결이 SVG 로 바뀌지 않는다.
const Run = memo(function Run({ objects, width, height, zoom, fade }) {
  const strokes = useMemo(() => strokesPicture(objects, object => fade?.includes(object.id) ? DRAG_OPACITY : 1, zoom * PixelRatio.get()), [objects, fade, zoom])
  return <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: width * zoom, height: height * zoom }}>
    <Group transform={[{ scale: zoom }]}>
      <Picture picture={strokes} />
    </Group>
  </Canvas>
})

// 맨 위 묶음은 쓰는 동안 펜이 움직일 때마다 다시 그려진다. 다 그린 획을 매번 다시 그리면(연필 도장 수만 개) 화면이 10fps 로 떨어져
// 펜 이벤트가 뭉쳐 들어왔다(획당 점 4~13개, 2026-11-02 실측) → 다 그린 획은 화면 해상도 그림 한 장으로 구워 두고 그 위에 쓰는 중인 획만 그린다.
// 새 획이 끝에 붙기만 했으면 이전 그림 위에 그 획만 더 굽는다. 옮기는 중(fade)은 매 프레임 바뀌므로 굽지 않고 그림(Picture)으로 그린다.
// previous: 같은 배율로 objects 의 앞부분을 구운 그림(없으면 처음부터)
// 굽는 표면은 하나를 계속 쓴다: 획마다 만들면 화면 크기 GPU 텍스처(태블릿 14MB)가 풀리지 않고 쌓여 획 수백 개면 앱이 메모리 부족으로 죽었다(2026-11-03 실측 획당 +12MB)
// 크기가 바뀌어도 새로 만들지 않고 키우기만 한다: 패널을 여닫거나 확대할 때마다 만들면 같은 이유로 쌓였다(2026-11-03 실측 여닫을 때마다 +12MB)
const SURFACE_STEP = 256
const stepUp = size => Math.ceil(size / SURFACE_STEP) * SURFACE_STEP
let pool = null, poolUsers = 0
// 굽는 표면은 GPU 메모리를 크게 먹는다(확대 3배 페이지면 4236x5648 = 96MB). 화면에 굽는 층이
// 하나도 없으면(편집기를 닫음) 들고 있을 이유가 없다 — 2026-11-10 실기에서 GL 메모리가 4.4GB 까지
// 올라가 기기가 메모리 부족으로 화면을 재웠다(남은 메모리 0.6GB / 전체 7.9GB).
export function holdBakeSurface() {
  poolUsers += 1
  return () => { if (--poolUsers <= 0) { pool?.surface.dispose?.(); pool = null; poolUsers = 0 } }
}
function bakeSurface(width, height) {
  if (pool && pool.width >= width && pool.height >= height) {
    // 확대를 되돌려 훨씬 작아졌으면 큰 표면을 붙들고 있지 않는다(네 배 넘게 크면 다시 만든다)
    if (pool.width * pool.height <= 4 * stepUp(width) * stepUp(height)) return pool
  }
  const w = stepUp(Math.max(width, pool && pool.width * pool.height <= 4 * stepUp(width) * stepUp(height) ? pool.width : 0))
  const h = stepUp(Math.max(height, pool && pool.width * pool.height <= 4 * stepUp(width) * stepUp(height) ? pool.height : 0))
  pool?.surface.dispose?.()
  const surface = Skia.Surface.MakeOffscreen(w, h)
  return (pool = surface ? { surface, width: w, height: h, content: null } : null)
}
// 한 칸(페이지 좌표 box)을 구워 그림 하나로 만든다. 타일도 창 밖 바탕도 이 길을 쓴다.
// 칸 **밖은 자른다**: 한 획이 이웃 타일에도 들어가므로, 자르지 않으면 같은 자리가 두 번 그려져
// 반투명 잉크(형광펜)가 진해진다.
function bakeRegion(objects, box, scale, label, base) {
  const pixelWidth = Math.ceil(box.w * scale), pixelHeight = Math.ceil(box.h * scale)
  const target = bakeSurface(pixelWidth, pixelHeight)
  if (!target) return null
  const t0 = PENCIL_PROFILE.on ? nowMs() : 0
  const canvas = target.surface.getCanvas()
  canvas.clear(Float32Array.of(0, 0, 0, 0))
  // 덧붙기만 했으면 지난 그림 위에 **새 획만** 더 그린다. 값은 픽셀이 아니라 **획**에 달렸다
  // (실측 2026-11-10 실기: 512x512 타일인데 유리펜 32획에 153ms — 획당 4.8ms).
  if (base) canvas.drawImage(base, 0, 0)
  canvas.save()
  canvas.scale(scale, scale)
  canvas.translate(-box.x, -box.y)
  canvas.clipRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), ClipOp.Intersect, false)
  canvas.drawPicture(strokesPicture(objects, undefined, scale))
  canvas.restore()
  target.surface.flush()
  const snapshot = target.surface.makeImageSnapshot(Skia.XYWHRect(0, 0, pixelWidth, pixelHeight))
  // 표면은 돌려 쓰므로 **떼어낸** 그림이어야 한다(그림은 나중에 래스터화되는데 그때 표면은 이미 다른 내용이다)
  const image = snapshot.makeNonTextureImage()
  snapshot.dispose?.()
  target.content = null
  if (t0) { recordProfile(label, nowMs() - t0)
    console.log(`[굽기] ${label} ms=${(nowMs() - t0).toFixed(1)} 획=${objects.length} ${pixelWidth}x${pixelHeight} ${kindTally(objects)}`) }
  return image ? { image, px: pixelWidth * pixelHeight } : null
}
// 지우개 · 되돌리기: 타일을 다시 굽기 전까지는 **지운 자리만 비우고** 그 자리에 걸친 남은 획만
// 덧그린다. 그 칸 획을 전부 벡터로 돌리면 유리펜 50획짜리 타일에서 매 프레임 50개를 다시 만든다.
const clearPaint = Skia.Paint()
clearPaint.setBlendMode(BlendMode.Clear)
// 안티에일리어스를 **꺼야 한다**. Skia.Paint() 는 이 바인딩에서 기본이 켜짐이라(JsiSkPaint: SkPaint 만든 뒤
// setAntiAlias(true)), 지우는 상자의 가장자리가 픽셀 중간에 걸리면 그 한 줄만 **부분적으로** 지워진다.
// 상자는 페이지 좌표라 화면 픽셀에 딱 안 맞는 일이 흔하다 → 구운 그림의 알파가 그 줄에서만 깎이고,
// 종이가 비쳐 **잉크를 가로지르는 옅은 한 줄**이 생긴다(사용자 2026-11-10 "지울 때 네모난 흰 선").
clearPaint.setAntiAlias(false)
function patchPicture(removed, objects, scale) {
  const recorder = Skia.PictureRecorder(), canvas = recorder.beginRecording()
  const reaches = objects.map(reachOf)
  for (const object of removed) {
    const area = reachOf(object), box = Skia.XYWHRect(area.x - area.r, area.y - area.r, area.r * 2, area.r * 2)
    canvas.save()
    canvas.clipRect(box, ClipOp.Intersect, false)
    // canvas.clear 는 클립을 무시하고 표면 전체를 지운다(2026-11-03 실기) → 지우기 블렌드로 그 자리만 비운다
    canvas.drawRect(box, clearPaint)
    const touching = objects.filter((_, i) => reachTouches(reaches[i], area))
    if (touching.length) canvas.drawPicture(strokesPicture(touching, undefined, scale))
    canvas.restore()
  }
  return recorder.finishRecordingAsPicture()
}
// 지우기만 한 타일: 통째로 다시 굽지 않고 **지운 자리만 도려낸다**. 그 칸에 유리펜 50획이 있어도
// 값은 지운 획 수에 달린다(실측 2026-11-10: 통째로 다시 굽기 67~213ms).
function cutTile(entry, scale, clock, gone) {
  const box = entry.box
  const pixelWidth = Math.ceil(box.w * scale), pixelHeight = Math.ceil(box.h * scale)
  const target = bakeSurface(pixelWidth, pixelHeight)
  if (!target) return null
  const t0 = PENCIL_PROFILE.on ? nowMs() : 0
  const canvas = target.surface.getCanvas()
  canvas.clear(Float32Array.of(0, 0, 0, 0))
  canvas.drawImage(entry.had.image, 0, 0)
  const reaches = entry.objects.map(reachOf)
  canvas.save()
  canvas.scale(scale, scale)
  canvas.translate(-box.x, -box.y)
  canvas.clipRect(Skia.XYWHRect(box.x, box.y, box.w, box.h), ClipOp.Intersect, false)
  for (const object of gone) {
    const area = reachOf(object)
    const rect = Skia.XYWHRect(area.x - area.r, area.y - area.r, area.r * 2, area.r * 2)
    canvas.save()
    canvas.clipRect(rect, ClipOp.Intersect, false)
    // canvas.clear 는 클립을 무시하고 표면 전체를 지운다(2026-11-03 실기) → 지우기 블렌드로 그 자리만 비운다
    canvas.drawRect(rect, clearPaint)
    const touching = entry.objects.filter((_, i) => reachTouches(reaches[i], area))
    if (touching.length) canvas.drawPicture(strokesPicture(touching, undefined, scale))
    canvas.restore()
  }
  canvas.restore()
  target.surface.flush()
  const snapshot = target.surface.makeImageSnapshot(Skia.XYWHRect(0, 0, pixelWidth, pixelHeight))
  const image = snapshot.makeNonTextureImage()
  snapshot.dispose?.()
  target.content = null
  if (t0) { recordProfile('CUT', nowMs() - t0)
    console.log(`[굽기] CUT ms=${(nowMs() - t0).toFixed(1)} 지운획=${gone.length} 남은획=${entry.objects.length} ${pixelWidth}x${pixelHeight}`) }
  return image && { col: entry.col, row: entry.row, scale, objects: entry.objects, image, px: pixelWidth * pixelHeight, used: clock }
}
// 타일 한 장. 덧붙기만 했으면 지난 그림에 이어 굽고, 지우기만 했으면 지운 자리만 도려낸다.
function bakeTile(entry, scale, clock) {
  const gone = removedFrom(entry)
  if (gone) return cutTile(entry, scale, clock, gone)
  const base = reusable(entry) ? entry.had : null
  const fresh = base ? entry.objects.slice(base.objects.length) : entry.objects
  const made = bakeRegion(fresh, entry.box, scale, base ? 'TILE+' : 'TILE', base?.image)
  return made && { col: entry.col, row: entry.row, scale, objects: entry.objects, image: made.image, px: made.px, used: clock }
}
// 다시 그리는 획을 펜 종류별로 센다 — 값이 획 **수**가 아니라 **어떤 펜이냐**에 달렸다(실측 2026-11-10:
// 점선 0.5ms · 연필 0.65ms · 유리펜 3.9ms 가 획 하나를 구워 넣는 값이다).
function kindTally(objects) {
  const by = {}
  for (const object of objects) { const k = object.penKind ?? '?'; by[k] = (by[k] ?? 0) + 1 }
  return Object.entries(by).map(([k, n]) => `${k}:${n}`).join(' ')
}
const release = baked => { if (baked) setTimeout(() => baked.image.dispose?.(), 1000) }
const SETTLE_MS = 400
// 굽는 그림의 픽셀 상한(안전망). 2026-11-10 까지는 **페이지 전체를 확대 배율로** 구워서 확대 3배면
// 4236x5648 = 2400만 px 가 되고 한 번에 300~1800ms 가 걸렸다(화면에 보이는 건 그중 14%인데도).
// 이제는 **보이는 범위(창)만** 굽기 때문에 창이 화면만 해져 이 상한에 거의 안 걸린다 —
// 그래서 확대해도 구운 획을 늘려 쓰지 않고 화면 픽셀 1:1 로 또렷하다.
const MAX_BAKE_PX = 12e6
const bakeScaleOf = (scale, width, height) => Math.min(stepUpScale(scale), Math.sqrt(MAX_BAKE_PX / Math.max(1, width * height)))
// 굽는 창(bakeWindow) · 타일 가르기(planTiles)는 bakeDelta.js · tileGrid.js 의 순수 함수다.
// 창 **밖** 바탕: 손가락으로 밀거나 확대하는 동안 Viewport 는 캔버스를 다시 그리지 않고 transform 으로만
// 옮긴다(손을 떼야 한 번 확정한다). 그래서 창 밖으로 밀면 새로 드러난 자리가 손을 뗄 때까지 **비어** 보인다.
// → 페이지 전체를 **낮은 해상도로** 한 장 구워 창 밖에만 깔아 둔다. 창 안쪽은 또렷한 그림이 덮으므로
// 흐릿함은 미는 동안에만 보이고, 손을 떼면 창이 옮겨 가 다시 또렷해진다.
// 획이 바뀌어 멈췄을 때만 다시 굽는다 — 밀기 · 확대는 늘려 쓰기만 하므로 굽는 값이 늘지 않는다.
const WIDE_MAX_PX = 3e6
// 한 번에 굽는 타일 수. 한 프레임에 다 구우면 그게 예전의 '전부 다시 굽기'(실기 195획 417ms)다.
// 못 구운 칸은 지난 그림 + 벡터로 메우고, 멈춤 시계가 다시 울려 이어서 굽는다.
// 개수가 아니라 **시간**으로 묶는다. 타일 한 장 값은 펜에 따라 50배까지 갈린다(실측 2026-11-10:
// 형광펜 1획 2~5ms · 유리펜 50획 67~126ms). 개수로 묶으면 싼 페이지는 쓸데없이 여러 번에 나눠 굽느라
// 또렷해지는 게 늦고(페이지를 넘기면 타일 12장에 최소 360ms), 비싼 페이지는 한 번에 너무 오래 막힌다.
// 한 장은 반드시 굽고, 예산이 남아 있는 동안만 더 굽는다.
const TILE_PASS_BUDGET_MS = 24
const TILE_PASS_MS = 60
// 타일 곳간 상한(픽셀). 기기 메모리가 모자라 앱이 죽은 적이 있다(2026-11-10, 7.83GB 중 5.87GB 사용).
// 2400만 px ≈ RGBA 96MB — 업계 구현들이 4GB 안드로이드에 쓰는 예산과 같은 자리다.
const TILE_BUDGET_PX = 24e6

const TailRun = memo(function TailRun({ objects, width, height, zoom, fade }) {
  const live = useSyncExternalStore(liveStroke.subscribe, liveStroke.get, liveStroke.get)
  const screenScale = zoom * PixelRatio.get()
  // 보이는 범위만 굽는다. 격자에 맞춘 창이라 조금 밀어서는 안 바뀌고, 바뀌면 멈춘 뒤 한 번만 다시 굽는다.
  const motion = useContext(ViewportMotion)
  const moving = motion.moving
  const raw = bakeWindow(motion.visible, width, height)
  const winKey = `${raw.x}|${raw.y}|${raw.w}|${raw.h}`
  const want = useMemo(() => raw, [winKey])   // eslint-disable-line react-hooks/exhaustive-deps
  // 확대하면 보이는 범위가 좁아져 쓰던 창 안에 들어온다 - 그러면 창을 바꾸지 않는다(바꾸면 전부 다시 굽는다)
  const winRef = useRef(null)
  const win = keepWindow(winRef.current, want) ? winRef.current : want
  useEffect(() => { winRef.current = win })
  const current = useMemo(() => live ? previewPicture(live, screenScale) : null, [live, screenScale])
  // 펜이 닿아 있는 동안인가. **굽기를 절대 이때 하지 않기 위해** 들고 있는다 —
  // 굽기는 화면 크기 그림을 GPU 에서 읽어 오느라 확대 상태에서 300~1800ms 걸리고,
  // 그동안 JS 가 막혀 펜 이벤트를 못 받는다(사용자 2026-11-10 "렉 걸릴 때 펜이 끊겨").
  // plan 의 의존성에는 넣지 않는다 — 넣으면 쓰는 매 프레임 plan 과 rest 그림이 다시 만들어진다.
  const liveRef = useRef(false)
  liveRef.current = Boolean(live)
  // 굽기만 상한을 건다. 쓰는 중인 획 · 아직 안 구운 획은 늘 화면 배율 그대로 또렷하게 그린다.
  // 축소하면 필요한 배율이 내려가는데, 구워 둔 타일은 그보다 촘촘하니 그대로 쓴다
  // (배율이 달라지면 타일 열쇠가 달라져 전부 다시 구워야 한다).
  const scaleRef = useRef(0)
  // 타일 한 칸이 **딱 떨어지는 픽셀 수**가 되게 배율을 맞춘다. ¼옥타브 배율(1.189…)을 그대로 쓰면
  // TILE * scale = 304.4 이고 그림은 올림해서 305픽셀이라, 맨 끝 한 줄이 칸 밖을 가리킨다.
  const wantScale = Math.round(TILE * bakeScaleOf(screenScale, win.w, win.h)) / TILE
  const scale = keepScale(scaleRef.current, wantScale) ? scaleRef.current : wantScale
  useEffect(() => { scaleRef.current = scale })
  // 지우개 · 되돌리기처럼 앞쪽 획이 바뀌면 매번 처음부터 굽느라(화면 크기 그림을 그리고 GPU 에서 읽어 오기) 지우개가 느렸다
  // → 바뀐 자리 앞까지만 한 번 굽고 뒤는 그림으로 그리다가, 바뀜이 SETTLE_MS 동안 멈추면 전부 굽는다.
  const unsettled = useRef(false)
  const [settled, settle] = useReducer(n => n + 1, 0)
  // 렌더 중에는 풀지 않고 모아 뒀다가 화면에 반영된 뒤 푼다: 버려진 렌더가 지금 화면에 있는 그림을 풀면 안 된다
  const retired = useRef([])
  const retire = old => { if (old) retired.current.push(old) }
  const wideRef = useRef(null)
  // 바탕 배율은 **페이지 크기만** 따른다(확대율을 넣으면 확대할 때마다 다시 구워진다)
  const wideScale = Math.sqrt(WIDE_MAX_PX / Math.max(1, width * height))
  const settledSeen = useRef(0)
  // 타일 곳간. 열쇠는 칸 좌표 + 배율이라, 배율이 바뀌면 옛 타일은 그대로 남아 있다가 LRU 로 밀려난다.
  const tiles = useRef(new Map())
  const clock = useRef(0)
  const more = useRef(false)
  const plan = useMemo(() => {
    const isSettle = settled !== settledSeen.current
    const t0 = PENCIL_PROFILE.on ? nowMs() : 0
    try { return planOf() } finally { if (t0) recordProfile('PLAN', nowMs() - t0) }
    function planOf() {
    // 창이 페이지를 다 덮으면(화면에 맞춤 등) 창 밖이 없으니 바탕도 없다
    if (coversPage(win, width, height) || !objects.length) {
      if (wideRef.current) { retire(wideRef.current); wideRef.current = null }
    } else if (moving && !liveRef.current && (!wideRef.current || !sameObjects(wideRef.current.objects, objects))) {
      // **미는 동작이 시작될 때만** 굽는다. 바탕은 미는 동안에만 보이므로 그때 한 번이면 된다.
      retire(wideRef.current)
      const made = bakeRegion(objects, { x: 0, y: 0, w: width, h: height }, wideScale, 'WIDE')
      wideRef.current = made && { ...made, objects }
    }
    if (!objects.length) { more.current = false; return { tiles: [], rest: objects } }
    // 끌어 옮기는 중인 획은 매 프레임 자리가 바뀌므로 타일에 넣지 않는다 — 벡터로 그린다
    const movers = fade ? objects.filter(object => fade.includes(object.id)) : null
    const settled0 = movers ? objects.filter(object => !fade.includes(object.id)) : objects
    const { fresh, stale } = planTiles(settled0, win, width, height, scale, tiles.current)
    // 쓰는 중 · 미는 중에는 굽지 않는다(굽기가 JS 를 막아 펜 이벤트가 끊긴다). 멈췄을 때만 한 줌씩.
    const canBake = isSettle && !liveRef.current && !moving
    const made = []
    if (canBake) {
      const passStart = nowMs()
      for (const entry of stale) {
        if (made.length && nowMs() - passStart >= TILE_PASS_BUDGET_MS) break
        const tile = bakeTile(entry, scale, ++clock.current)
        if (!tile) break
        retire(tiles.current.get(tileKey(entry.col, entry.row, scale)))
        tiles.current.set(tileKey(entry.col, entry.row, scale), tile)
        made.push(tile)
      }
    }
    const done = new Set(made.map(tile => `${tile.col},${tile.row}`))
    const left = stale.filter(entry => !done.has(`${entry.col},${entry.row}`))
    for (const tile of fresh) tile.used = ++clock.current
    // 이번 렌더에 그리는 타일은 **퇴출하지 않는다**. 예산을 넘겨 밀려나면 retire → 1초 뒤 dispose 인데
    // 그 그림을 아직 화면에 그리고 있어 빈 자리가 생긴다(화면 타일만으로 예산을 넘을 수 있다).
    const inUse = new Set([...fresh, ...made].map(tile => tileKey(tile.col, tile.row, tile.scale)))
    evictTiles(tiles.current, TILE_BUDGET_PX, tile => retire(tile), inUse)
    // 아직 못 구운 칸: 지난 그림을 깔고 거기 없던 획만 벡터로 얹는다(다 얹으면 두 번 그려진다)
    const show = [...fresh, ...made, ...staleImages(left)]
    const rest = pendingStrokes(settled0, left)
    const cut = removedStrokes(left)
    more.current = left.length > 0
    if (more.current) unsettled.current = true
    return { tiles: show, rest: movers ? [...rest, ...movers] : rest, cut: cut.length ? cut : null }
    }
  }, [objects, fade, width, height, scale, win, moving, settled])   // moving: 밀기 시작에 창 밖 바탕을 한 번 굽는다
  useEffect(() => {
    if (!unsettled.current) return
    let timer
    // 시계가 울렸는데 아직 펜이 닿아 있으면 굽지 않고 다시 기다린다
    const tick = () => {
      if (liveRef.current) { timer = setTimeout(tick, 120); return }
      unsettled.current = false
      settle()
    }
    // 구울 타일이 남았으면 짧게 — 한 줌씩 이어 굽는다. 아니면 평소대로 멈춤을 기다린다.
    timer = setTimeout(tick, more.current ? TILE_PASS_MS : SETTLE_MS)
    return () => clearTimeout(timer)
  }, [objects, settled, scale, win, moving])   // scale · win · moving: 확대 · 이동하는 동안에는 시계가 미뤄지고, 손을 떼면 굽는다
  useEffect(() => {
    settledSeen.current = settled
    if (retired.current.length) { retired.current.forEach(release); retired.current = [] }
  })
  useEffect(() => () => { retired.current.forEach(release); release(wideRef.current)
    for (const tile of tiles.current.values()) release(tile)
    tiles.current.clear() }, [])
  // 굽는 층이 다 사라지면 굽는 표면(최대 96MB)도 놓는다
  useEffect(() => holdBakeSurface(), [])
  const patch = useMemo(() => plan.cut ? patchPicture(plan.cut, objects, screenScale) : null, [plan, objects, screenScale])
  const strokes = useMemo(() => {
    if (!plan.rest.length) return null
    const t0 = PENCIL_PROFILE.on ? nowMs() : 0
    const picture = strokesPicture(plan.rest, object => fade?.includes(object.id) ? DRAG_OPACITY : 1, screenScale)
    if (t0) recordProfile('REST', nowMs() - t0)
    return picture
  }, [plan, fade, screenScale])
  const wide = wideRef.current
  // 바탕은 **타일이 덮는 네모** 밖에만 깐다. 창(160 격자)으로 자르면 타일(256 칸)이 창 밖으로
  // 뻗은 띠에서 바탕과 타일이 겹쳐 반투명 잉크가 두 번 그려진다.
  const covered = useMemo(() => tilesBounds(win, width, height), [win, width, height])
  return <>
  <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: width * zoom, height: height * zoom }}>
    {/* 구운 그림은 화면 픽셀 1:1 로(올림한 크기를 페이지 크기로 늘리면 살짝 흐려져 쓰는 중 획과 달라 보였다) */}
    {/* 창 밖 바탕(흐릿) — 또렷한 그림이 덮는 창 안쪽은 잘라 낸다. 겹쳐 그리면 반투명 잉크가 두 번 곱해져 진해진다 */}
    {wide && plan.tiles.length && covered ? <Group clip={Skia.XYWHRect(covered.x * zoom, covered.y * zoom, covered.w * zoom, covered.h * zoom)} invertClip>
      <Image image={wide.image} x={0} y={0} width={width * zoom} height={height * zoom} fit="fill" />
    </Group> : null}
    {/*
      타일 경계에 **1px 옅은 줄**이 떴다(실기 SM-X510 2026-11-11, 잉크 위로 세로 줄 — 배율에 따라
      보였다 안 보였다 했다. 타일을 256→192 로 바꾸니 줄도 같이 옮겨가 타일 경계임을 확인했다).
      경계에 걸친 화면 픽셀 하나를 두 타일이 **반씩** 덮는 것이 원인이다. 반투명 잉크는 반쯤 두 번
      올린 값이 한 번에 다 올린 값보다 옅다(1-(1-a/2)² < a). 그래서 자리를 픽셀에 맞춰 반올림하고,
      가장자리도 부드럽게 하지 않아(antiAlias={false}) 한 줄이 **정확히 한 타일에만** 속하게 한다.
    */}
    {plan.tiles.map(tile => {
      const x0 = Math.round(tile.col * TILE * zoom), y0 = Math.round(tile.row * TILE * zoom)
      const x1 = Math.round((tile.col + 1) * TILE * zoom), y1 = Math.round((tile.row + 1) * TILE * zoom)
      return <Image key={`${tile.col},${tile.row}`} image={tile.image} antiAlias={false}
        x={x0} y={y0} width={x1 - x0} height={y1 - y0} fit="fill" />
    })}
    <Group transform={[{ scale: zoom }]}>
      {patch ? <Picture picture={patch} /> : null}
      {strokes ? <Picture picture={strokes} /> : null}
      {current ? <Picture picture={current} /> : null}
    </Group>
  </Canvas>
  </>
})

const same = (a, b) => a.length === b.length && a.every((object, i) => object === b[i])
const NONE = []

export default function CompletedStrokeLayer({ objects, width, height, zoom, renderObject, fadeIds = null, uncachedObjects = null }) {
  // 내용이 같은 묶음은 같은 배열을 넘겨 다시 녹화하지 않는다(첫 획 id 로 찾는다)
  const previous = useRef(new Map())
  const layers = [], runs = new Map()
  let run = null
  const visible = objects.filter(object => !object.hidden)
  const close = tail => {
    if (!run && !tail) return
    const list = run ?? NONE, key = tail ? 'tail' : list[0].id, kept = previous.current.get(key)
    const objects = kept && same(kept, list) ? kept : list
    runs.set(key, objects)
    const fade = fadeIds?.length && objects.some(object => fadeIds.includes(object.id)) ? fadeIds : null
    // 맨 위 묶음은 'tail' 로 두어 새 획이 들어와도 같은 캔버스를 쓴다(새 캔버스를 만들면 첫 프레임이 빈다)
    layers.push(tail
      ? <TailRun key="ink-tail" objects={objects} width={width} height={height} zoom={zoom} fade={fade} />
      : <Run key={`ink-${key}`} objects={objects} width={width} height={height} zoom={zoom} fade={fade} />)
    run = null
  }
  for (const object of visible) {
    if (object.type === 'stroke' && !uncachedObjects?.has(object)) (run ??= []).push(object)
    else { close(false); layers.push(renderObject(object)) }
  }
  close(true)
  previous.current = runs
  return layers
}
