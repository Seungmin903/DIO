import { useContext, useEffect, useRef, useState } from 'react'
import { Image, PixelRatio, View } from 'react-native'
import { SkiaPencilScale } from '../skia/skiaPencilScale.js'
import { useSkiaRuntime } from '../skia/skiaRuntime'
import { drawPencilRaster, pencilRasterKey, rememberRaster, reusableRaster } from '../skia/pencilRaster.js'
import { quantizeScale, REBAKE_DELAY_MS, spend, withinBudget } from '../skia/rasterBudget.js'
import { isCurrentPencilPreviewEvent, pencilPreviewFallbackVisible, pencilPreviewFrames, pencilPreviewPosition } from '../utils/pencilPreviewFallback.js'

// 앱: 연필 획을 앱 Skia 오프스크린 그림(CompletedStrokeLayer.native 의 bake 와 같은 방식)으로 그려 PNG 로 띄운다 —
// 썸네일 · 내보내기(view-shot 캡처)가 편집 화면의 Skia 연필과 같은 그림이 된다. SVG 그림(fallback)은 그림을 못 만들었을 때만 — 연필 SVG 는 결 무늬 경로가 Java 힙에 한 획 약 2MB 씩 올라가고,
// 화면 밖 썸네일은 그림이 안 올라와 onLoad 가 오지 않으니 뜨기 전에도 붙여 두면 계속 남아 힙이 찬다(2026-11-04 측정: 256MB 중 약 140MB, GC 로 앱 전체 렉 · 긴 획 뒤 메모리 부족 종료).
// 그림은 한 번만 만들어(획 점 배열 단위로 기억) 같은 획의 썸네일 · 내보내기가 다시 그리지 않는다. 시간 예산(rasterBudget)을 넘으면 다음 틱으로 미룬다.
const cache = new WeakMap()   // object.points → { key, raster }
const peek = (object, scale) => { const hit = cache.get(object.points); return hit?.key === pencilRasterKey(object, scale) ? hit.raster : null }

// 그릴 수 없는 획은 같은 배율에서 다시 시도하지 않는다(SVG 로 둔다)
const fail = (object, scale) => { cache.set(object.points, { key: pencilRasterKey(object, scale), raster: false }); return false }

function make(runtime, object, scale) {
  const started = performance.now()
  try {
    const drawn = drawPencilRaster(runtime, object, scale)
    if (!drawn) return fail(object, scale)
    const uri = `data:image/png;base64,${drawn.image.encodeToBase64()}`
    drawn.dispose()
    const raster = { uri, left: drawn.left, top: drawn.top, width: drawn.width, height: drawn.height }
    cache.set(object.points, { key: pencilRasterKey(object, scale), raster })
    return raster
  } catch (error) {
    console.warn('[skia] 연필 그림 실패, SVG 로 둡니다:', error?.message ?? error)
    return fail(object, scale)
  } finally { spend(performance.now() - started) }
}

// 설정 견본에서는 새 이미지가 로드될 때까지 직전 이미지를 보여 준다.
function PreviewRaster({ raster, object, zoom, transform, fallback, failed = false }) {
  const [ready, setReady] = useState(null)
  const [failedUri, setFailedUri] = useState(null)
  const latest = useRef(null)
  latest.current = raster?.uri ?? null
  const candidate = raster ? { ...raster, boxWidth: object.w, boxHeight: object.h } : null
  const frames = failed ? [] : pencilPreviewFrames(ready, candidate, failedUri)
  return <View pointerEvents="none" style={{ width: object.w * zoom, height: object.h * zoom, transform }}>
    {pencilPreviewFallbackVisible(frames) ? fallback : null}
    {frames.map(({ image, visible }) => <Image key={image.uri} source={{ uri: image.uri }} fadeDuration={0}
      onLoad={() => { if (isCurrentPencilPreviewEvent(latest.current, image.uri)) { setReady(image); setFailedUri(null) } }}
      onError={() => { if (isCurrentPencilPreviewEvent(latest.current, image.uri)) setFailedUri(image.uri) }}
      style={{ position: 'absolute', left: pencilPreviewPosition(image, object).left * zoom, top: pencilPreviewPosition(image, object).top * zoom, width: image.width * zoom, height: image.height * zoom, opacity: visible ? 1 : 0 }} />)}
  </View>
}

export default function PencilSkiaStroke({ object, zoom, transform, fallback, onAssetLoad, showFallbackWhileLoading = false }) {
  const { runtime } = useSkiaRuntime()
  const exported = useContext(SkiaPencilScale)
  const scale = exported ?? quantizeScale(zoom * PixelRatio.get())
  const [, again] = useState(0), forced = useRef(false)
  const [loaded, setLoaded] = useState(null)   // 화면에 올라온 그림의 uri
  const [broken, setBroken] = useState(null)   // 띄우지 못한 그림의 uri
  const last = useRef(null)   // 불투명도 · 배율만 바뀌어 새 그림을 예산 때문에 미루는 동안 보여 줄 이전 그림(획이 잠깐 비지 않게)
  let raster = null   // null: 아직(SVG) · false: 그릴 수 없음(SVG 가 최종)
  if (runtime) {
    raster = peek(object, scale)
    // 이전 그림을 대신 보여 줄 수 있으면 바로 굽지 않는다: 아래 타이머가 값이 멈춘 뒤 한 번만 굽는다
    if (raster === null && (forced.current || (!reusableRaster(last.current, object) && withinBudget()))) { forced.current = false; raster = make(runtime, object, scale) }
  }
  useEffect(() => {
    if (!runtime || raster !== null) return undefined
    const timer = setTimeout(() => { forced.current = true; again(n => n + 1) }, reusableRaster(last.current, object) ? REBAKE_DELAY_MS : 0)
    return () => clearTimeout(timer)
  })
  // 그림을 못 만들었으면 SVG 가 최종 모양이다 → 내보내기가 바로 찍어도 된다(알림 함수는 매번 새로 만들어져 오므로 ref)
  const notify = useRef(onAssetLoad)
  notify.current = onAssetLoad
  useEffect(() => { if (raster === false) notify.current?.() }, [raster])
  if (raster) last.current = rememberRaster(object, raster)
  const shown = raster === null ? reusableRaster(last.current, object) : raster
  const showing = shown && loaded === shown.uri
  if (showFallbackWhileLoading) return <PreviewRaster raster={shown} object={object} zoom={zoom} transform={transform} fallback={fallback} failed={raster === false} />
  return <>
    {raster === false || (shown && broken === shown.uri) ? fallback : null}
    {shown ? <View pointerEvents="none" style={{ position: showing ? 'relative' : 'absolute', width: object.w * zoom, height: object.h * zoom, transform }}>
      <Image source={{ uri: shown.uri }} fadeDuration={0} onLoad={() => { setLoaded(shown.uri); notify.current?.() }} onError={() => { setLoaded(null); setBroken(shown.uri); notify.current?.() }}
        style={{ position: 'absolute', left: shown.left * zoom, top: shown.top * zoom, width: shown.width * zoom, height: shown.height * zoom, opacity: showing ? 1 : 0 }} />
    </View> : null}
  </>
}
