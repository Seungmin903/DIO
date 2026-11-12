import { useContext, useEffect, useRef, useState } from 'react'
import { PixelRatio, View } from 'react-native'
import { SkiaPencilScale } from '../skia/skiaPencilScale.js'
import { useSkiaRuntime } from '../skia/skiaRuntime'
import { drawPencilRaster, pencilRasterKey, rememberRaster, reusableRaster } from '../skia/pencilRaster.js'
import { quantizeScale, REBAKE_DELAY_MS, spend, withinBudget } from '../skia/rasterBudget.js'

// 웹: 연필 획을 앱과 같은 Skia(CanvasKit)로 그려 2D 캔버스에 올린다. CanvasKit 를 불러오는 동안(또는 실패하면)은 SVG 그림(fallback)을 그대로 둔다.
// 그림은 그리는 중(render)에 동기로 만들어 같은 화면 갱신에 SVG 없이 바로 캔버스가 뜬다(SVG 를 한 번 그렸다 바꾸지 않아 깜박임 · 중복 작업이 없다).
// 시간 예산(rasterBudget)을 넘는 획은 SVG 로 두고 다음 틱에 다시 그린다. 확대 배율이 바뀌는 동안은 이전 그림을 늘려 둔다.
const cache = new WeakMap()   // object.points → { key, raster }  (획 점이 바뀌면 points 도 새 배열)
const peek = (object, scale) => { const hit = cache.get(object.points); return hit?.key === pencilRasterKey(object, scale) ? hit.raster : null }

// 그릴 수 없는 획은 같은 배율에서 다시 시도하지 않는다(SVG 로 둔다)
const fail = (object, scale) => { cache.set(object.points, { key: pencilRasterKey(object, scale), raster: false }); return false }

function make(runtime, object, scale) {
  const started = performance.now()
  try {
    const drawn = drawPencilRaster(runtime, object, scale)
    if (!drawn) return fail(object, scale)
    // CanvasKit 표면 → 2D 캔버스(곱하지 않은 알파로 읽어 putImageData)
    const pixels = drawn.image.readPixels(0, 0, { width: drawn.pxWidth, height: drawn.pxHeight, colorType: runtime.ColorType.RGBA_8888, alphaType: runtime.AlphaType.Unpremul })
    const source = document.createElement('canvas')
    source.width = drawn.pxWidth; source.height = drawn.pxHeight
    source.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), drawn.pxWidth, drawn.pxHeight), 0, 0)
    drawn.dispose()
    const raster = { source, left: drawn.left, top: drawn.top, width: drawn.width, height: drawn.height, pxWidth: drawn.pxWidth, pxHeight: drawn.pxHeight }
    cache.set(object.points, { key: pencilRasterKey(object, scale), raster })
    return raster
  } catch (error) {
    console.warn('[skia] 연필 그리기 실패, SVG 로 둡니다:', error?.message ?? error)
    return fail(object, scale)
  } finally { spend(performance.now() - started) }
}

export default function PencilSkiaStroke({ object, zoom, transform, fallback, onAssetLoad }) {
  const { status, runtime } = useSkiaRuntime()
  const exported = useContext(SkiaPencilScale)
  const scale = exported ?? quantizeScale(zoom * PixelRatio.get())
  const [, again] = useState(0), forced = useRef(false), last = useRef(null)
  let raster = null   // null: 아직(SVG) · false: 그릴 수 없음(SVG 가 최종)
  if (runtime) {
    raster = peek(object, scale)
    // 이전 그림을 대신 보여 줄 수 있으면 바로 굽지 않는다: 아래 타이머가 값이 멈춘 뒤 한 번만 굽는다
    if (raster === null && (forced.current || (!reusableRaster(last.current, object) && withinBudget()))) { forced.current = false; raster = make(runtime, object, scale) }
  }
  if (raster) last.current = rememberRaster(object, raster)
  useEffect(() => {
    if (!runtime || raster !== null) return undefined
    const timer = setTimeout(() => { forced.current = true; again(n => n + 1) }, reusableRaster(last.current, object) ? REBAKE_DELAY_MS : 0)
    return () => clearTimeout(timer)
  })
  // 내보내기: 최종 그림(캔버스, 또는 CanvasKit 실패로 SVG)이 정해지면 한 번 알린다(알림 함수는 매번 새로 만들어져 오므로 ref)
  const notify = useRef(onAssetLoad)
  notify.current = onAssetLoad
  useEffect(() => { if (raster !== null || status === 'failed') notify.current?.() }, [raster, status])
  const shown = raster || reusableRaster(last.current, object)
  const draw = node => { if (node && shown) node.getContext('2d').drawImage(shown.source, 0, 0) }
  // Web rasterizes synchronously into CanvasKit; before a raster is ready or while rebaking is deferred,
  // the SVG fallback below stays visible. Native Image onLoad double-buffering is not needed here.
  if (!shown) return fallback
  return <View pointerEvents="none" dataSet={{ skiaPencil: 'true' }} style={{ width: object.w * zoom, height: object.h * zoom, transform }}>
    <canvas ref={draw} width={shown.pxWidth} height={shown.pxHeight} aria-hidden="true"
      style={{ position: 'absolute', left: shown.left * zoom, top: shown.top * zoom, width: shown.width * zoom, height: shown.height * zoom }} />
  </View>
}
