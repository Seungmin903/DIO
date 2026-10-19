import { Asset } from 'expo-asset'
import { mediaService } from './mediaStore'
import { mediaId } from './mediaReferences.js'
import { STICKER_ASSETS } from '../stickerAssets'
import { exportImage, readLegacyExportImage } from './exportImage'
import { prepareExportSnapshot, PageExportError } from './pageExport.js'

export function preparePageExport(snapshot) {
  return prepareExportSnapshot(snapshot, async (object) => {
    const id = mediaId(object)
    if (id) return exportImage(await mediaService.get(id))
    let uri = object.src
    if (object.asset) {
      const module = STICKER_ASSETS[object.asset]
      if (!module) throw new PageExportError('EXPORT_MEDIA_MISSING', '기본 스티커를 찾을 수 없어요.')
      const asset = Asset.fromModule(module)
      await asset.downloadAsync()
      uri = asset.localUri ?? asset.uri
    }
    if (!uri) throw new PageExportError('EXPORT_MEDIA_MISSING', '요소의 원본 이미지를 찾을 수 없어요.')
    return exportImage(await readLegacyExportImage(uri))
  })
}
