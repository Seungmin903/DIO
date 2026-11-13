import { gifPlacement } from './gifLayers.js'

/*
 * 페이지 GIF 장면 합성을 Skia 로 한다. gifLayers.js 의 composeFrame 과 같은 결과(region 크기 RGBA, 알파 곱하지 않음)를 내지만
 * 화소마다 JS 로 돌리지 않고 Skia(앱: GPU 표면, 웹: CanvasKit)가 그린다. Hermes 에서 JS 화소 반복이 GIF 내보내기 시간의 대부분이었다.
 * 층과 GIF 장면은 처음 쓸 때 한 번만 Skia 이미지로 올리고, 장면마다 그리기만 한다.
 * runtime: skiaRuntime 이 준 { Skia, ColorType, AlphaType, ClipOp, FilterMode, MipmapMode, makeSurface }
 */
export function createSkiaComposer(runtime, { segments, layers, pageWidth, pageHeight, ratio, frameOf }) {
  const { Skia, ColorType, AlphaType, ClipOp, FilterMode, MipmapMode } = runtime
  const owned = []
  const own = (resource) => { if (resource) owned.push(resource); return resource }
  const imageOf = (rgba, width, height) => {
    // 앱 Skia 의 이미지는 Data 를 따로 붙잡고(RasterFromData) 이미지를 해제할 때 함께 놓는다. 그래서 Data 손잡이는 바로 놓아
    // GC 를 기다리며 네이티브 메모리를 잡고 있지 않게 한다 (만들다 실패해도)
    const data = Skia.Data.fromBytes(rgba)
    let image
    try { image = Skia.Image.MakeImage({ width, height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul }, data, width * 4) }
    finally { try { data.dispose?.() } catch {} }
    if (!image) throw new Error('Skia image upload failed')
    return own(image)
  }
  const dispose = () => { owned.splice(0).reverse().forEach((resource) => { try { resource.dispose?.() } catch {} }) }
  let layerImages, paint
  try {
    layerImages = layers.map((pixels) => pixels && imageOf(pixels, pageWidth, pageHeight))
    paint = own(Skia.Paint())
    paint.setAntiAlias(true)
  } catch (error) { dispose(); throw error }
  const frameImages = new Map()
  const frameImage = (frame) => {
    if (!frameImages.has(frame)) frameImages.set(frame, imageOf(frame.rgba, frame.width, frame.height))
    return frameImages.get(frame)
  }
  const surfaces = new Map()
  const surfaceOf = (width, height) => {
    const key = `${width}x${height}`
    if (!surfaces.has(key)) {
      const surface = runtime.makeSurface(width, height)
      if (!surface) throw new Error('Skia surface unavailable')
      surfaces.set(key, own(surface))
    }
    return surfaces.get(key)
  }

  const drawGif = (canvas, object) => {
    const opacity = Math.min(1, Math.max(0, object.opacity ?? 1))
    if (opacity <= 0) return
    const { frame, source } = frameOf(object)
    const { content, clip } = gifPlacement(object, source.width, source.height)
    canvas.save()
    // 화면처럼 요소 가운데를 기준으로 돌리고 뒤집는다 (drawGifObject 의 역변환과 같은 순서)
    canvas.translate(object.x + object.w / 2, object.y + object.h / 2)
    canvas.rotate(object.rotation ?? 0, 0, 0)
    canvas.scale(object.flipX ? -1 : 1, object.flipY ? -1 : 1)
    canvas.translate(-object.w / 2, -object.h / 2)
    const clipRect = Skia.XYWHRect(clip.x, clip.y, clip.width, clip.height)
    const rx = clip.radius === 'ellipse' ? clip.width / 2 : Math.min(clip.radius, clip.width / 2, clip.height / 2)
    const ry = clip.radius === 'ellipse' ? clip.height / 2 : rx
    if (rx > 0) canvas.clipRRect(Skia.RRectXY(clipRect, rx, ry), ClipOp.Intersect, true)
    else canvas.clipRect(clipRect, ClipOp.Intersect, true)
    paint.setAlphaf(opacity)
    canvas.drawImageRectOptions(frameImage(frame), Skia.XYWHRect(0, 0, frame.width, frame.height),
      Skia.XYWHRect(content.x, content.y, content.width, content.height), FilterMode.Linear, MipmapMode.None, paint)
    canvas.restore()
  }

  return {
    /** 장면 하나를 region({ x, y, width, height } 출력 픽셀) 크기 RGBA 로 */
    compose(region) {
      const surface = surfaceOf(region.width, region.height), canvas = surface.getCanvas()
      canvas.clear(Float32Array.of(0, 0, 0, 0))
      canvas.save()
      canvas.translate(-region.x, -region.y)
      let layerIndex = 0
      for (const segment of segments) {
        if (segment.kind === 'layer') {
          const image = layerImages[layerIndex++]
          if (image) canvas.drawImage(image, 0, 0)
          continue
        }
        canvas.save()
        canvas.scale(ratio.x, ratio.y)
        drawGif(canvas, segment.object)
        canvas.restore()
      }
      canvas.restore()
      surface.flush()
      const snapshot = surface.makeImageSnapshot()
      try {
        const pixels = snapshot.readPixels(0, 0, { width: region.width, height: region.height, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul })
        if (!pixels || pixels.length !== region.width * region.height * 4) throw new Error('Skia readPixels failed')
        return pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength)
      } finally { snapshot.dispose?.() }
    },
    dispose,
  }
}
