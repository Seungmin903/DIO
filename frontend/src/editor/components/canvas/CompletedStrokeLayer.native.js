import { memo, useEffect, useMemo, useReducer, useRef, useSyncExternalStore } from 'react'
import { PixelRatio } from 'react-native'
import { Canvas, Group, Image, Picture, Skia } from '@shopify/react-native-skia'
import { Text } from 'react-native'
import { PENCIL_PROFILE, previewPicture, strokesPicture } from '../../skia/strokeSkia.js'
import { liveStroke } from '../../skia/liveStroke.js'

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
let pool = null
function bakeSurface(width, height) {
  if (pool && pool.width >= width && pool.height >= height) return pool
  const w = stepUp(Math.max(width, pool?.width ?? 0)), h = stepUp(Math.max(height, pool?.height ?? 0))
  pool?.surface.dispose?.()
  const surface = Skia.Surface.MakeOffscreen(w, h)
  return (pool = surface ? { surface, width: w, height: h, content: null } : null)
}
function bake(previous, objects, width, height, scale) {
  if (previous && previous.objects.length === objects.length) return previous
  const pixelWidth = Math.ceil(width * scale), pixelHeight = Math.ceil(height * scale)
  const target = bakeSurface(pixelWidth, pixelHeight)
  if (!target) return null
  const canvas = target.surface.getCanvas()
  // 표면에 이미 previous 가 그려져 있으면 새 획만 더한다
  if (!previous || target.content !== previous) {
    canvas.clear(Float32Array.of(0, 0, 0, 0))
    if (previous) canvas.drawImage(previous.image, 0, 0)
  }
  canvas.save()
  canvas.scale(scale, scale)
  canvas.drawPicture(strokesPicture(previous ? objects.slice(previous.objects.length) : objects, undefined, scale))
  canvas.restore()
  target.surface.flush()
  const snapshot = target.surface.makeImageSnapshot(Skia.XYWHRect(0, 0, pixelWidth, pixelHeight)), image = snapshot.makeNonTextureImage()
  snapshot.dispose?.()
  const next = image && { objects, scale, image }
  target.content = next
  return next
}
const keptLength = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i }
// 구운 그림은 화면 해상도 크기라 GC 를 기다리면 메모리가 쌓인다 → 화면이 새 그림으로 넘어간 뒤 풀어 준다
const release = baked => { if (baked) setTimeout(() => baked.image.dispose?.(), 1000) }
const SETTLE_MS = 400

const TailRun = memo(function TailRun({ objects, width, height, zoom, fade }) {
  const live = useSyncExternalStore(liveStroke.subscribe, liveStroke.get, liveStroke.get)
  const scale = zoom * PixelRatio.get()
  const current = useMemo(() => live ? previewPicture(live, scale) : null, [live, scale])
  const baked = useRef(null)
  // 지우개 · 되돌리기처럼 앞쪽 획이 바뀌면 매번 처음부터 굽느라(화면 크기 그림을 그리고 GPU 에서 읽어 오기) 지우개가 느렸다
  // → 바뀐 자리 앞까지만 한 번 굽고 뒤는 그림으로 그리다가, 바뀜이 SETTLE_MS 동안 멈추면 전부 굽는다.
  const unsettled = useRef(false)
  const [settled, settle] = useReducer(n => n + 1, 0)
  const keep = next => {
    if (baked.current !== next) release(baked.current)
    return (baked.current = next)
  }
  const plan = useMemo(() => {
    if (fade || !objects.length) return { image: null, rest: objects }
    let previous = baked.current?.scale === scale ? baked.current : null
    const kept = previous ? keptLength(previous.objects, objects) : 0
    if (previous && kept < previous.objects.length) {
      unsettled.current = true
      previous = keep(kept ? bake(null, objects.slice(0, kept), width, height, scale) : null)
    }
    if (unsettled.current) return { image: previous, rest: objects.slice(previous?.objects.length ?? 0) }
    const next = keep(bake(previous, objects, width, height, scale))
    return { image: next, rest: next ? [] : objects }
  }, [objects, fade, width, height, scale, settled])
  useEffect(() => {
    if (!unsettled.current) return
    const timer = setTimeout(() => { unsettled.current = false; settle() }, SETTLE_MS)
    return () => clearTimeout(timer)
  }, [objects, settled])
  useEffect(() => () => release(baked.current), [])
  const strokes = useMemo(() => plan.rest.length ? strokesPicture(plan.rest, object => fade?.includes(object.id) ? DRAG_OPACITY : 1, scale) : null, [plan, fade, scale])
  const image = plan.image?.image, ratio = PixelRatio.get()
  const label = PENCIL_PROFILE.on ? Object.entries(globalThis.__PENCIL_PROFILE__ ?? {}).map(([k, v]) => `${k} ${v.avg?.toFixed(1)}/${v.max?.toFixed(0)}`).join('  ') : null
  return <>
    {label ? <Text pointerEvents="none" style={{ position: 'absolute', left: 8, top: 8, backgroundColor: '#ffffffd0', color: '#900', fontSize: 14 }}>{label}</Text> : null}
  <Canvas pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: width * zoom, height: height * zoom }}>
    {/* 구운 그림은 화면 픽셀 1:1 로(올림한 크기를 페이지 크기로 늘리면 살짝 흐려져 쓰는 중 획과 달라 보였다) */}
    {image ? <Image image={image} x={0} y={0} width={image.width() / ratio} height={image.height() / ratio} fit="fill" /> : null}
    <Group transform={[{ scale: zoom }]}>
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
