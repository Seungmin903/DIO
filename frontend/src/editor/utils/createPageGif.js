import { mediaService } from '../services/mediaStore'
import { mediaId } from './mediaReferences.js'
import { isAnimatedMedia } from '../stickerAssets'
import { readLegacyExportImage } from './exportImage'
import { preparePageExport } from './preparePageExport'
import { PageExportError } from './pageExport.js'
import { animatedRegion, createGifAssembler, createYield, downscaleRgba, gifFrameDelays, gifFrames, planGifTimeline } from './gifExport.js'
import { composeFrame, planLayers } from './gifLayers.js'
import { createSkiaComposer } from './gifSkiaCompose.js'
import { skiaState } from '../skia/skiaRuntime'
import { packingLayout } from '../templates/packingLayout.js'
import { captureRgba, gifResult, pngResource, readBytes } from './gifFileIO'

const keyOf = (o) => o.mediaFileId ? `media:${o.mediaFileId}` : o.asset ? `asset:${o.asset}` : o.src

/** 이 페이지에 움직이는 GIF(스티커·사진)가 있는지 */
export const pageHasAnimation = (page) => page.objects.some((o) => !o.hidden && o.opacity !== 0 && isAnimatedMedia(o))

async function readGifBytes(object) {
  const id = mediaId(object)
  if (id) return readBytes((await mediaService.get(id)).blob)
  const input = await readLegacyExportImage(object.src)
  try { return await readBytes(input.blob) } finally { input.dispose?.() }
}

// 장면 합성은 GPU 표면이 있는 앱에서만 Skia 로 한다. 웹 CanvasKit 은 CPU 로 그려 큰 페이지에서는 V8 의 JS 합성보다 느리다
const gpuSkia = () => { const runtime = skiaState().runtime; return runtime?.gpuSurface ? runtime : null }

const isCancel = (error, signal) => signal?.aborted || error?.code === 'EXPORT_CANCELLED'

/**
 * 페이지 한 장을 움직이는 GIF 로 만든다. GIF 마다 필요한 장면을 풀어 보이는 크기로 줄여 둔 뒤,
 * 1) 층 합성(gifLayers.js): 페이지를 GIF 사이사이 층으로 몇 번만 찍고, 장면마다 GIF 장면을 층 사이에 픽셀로 끼워 합친다.
 *    앱(GPU Skia)에서는 Skia 로 합치고(gifSkiaCompose.js), 없거나 실패하면 JS 로 합친다.
 * 2) 층 합성으로 화면과 똑같이 그릴 수 없는 GIF(테두리 · 그림자 · 틀 · 하트 모양 등)가 있거나 층 합성이 실패하면,
 *    예전처럼 장면 조합이 바뀔 때마다 renderFrame 으로 페이지를 찍는다(첫 장면만 전체, 나머지는 움직이는 곳만).
 * onProgress({ phase, done, total }) 로 진행을 알린다. 반환값은 dispose 해야 한다.
 */
