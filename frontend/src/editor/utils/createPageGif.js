import { mediaService } from '../services/mediaStore'
import { mediaId } from './mediaReferences.js'
import { isAnimatedMedia } from '../stickerAssets'
import { readLegacyExportImage } from './exportImage'
import { preparePageExport } from './preparePageExport'
import { PageExportError } from './pageExport.js'
import { animatedRegion, createGifAssembler, createYield, downscaleRgba, GIF_TIME_BUDGET, gifFrameDelays, gifFrames, limitStepsToDecoded, planGifTimeline, reshapeSteps, thinSteps } from './gifExport.js'
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

/**
 * 페이지 한 장을 움직이는 GIF 로 만든다. GIF 마다 장면을 풀어 보이는 크기의 PNG 로 두고, 장면 조합이 바뀔 때마다
 * renderFrame(준비된 snapshot) 으로 찍은 뒤(첫 장면만 페이지 전체, 나머지는 움직이는 곳만), 찍은 장면들을 한 GIF 로 묶는다.
 * onProgress({ phase, done, total }) 로 진행을 알린다. 반환값은 dispose 해야 한다.
 */
export async function createPageGif(snapshot, { renderFrame, onProgress, signal }) {
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
    // 1분 안에 끝내기: 시작부터 시간을 재서, 늦어지면 장면 수를 줄인다 (GIF_TIME_BUDGET)
    const started = Date.now(), elapsed = () => Date.now() - started
    let reduced = false
    const ratioX = snapshot.pixelWidth / snapshot.width, ratioY = snapshot.pixelHeight / snapshot.height
    const gifs = []
    for (const group of groups.values()) {
      const bytes = await readGifBytes(group.object)
      check()
      gifs.push({ ...group, bytes, delays: gifFrameDelays(bytes) })
    }
    const plan = planGifTimeline(gifs.map((g) => g.delays))
    // GIF 마다 필요한 장면만, 페이지에 보이는 크기(출력 픽셀 기준, 자르기 확대 포함)로 줄여 PNG 로.
    // 장면 하나 풀고 PNG 로 만드는 일이 JS 스레드를 오래 잡으므로, 쉬어 가며 진행률을 알린다
    // (안 쉬면 큰 GIF 에서 화면이 굳고 진행률이 0% 에 멈춰 보인다). 장면마다가 아니라 일한 지 50ms 가 지났을 때만 쉰다:
    // 웹 브라우저는 뒤로 간 탭의 타이머를 1초 넘게 미뤄, 장면마다 쉬면 탭을 바꾸는 순간 장면 수만큼 초가 늘어난다
    const pause = createYield()
    const decodeTotal = plan.needed.reduce((sum, set) => sum + set.size, 0)
    let decoded = 0
    for (const [g, gif] of gifs.entries()) {
      gif.frames = new Map()
      const users = snapshot.objects.filter((o) => gif.ids.includes(o.id))
      for (const { index, rgba, width, height } of gifFrames(gif.bytes, plan.needed[g])) {
        // 너무 오래 걸리면 뒤 장면은 풀지 않는다 (GIF 마다 첫 장면은 꼭 푼다). 못 푼 장면은 아래에서 앞 장면으로 대신한다
        if (gif.frames.size && elapsed() > GIF_TIME_BUDGET.decodeStop) { reduced = true; break }
        const scale = Math.min(1, Math.max(...users.map((o) => Math.max(o.w * ratioX / width, o.h * ratioY / height) * Math.max(1, o.crop?.zoom ?? 1))))
        const small = downscaleRgba(rgba, width, height, Math.max(1, Math.ceil(width * scale)), Math.max(1, Math.ceil(height * scale)))
        const resource = pngResource(small.rgba, small.width, small.height)
        disposers.push(resource.dispose)
        gif.frames.set(index, resource.uri)
        onProgress?.({ phase: 'decode', done: ++decoded, total: decodeTotal })
        await pause()
        check()
      }
      gif.bytes = null
    }
    let steps = reduced ? limitStepsToDecoded(plan.steps, gifs.map((gif) => new Set(gif.frames.keys()))) : plan.steps
    const prepared = await preparePageExport(snapshot)
    disposers.push(() => prepared.dispose())
    const frameOf = (key) => {
      const indices = key.split(',').map(Number), sources = new Map()
      gifs.forEach((gif, g) => gif.ids.forEach((id) => sources.set(id, gif.frames.get(indices[g]))))
      return { ...prepared, objects: prepared.objects.map((o) => sources.has(o.id) ? { ...o, src: sources.get(o.id) } : o) }
    }
    // 첫 장면만 페이지 전체를 찍고, 그다음은 움직이는 요소가 있는 사각형만 찍는다 (찍고 풀 픽셀이 크게 준다).
    // 움직이는 곳이 페이지 대부분이면 rect 가 없고 장면마다 전체를 찍는다.
    const rect = animatedRegion(snapshot.objects.filter((o) => gifs.some((gif) => gif.ids.includes(o.id))), snapshot)
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
    const capture = async (frame) => {
      const result = await renderFrame(frame, { signal })
      try { return await captureRgba(result) } finally { result.dispose() }
    }
    const keyOfStep = (step) => step.indices.join(',')
    let keys = steps.map(keyOfStep), unique = [...new Set(keys)]
    // 첫 장면을 찍어 본 시간(perFrame: 장면 하나를 찍고 묶는 데 드는 예상 시간)으로, captureFit 까지 다 찍을 수 있게 장면을 솎는다
    const fit = (perFrame) => {
      const room = Math.floor((GIF_TIME_BUDGET.captureFit - elapsed()) / Math.max(1, perFrame)) + 1
      const thinned = thinSteps(steps, Math.max(2, room))
      if (thinned !== steps) { steps = thinned; reduced = true; keys = steps.map(keyOfStep); unique = [...new Set(keys)] }
    }
    // 그래도 captureStop 을 넘기면 찍기를 멈추고, 찍지 못한 장면은 빼고 앞 장면을 그만큼 더 보여 준다
    const keepCaptured = (captured) => {
      reduced = true
      steps = reshapeSteps(steps, (step) => (captured.has(keyOfStep(step)) ? step.indices : null))
      keys = steps.map(keyOfStep); unique = [...new Set(keys)]
    }
    const overTime = () => elapsed() > GIF_TIME_BUDGET.captureStop
    const { pixelWidth: width, pixelHeight: height } = snapshot
    const assembler = createGifAssembler(width, height)
    if (rect) {
      onProgress?.({ phase: 'capture', done: 0, total: unique.length + 1 })
      const base = await capture(frameOf(keys[0]))
      check()
      const crops = new Map()
      for (let n = 0; n < unique.length; n++) {
        const key = unique[n]
        if (crops.has(key)) continue
        if (n > 0 && overTime()) { keepCaptured(crops); break }
        const startedAt = Date.now()
        crops.set(key, await capture(cropOf(frameOf(key))))
        check()
        // 사각형 장면 하나 찍는 시간 + 묶는 시간(대략 절반)
        if (n === 0) fit((Date.now() - startedAt) * 1.5)
        onProgress?.({ phase: 'capture', done: crops.size + 1, total: unique.length + 1 })
        await pause()
      }
      onProgress?.({ phase: 'encode', done: 0, total: 1 })
      assembler.addColors(base)
      unique.forEach((key) => assembler.addColors(crops.get(key)))
      // 첫 장면도 사각형 부분은 같은 방식으로 찍은 것으로 맞춰 둔다 (장면마다 같은 경계)
      const first = crops.get(keys[0])
      for (let y = 0; y < rect.height; y++) base.set(first.subarray(y * rect.width * 4, (y + 1) * rect.width * 4), ((rect.y + y) * width + rect.x) * 4)
      assembler.addFrame(base, steps[0].delay)
      for (let n = 1; n < keys.length; n++) assembler.addFrame(crops.get(keys[n]), steps[n].delay, rect)
    } else {
      // 같은 장면 조합은 한 번만 찍는다. 전체 장면은 커서 풀어 둔 픽셀을 다 들고 있지 않고 묶을 때 다시 푼다
      const captures = new Map()
      for (let n = 0; n < unique.length; n++) {
        const key = unique[n]
        if (captures.has(key)) continue
        check()
        if (n > 0 && overTime()) { keepCaptured(captures); break }
        onProgress?.({ phase: 'capture', done: captures.size, total: unique.length })
        const startedAt = Date.now()
        const result = await renderFrame(frameOf(key), { signal })
        disposers.push(() => result.dispose())
        captures.set(key, result)
        if (n === 0) {
          // 장면 하나 찍는 시간 + 묶을 때 두 번 푸는 시간(+색 모으기·압축)으로 어림한다
          const rendered = Date.now()
          await captureRgba(result)
          fit((rendered - startedAt) + (Date.now() - rendered) * 3)
        }
      }
      for (const [n, key] of unique.entries()) {
        onProgress?.({ phase: 'encode', done: n, total: unique.length + keys.length })
        assembler.addColors(await captureRgba(captures.get(key)))
        check()
      }
      let last = null, lastPixels = null
      for (const [n, key] of keys.entries()) {
        onProgress?.({ phase: 'encode', done: unique.length + n, total: unique.length + keys.length })
        if (key !== last) { lastPixels = await captureRgba(captures.get(key)); last = key }
        assembler.addFrame(lastPixels, steps[n].delay)
        check()
      }
    }
    const output = gifResult(assembler.end())
    const duration = steps.reduce((sum, s) => sum + s.delay, 0) * 10
    // reduced: 시간이 모자라 장면을 줄였다 (움직임이 덜 부드럽다)
    return { ...output, width, height, frames: steps.length, duration, reduced }
  } catch (error) {
    if (error instanceof PageExportError || signal?.aborted) throw error
    throw new PageExportError('EXPORT_GIF_FAILED', 'GIF를 만들지 못했어요. 다시 시도해 주세요.', error)
  } finally {
    disposers.reverse().forEach((dispose) => { try { dispose() } catch {} })
  }
}
