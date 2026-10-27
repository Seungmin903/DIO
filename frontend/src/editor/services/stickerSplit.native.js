import { Platform } from 'react-native'
import { requireOptionalNativeModule } from 'expo'
import { randomUUID } from 'expo-crypto'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { File, Paths } from 'expo-file-system'
import { selectImages } from '../utils/mediaPicker'
import { splitAvailable, SPLIT_API_VERSION, MAX_SPLIT_PIXELS, validateSplitOptions } from '../utils/stickerSplit.js'

// __DEV__ alone is insufficient: Expo Go and old development builds have no module.
let native = null
if (__DEV__ && process.env.EXPO_PUBLIC_DISABLE_STICKER_SPLIT !== '1') {
  try { native = requireOptionalNativeModule('DioStickerSplit') } catch { /* Keep Expo Go bootable. */ }
}
const baseAvailable = splitAvailable({ development: __DEV__, platform: Platform.OS, module: native, disabled: process.env.EXPO_PUBLIC_DISABLE_STICKER_SPLIT === '1' })
const completeRegions = baseAvailable && Platform.OS === 'android' && native?.completeRegionVersion === 1 &&
  ['inspectInput', 'prepareImage'].every(key => typeof native[key] === 'function')
const available = baseAvailable && (Platform.OS !== 'android' || completeRegions)
const jobs = new Map()
function requireSupport() { if (!available) throw new Error('자동 분리 모듈이 포함된 개발 빌드를 설치해 주세요.') }
function start(work) {
  requireSupport()
  const id = randomUUID()
  const promise = Promise.resolve().then(() => work(id))
  jobs.set(id, promise)
  return { id, promise }
}
export const stickerSplit = {
  available,
  completeRegions,
  selectionEditing: available && Platform.OS === 'android' && native?.selectionEditingVersion === 1 &&
    ['groupEdges', 'brushHits'].every(key => typeof native[key] === 'function'),
  reason: baseAvailable && Platform.OS === 'android' && !completeRegions
    ? '영역 안에 완전히 들어온 그림만 분리하려면 새 Android 개발 APK를 업데이트 설치해 주세요. Reload만으로는 업데이트되지 않아요.'
    : native && native.apiVersion !== SPLIT_API_VERSION
    ? `설치된 스티커 모듈은 버전 ${native.apiVersion}이에요. 새 개발 APK(모듈 ${SPLIT_API_VERSION})를 업데이트 설치해 주세요. Reload만으로는 업데이트되지 않아요.`
    : '스티커 자동 분리는 처리 모듈이 포함된 DIO 개발 빌드에서 사용할 수 있어요.',
  async pick() {
    requireSupport()
    const result = await selectImages({ multiple: false })
    if (result.canceled || !result.assets?.length) return null
    const asset = result.assets[0]
    if (Platform.OS !== 'android' && (asset.mimeType === 'image/gif' || /\.gif$/i.test(asset.fileName ?? ''))) throw new Error('자동 분리는 정지 이미지를 선택해 주세요. GIF는 기존 이미지 추가를 이용해 주세요.')
    const maxPixels = Platform.OS === 'android' ? MAX_SPLIT_PIXELS : 8_000_000
    if (asset.fileSize > 50 * 1024 * 1024) throw new Error('자동 분리 이미지는 50MiB까지 선택할 수 있어요.')
    if (Platform.OS === 'android') {
      let copy = new File(Paths.cache, `dio-sheet-${randomUUID()}`), preparedJob
      try {
        await new File(asset.uri).copy(copy)
        if (copy.size > 50 * 1024 * 1024) throw new Error('자동 분리 이미지는 50MiB까지 선택할 수 있어요.')
        const extension = await native.inspectInput(copy.uri)
        const typed = new File(Paths.cache, `dio-sheet-${randomUUID()}.${extension}`)
        await copy.move(typed); copy = typed
        preparedJob = start(async id => JSON.parse(await native.prepareImage(copy.uri, id)))
        const info = await preparedJob.promise
        return { uri: copy.uri, ...info, preparationJobId: preparedJob.id, name: (asset.fileName ?? '스티커').replace(/\.[^.]+$/, '') }
      } catch (error) {
        if (preparedJob) await this.cleanup([preparedJob.id])
        try { if (copy.exists) copy.delete() } catch {}; throw error
      }
    }
    if (!asset.width || !asset.height || asset.width * asset.height > maxPixels) throw new Error('IMAGE_TOO_LARGE')
    // Orientation is baked into a temporary PNG. No resize: even one-pixel dots survive.
    const prepared = await manipulateAsync(asset.uri, [], { format: SaveFormat.PNG, compress: 1 })
    return { ...prepared, name: (asset.fileName ?? '스티커').replace(/\.[^.]+$/, '') }
  },
  analyze(uri, options) {
    validateSplitOptions(options)
    return start(async id => JSON.parse(await native.analyze(uri, JSON.stringify(options), id)))
  },
  merge(parts) { return start(async id => JSON.parse(await native.merge(JSON.stringify(parts), id))) },
  groupEdges(parts, distance) { return start(async id => JSON.parse(await native.groupEdges(JSON.stringify(parts), distance, id))) },
  brushHits(parts, path, radius) { return start(async id => JSON.parse(await native.brushHits(JSON.stringify(parts), JSON.stringify(path), radius, id))) },
  cancel(id) { if (available && jobs.has(id)) native.cancel(id) },
  async cleanup(ids) {
    // Geometry jobs also read candidates created by analyze. Wait for the whole
    // batch before removing any producer's files, including on modal unmount.
    await Promise.all(ids.map(id => jobs.get(id)?.catch(() => {})))
    for (const id of ids) {
      // Never delete files while the native worker is writing them.
      await jobs.get(id)?.catch(() => {})
      if (available) await native.cleanup(id).catch(() => {})
      jobs.delete(id)
    }
  },
  async disposeSource(source) {
    const uri = typeof source === 'string' ? source : source.uri
    try { const file = new File(uri); if (file.exists) file.delete() } catch { /* OS cache cleanup can recover a leftover. */ }
    if (source?.preparationJobId) await this.cleanup([source.preparationJobId])
  },
}