export async function createPageGif(snapshot, { renderFrame, onProgress, signal, skia = gpuSkia() }) {
  const disposers = []
  const check = () => { if (signal?.aborted) throw signal.reason ?? new PageExportError('EXPORT_CANCELLED', 'GIF 만들기를 취소했어요.') }
  try {
    const groups = new Map()
    for (const object of snapshot.objects) {
      if (!isAnimatedMedia(object)) continue
      const key = keyOf(object)
      if (!groups.has(key)) groups.set(key, { ids: [], object })
      groups.get(key).ids.push(object.id)
    }
    if (!groups.size) throw new PageExportError('EXPORT_GIF_NONE', '이 페이지에는 움직이는 GIF가 없어요.')
    onProgress?.({ phase: 'decode', done: 0, total: 1 })
    const ratioX = snapshot.pixelWidth / snapshot.width, ratioY = snapshot.pixelHeight / snapshot.height
    const gifs = []
    for (const group of groups.values()) {
      const bytes = await readGifBytes(group.object)
      check()
      gifs.push({ ...group, bytes, delays: gifFrameDelays(bytes) })
    }
    const plan = planGifTimeline(gifs.map((g) => g.delays))
    // GIF 마다 필요한 장면만, 페이지에 보이는 크기(출력 픽셀 기준, 자르기 확대 포함)로 줄여 둔다.
    // 장면 하나 푸는 일이 JS 스레드를 오래 잡으므로, 쉬어 가며 진행률을 알린다
    // (안 쉬면 큰 GIF 에서 화면이 굳고 진행률이 0% 에 멈춰 보인다). 장면마다가 아니라 일한 지 50ms 가 지났을 때만 쉰다:
    // 웹 브라우저는 뒤로 간 탭의 타이머를 1초 넘게 미뤄, 장면마다 쉬면 탭을 바꾸는 순간 장면 수만큼 초가 늘어난다
    const pause = createYield()
    const decodeTotal = plan.needed.reduce((sum, set) => sum + set.size, 0)
    let decoded = 0
    for (const [g, gif] of gifs.entries()) {
      gif.pixels = new Map()
      const users = snapshot.objects.filter((o) => gif.ids.includes(o.id))
      for (const { index, rgba, width, height } of gifFrames(gif.bytes, plan.needed[g])) {
        gif.source = { width, height }
        const scale = Math.min(1, Math.max(...users.map((o) => Math.max(o.w * ratioX / width, o.h * ratioY / height) * Math.max(1, o.crop?.zoom ?? 1))))
        const small = downscaleRgba(rgba, width, height, Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)))
        // 줄이지 않았으면 small.rgba 는 다음 장면에서 덮어쓰는 버퍼라 복사해 둔다
        gif.pixels.set(index, { rgba: small.rgba === rgba ? rgba.slice() : small.rgba, width: small.width, height: small.height })
        onProgress?.({ phase: 'decode', done: ++decoded, total: decodeTotal })
        await pause()
        check()
      }
      gif.bytes = null
    }
    const steps = plan.steps
    const prepared = await preparePageExport(snapshot)
    disposers.push(() => prepared.dispose())
    // 첫 장면만 페이지 전체를 만들고, 그다음은 움직이는 요소가 있는 사각형만 만든다 (다룰 픽셀이 크게 준다).
    // 움직이는 곳이 페이지 대부분이면 rect 가 없고 장면마다 전체를 만든다.
    const rect = animatedRegion(snapshot.objects.filter((o) => gifs.some((gif) => gif.ids.includes(o.id))), snapshot)
    const { pixelWidth: width, pixelHeight: height } = snapshot
    const keyOfStep = (step) => step.indices.join(',')
    const keys = steps.map(keyOfStep), unique = [...new Set(keys)]
    const capture = async (frame) => {
      const result = await renderFrame(frame, { signal })
      try { return await captureRgba(result) } finally { result.dispose() }
    }
    const finish = (assembler) => {
      const output = gifResult(assembler.end())
      const duration = steps.reduce((sum, s) => sum + s.delay, 0) * 10
      return { ...output, width, height, frames: steps.length, duration }
    }
    // 장면 픽셀들로 GIF 를 묶는다. makeRegion(key): 그 장면의 rect 부분, makeFull(key): 그 장면의 페이지 전체
    const assemble = async ({ makeRegion, makeFull }) => {
      const assembler = createGifAssembler(width, height)
      if (rect) {
        onProgress?.({ phase: 'capture', done: 0, total: unique.length + 1 })
        const base = await makeFull(keys[0])
        check()
        const crops = new Map()
        for (let n = 0; n < unique.length; n++) {
          const key = unique[n]
          if (crops.has(key)) continue
          crops.set(key, await makeRegion(key))
          check()
          onProgress?.({ phase: 'capture', done: crops.size + 1, total: unique.length + 1 })
          await pause()
        }
        onProgress?.({ phase: 'encode', done: 0, total: 1 })
        assembler.addColors(base)
        unique.forEach((key) => assembler.addColors(crops.get(key)))
        // 첫 장면도 사각형 부분은 같은 방식으로 만든 것으로 맞춰 둔다 (장면마다 같은 경계)
        const first = crops.get(keys[0])
        for (let y = 0; y < rect.height; y++) base.set(first.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), ((rect.y + y) * width + rect.x) * 4)
        assembler.addFrame(base, steps[0].delay)
        for (let n = 1; n < keys.length; n++) assembler.addFrame(crops.get(keys[n]), steps[n].delay, rect)
        return finish(assembler)
      }
      // 전체 장면은 커서 다 들고 있지 않는다: 색 모으기에서 한 번, 묶을 때 한 번 더 만든다
      const made = new Set()
      for (let n = 0; n < unique.length; n++) {
        const key = unique[n]
        if (made.has(key)) continue
        check()
        onProgress?.({ phase: 'capture', done: made.size, total: unique.length })
        assembler.addColors(await makeFull(key))
        made.add(key)
        await pause()
      }
      let last = null, lastPixels = null
      for (const [n, key] of keys.entries()) {
        onProgress?.({ phase: 'encode', done: n, total: keys.length })
        if (key !== last) { lastPixels = await makeFull(key); last = key }
        assembler.addFrame(lastPixels, steps[n].delay)
        check()
        await pause()
      }
      return finish(assembler)
    }

    // 1) 층 합성
    const gifIndex = new Map()
    gifs.forEach((gif, g) => gif.ids.forEach((id) => gifIndex.set(id, g)))
    const segments = !packingLayout(prepared.template?.backgroundAssetId) && !prepared.region
      && planLayers(prepared.objects, (o) => gifIndex.has(o.id), { hasFrontLayer: Boolean(prepared.template) })
    if (segments) {
      try {
        const layerSegments = segments.filter((s) => s.kind === 'layer')
        const toCapture = layerSegments.filter((l) => l.capture).length
        const layers = []
        for (const layer of layerSegments) {
          if (!layer.capture) { layers.push(null); continue }
          onProgress?.({ phase: 'capture', done: layers.filter(Boolean).length, total: toCapture + unique.length })
          layers.push(await capture({ ...prepared, objects: layer.objects, layer: layer.role }))
          check()
        }
        const ratio = { x: ratioX, y: ratioY }
        const full = { x: 0, y: 0, width, height }
        let indices = null
        const frameOf = (object) => { const g = gifIndex.get(object.id); return { frame: gifs[g].pixels.get(indices[g]), source: gifs[g].source } }
        // Hermes 에서는 화소마다 도는 JS 합성이 가장 오래 걸려 Skia 로 합친다. 못 만들거나 도중에 실패하면 JS 로 이어 간다
        let skiaComposer = null
        if (skia) {
          try {
            skiaComposer = createSkiaComposer(skia, { segments, layers, pageWidth: width, pageHeight: height, ratio, frameOf })
            disposers.push(() => skiaComposer?.dispose())
          } catch (error) { console.warn?.('GIF Skia compose unavailable, composing in JS', error) }
        }
        const compose = (key, region) => {
          indices = key.split(',').map(Number)
          if (skiaComposer) {
            try { return skiaComposer.compose(region) }
            catch (error) {
              console.warn?.('GIF Skia compose failed, composing in JS', error)
              skiaComposer.dispose(); skiaComposer = null
            }
          }
          return composeFrame({ segments, layers, region, pageWidth: width, ratio, frameOf })
        }
        return await assemble({ makeRegion: (key) => compose(key, rect), makeFull: (key) => compose(key, full) })
      } catch (error) {
        if (isCancel(error, signal)) throw error
        // 층 합성이 안 되면(기기에서 투명 층을 못 찍는 등) 예전 방식으로 다시 만든다
        console.warn?.('GIF layer compose failed, falling back to page captures', error)
      }
    }

    // 2) 예전 방식: 장면 조합마다 페이지를 그려 찍는다. 그리려면 장면을 PNG 로 둬야 해서 필요한 장면만 그때 만든다
    const uris = new Map()
    const uriOf = (g, index) => {
      const key = `${g}:${index}`
      if (!uris.has(key)) {
        const { rgba, width: w, height: h } = gifs[g].pixels.get(index)
        const resource = pngResource(rgba, w, h)
        disposers.push(resource.dispose)
        uris.set(key, resource.uri)
      }
      return uris.get(key)
    }
    const frameOf = (key) => {
      const indices = key.split(',').map(Number), sources = new Map()
      gifs.forEach((gif, g) => gif.ids.forEach((id) => sources.set(id, uriOf(g, indices[g]))))
      return { ...prepared, objects: prepared.objects.map((o) => sources.has(o.id) ? { ...o, src: sources.get(o.id) } : o) }
    }
    const area = rect && { x: rect.x / ratioX, y: rect.y / ratioY, width: rect.width / ratioX, height: rect.height / ratioY }
    const inArea = (o) => {
      const angle = (o.rotation ?? 0) * Math.PI / 180, cos = Math.abs(Math.cos(angle)), sin = Math.abs(Math.sin(angle))
      const halfW = (o.w * cos + o.h * sin) / 2 + 40, halfH = (o.w * sin + o.h * cos) / 2 + 40, cx = o.x + o.w / 2, cy = o.y + o.h / 2
      return cx + halfW > area.x && cx - halfW < area.x + area.width && cy + halfH > area.y && cy - halfH < area.y + area.height
    }
    const cropOf = (frame) => ({
      ...frame, objects: frame.objects.filter(inArea), region: area,
      pageWidth: prepared.pageWidth ?? prepared.width, pageHeight: prepared.pageHeight ?? prepared.height,
      width: area.width, height: area.height, pixelWidth: rect.width, pixelHeight: rect.height,
    })
    // 전체 장면은 찍은 결과(파일)를 들고 있다가 묶을 때 다시 푼다
    const captures = new Map()
    const captureFull = async (key) => {
      if (!captures.has(key)) {
        const result = await renderFrame(frameOf(key), { signal })
        disposers.push(() => result.dispose())
        captures.set(key, result)
      }
      return captureRgba(captures.get(key))
    }
    return await assemble({
      makeRegion: (key) => capture(cropOf(frameOf(key))),
      makeFull: rect ? (key) => capture(frameOf(key)) : captureFull,
    })
  } catch (error) {
    if (error instanceof PageExportError || signal?.aborted) throw error
    throw new PageExportError('EXPORT_GIF_FAILED', 'GIF를 만들지 못했어요. 다시 시도해 주세요.', error)
  } finally {
    disposers.reverse().forEach((dispose) => { try { dispose() } catch {} })
  }
}
