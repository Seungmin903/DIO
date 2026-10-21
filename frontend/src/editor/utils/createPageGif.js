import { Asset } from 'expo-asset'
import { mediaService } from '../services/mediaStore'
import { mediaId } from './mediaReferences.js'
import { STICKER_ASSETS, isAnimatedMedia } from '../stickerAssets'
import { readLegacyExportImage } from './exportImage'
import { preparePageExport } from './preparePageExport'
import { PageExportError } from './pageExport.js'
import { createGifAssembler, decodeGifFrames, gifFrameDelays, planGifTimeline } from './gifExport.js'
import { captureRgba, gifResult, pngResource, readBytes } from './gifFileIO'

const keyOf = (o) => o.mediaFileId ? `media:${o.mediaFileId}` : o.asset ? `asset:${o.asset}` : o.src

/** 이 페이지에 움직이는 GIF(스티커·사진)가 있는지 */
export const pageHasAnimation = (page) => page.objects.some((o) => !o.hidden && o.opacity !== 0 && isAnimatedMedia(o))

async function readGifBytes(object) {
  const id = mediaId(object)
  if (id) return readBytes((await mediaService.get(id)).blob)
  let uri = object.src
  if (object.asset) {
    const asset = Asset.fromModule(STICKER_ASSETS[object.asset])
    await asset.downloadAsync()
    uri = asset.localUri ?? asset.uri
  }
  const input = await readLegacyExportImage(uri)
  try { return await readBytes(input.blob) } finally { input.dispose?.() }
}

/**
 * 페이지 한 장을 움직이는 GIF 로 만든다. GIF 마다 장면을 풀어 PNG 로 두고, 장면 조합이 바뀔 때마다
 * renderFrame(준비된 snapshot) 으로 페이지를 찍은 뒤, 찍은 장면들을 한 GIF 로 묶는다.
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
    const gifs = []
    for (const group of groups.values()) {
      const bytes = await readGifBytes(group.object)
      check()
      gifs.push({ ...group, bytes, delays: gifFrameDelays(bytes) })
    }
    const plan = planGifTimeline(gifs.map((g) => g.delays))
    // GIF 마다 필요한 장면만 PNG 로
    gifs.forEach((gif, g) => {
      gif.frames = new Map()
      decodeGifFrames(gif.bytes, plan.needed[g], (index, rgba, width, height) => {
        const resource = pngResource(rgba, width, height)
        disposers.push(resource.dispose)
        gif.frames.set(index, resource.uri)
      })
      gif.bytes = null
    })
    check()
    const prepared = await preparePageExport(snapshot)
    disposers.push(() => prepared.dispose())
    // 같은 장면 조합은 한 번만 찍는다
    const captures = new Map()
    const keys = plan.steps.map((step) => step.indices.join(','))
    const unique = [...new Set(keys)]
    for (const [n, key] of unique.entries()) {
      check()
      onProgress?.({ phase: 'capture', done: n, total: unique.length })
      const indices = key.split(',').map(Number)
      const sources = new Map()
      gifs.forEach((gif, g) => gif.ids.forEach((id) => sources.set(id, gif.frames.get(indices[g]))))
      const frame = { ...prepared, objects: prepared.objects.map((o) => sources.has(o.id) ? { ...o, src: sources.get(o.id) } : o) }
      const result = await renderFrame(frame, { signal })
      disposers.push(() => result.dispose())
      captures.set(key, result)
    }
    check()
    const { width, height } = captures.get(keys[0])
    const assembler = createGifAssembler(width, height)
    // 1단계: 모든 장면의 색으로 팔레트, 2단계: 장면을 순서대로 묶기 (픽셀은 그때그때 다시 읽어 메모리를 아낀다)
    for (const [n, key] of unique.entries()) {
      onProgress?.({ phase: 'encode', done: n, total: unique.length + keys.length })
      assembler.addColors(await captureRgba(captures.get(key)))
      check()
    }
    let last = null, lastPixels = null
    for (const [n, key] of keys.entries()) {
      onProgress?.({ phase: 'encode', done: unique.length + n, total: unique.length + keys.length })
      if (key !== last) { lastPixels = await captureRgba(captures.get(key)); last = key }
      assembler.addFrame(lastPixels, plan.steps[n].delay)
      check()
    }
    const output = gifResult(assembler.end())
    const duration = plan.steps.reduce((sum, s) => sum + s.delay, 0) * 10
    return { ...output, width, height, frames: plan.steps.length, duration }
  } catch (error) {
    if (error instanceof PageExportError || signal?.aborted) throw error
    throw new PageExportError('EXPORT_GIF_FAILED', 'GIF를 만들지 못했어요. 다시 시도해 주세요.', error)
  } finally {
    disposers.reverse().forEach((dispose) => { try { dispose() } catch {} })
  }
}
