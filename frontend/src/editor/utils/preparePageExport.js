import { Asset } from 'expo-asset'
import { loadTemplate } from '../templates/loadTemplate'
import { mediaService } from '../services/mediaStore'
import { mediaId } from './mediaReferences.js'
import { STICKER_ASSETS } from '../stickerAssets'
import { exportImage, readLegacyExportImage } from './exportImage'
import { prepareExportSnapshot, PageExportError } from './pageExport.js'
import { selectExportRaster } from './exportSampling.js'

export function preparePageExport(snapshot) {
  return prepareExportSnapshot(snapshot, async (object, usages) => {
    const id = mediaId(object)
    if (id) {
      const selected = selectExportRaster(await mediaService.get(id), usages, snapshot)
      return { ...await exportImage(selected), qualityWarning: selected.qualityWarning }
    }
    let uri = object.src
    if (object.asset) {
      const module = STICKER_ASSETS[object.asset]
      if (!module) throw new PageExportError('EXPORT_MEDIA_MISSING', '기본 스티커를 찾을 수 없어요.')
      const asset = Asset.fromModule(module)
      await asset.downloadAsync()
      uri = asset.localUri ?? asset.uri
    }
    if (!uri) throw new PageExportError('EXPORT_MEDIA_MISSING', '요소의 원본 이미지를 찾을 수 없어요.')
    const input = await readLegacyExportImage(uri)
    try {
      const resource = await exportImage(selectExportRaster(input, usages, snapshot))
      return { ...resource, dispose() { try { resource.dispose?.() } finally { input.dispose?.() } } }
    } catch (error) { input.dispose?.(); throw error }
  }, loadTemplate)
}
