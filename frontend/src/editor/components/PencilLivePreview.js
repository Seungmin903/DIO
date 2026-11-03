import { useEffect, useLayoutEffect, useRef } from 'react'
import { PixelRatio, View } from 'react-native'

// 웹: 쓰는 중인 연필 획을 앱과 같은 Skia(CanvasKit)로 그려 획을 감싼 작은 캔버스에 올린다(앱은 CompletedStrokeLayer.native 의 맨 위 캔버스).
// 펜 이벤트마다 그리지 않고 화면 갱신(requestAnimationFrame) 한 번에 가장 새 획만 그린다. 획이 길어질수록 도장 수가 늘어 CPU 로는 갱신마다 수십 ms 가 걸려서
// 보이는 캔버스에 WebGL 표면(앱과 같은 GPU 그리기)으로 바로 그린다. WebGL 을 못 쓰면 CPU 표면 → 2D 캔버스 복사로 대신한다.
// runtime: skiaRuntime 이 준 { Skia, previewPicture, makeSurface, liveSurface, AlphaType, ColorType }
const STEP = 64
const bounds = (parts, width) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const part of parts) for (const p of part.points) {
    if (p.x < x0) x0 = p.x
    if (p.x > x1) x1 = p.x
    if (p.y < y0) y0 = p.y
    if (p.y > y1) y1 = p.y
  }
  const m = width * 1.9 + 2
  return { left: Math.floor((x0 - m) / 8) * 8, top: Math.floor((y0 - m) / 8) * 8, right: x1 + m, bottom: y1 + m }
}
// 이 브라우저가 CanvasKit 의 WebGL 표면을 만들 수 있는지(한 번만 시험)
let glOk = null
const glSupported = runtime => {
  if (glOk !== null) return glOk
  try {
    const probe = document.createElement('canvas'); probe.width = probe.height = 8
    const surface = runtime.liveSurface?.(probe)
    glOk = Boolean(surface)
    surface?.dispose?.()
  } catch { glOk = false }
  return glOk
}

// onUnavailable: 표면을 만들지 못해 이 캔버스에 그릴 수 없을 때(부르는 쪽이 SVG 미리보기로 바꾼다)
export default function PencilLivePreview({ runtime, preview, zoom, pageWidth, pageHeight, onUnavailable }) {
  const canvasRef = useRef(null), target = useRef(null), latest = useRef(null), frame = useRef(0)
  const gl = glSupported(runtime)
  const scale = zoom * PixelRatio.get()
  const box = bounds(preview.parts, preview.settings.width)
  // 페이지 안으로 자르고, 크기는 STEP 단위로 올려 갱신마다 표면을 새로 만들지 않게 한다
  const left = Math.max(0, box.left), top = Math.max(0, box.top)
  // 획이 페이지 밖에 있어도 크기는 한 칸 이상(0 이면 배율이 무한대가 된다)
  const width = Math.max(STEP, Math.ceil((Math.min(pageWidth, box.right) - left) / STEP) * STEP), height = Math.max(STEP, Math.ceil((Math.min(pageHeight, box.bottom) - top) / STEP) * STEP)
  const pxW = Math.max(1, Math.round(width * scale)), pxH = Math.max(1, Math.round(height * scale))
  latest.current = { runtime, preview, scale, left, top, width, height, pxW, pxH, onUnavailable }
  const release = () => { target.current?.surface.dispose?.(); target.current = null }
  const draw = () => {
    frame.current = 0
    const node = canvasRef.current, now = latest.current
    if (!node || !now) return
    const { runtime: rt, preview: item, scale: s } = now
    if (!target.current || target.current.width !== now.pxW || target.current.height !== now.pxH) {
      release()
      // 캔버스 크기를 바꾸면 그리기 버퍼가 새로 잡히므로 표면도 새로 만든다
      node.width = now.pxW; node.height = now.pxH
      let surface = null
      try { surface = gl ? rt.liveSurface(node) : rt.makeSurface(now.pxW, now.pxH) } catch { /* 아래에서 함께 처리 */ }
      if (!surface) { now.onUnavailable?.(); return }
      target.current = { surface, width: now.pxW, height: now.pxH }
    }
    const { surface } = target.current, canvas = surface.getCanvas()
    canvas.clear(Float32Array.of(0, 0, 0, 0))
    canvas.save()
    canvas.scale(now.pxW / now.width, now.pxH / now.height)
    canvas.translate(-now.left, -now.top)
    canvas.drawPicture(rt.previewPicture(item, s))
    canvas.restore()
    surface.flush()
    if (gl) return
    const image = surface.makeImageSnapshot()
    const pixels = image.readPixels(0, 0, { width: now.pxW, height: now.pxH, colorType: rt.ColorType.RGBA_8888, alphaType: rt.AlphaType.Unpremul })
    image.dispose?.()
    node.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.byteLength), now.pxW, now.pxH), 0, 0)
  }
  useLayoutEffect(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw)
  })
  useEffect(() => () => { cancelAnimationFrame(frame.current); release() }, [])
  return <View pointerEvents="none" dataSet={{ skiaPencilLive: gl ? 'gl' : 'cpu' }} style={{ position: 'absolute', left: left * zoom, top: top * zoom, width: width * zoom, height: height * zoom }}>
    <canvas key={gl ? 'gl' : 'cpu'} ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%' }} />
  </View>
}
