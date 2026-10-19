// 문서에는 media:{UUID} 참조만, 원본·메타데이터는 플랫폼 보관소에 저장한다.
import { Platform } from 'react-native'
import { randomUUID } from 'expo-crypto'
import * as repository from './mediaRepository'
import { createMediaImporter } from './mediaImport.js'
import { MediaError } from './mediaPolicy.js'
import { collectMediaIds, createMediaRegistry, isMediaRef, mediaId, mediaReference } from './mediaReferences.js'

export { isMediaRef }
export function reportMediaDisplayError(item) {
  const id = mediaId(item)
  if (id) mediaRegistry.fail(id, new MediaError('MEDIA_CORRUPT', '이미지를 표시하지 못했어요. 원본 파일을 다시 선택해 주세요.'))
}
export const mediaRegistry = createMediaRegistry({
  async load(id) {
    const { media, blob, displayBlob } = await repository.get(id)
    const source = displayBlob ?? blob
    await repository.verifyDisplay(source)
    return { media, uri: Platform.OS === 'web' ? URL.createObjectURL(source) : source.uri }
  },
  release(uri) { if (Platform.OS === 'web') URL.revokeObjectURL(uri) },
})

export function mediaUri(item, { still = false } = {}) {
  const source = still && item?.poster ? item.poster : item
  const id = mediaId(source)
  if (id) {
    const entry = mediaRegistry.get(id)
    return entry?.status === 'ready' ? entry.uri : null
  }
  return typeof source === 'string' ? source : source?.src ?? null
}

const importer = createMediaImporter({ ...repository, createId: randomUUID })
export async function importMedia(assets, options) {
  const items = await importer(assets, options)
  return items.map(({ uri, ...media }) => {
    mediaRegistry.seed(media.mediaFileId, { uri, media })
    return { ...media, src: mediaReference(media.mediaFileId) }
  })
}

export const mediaService = {
  async import(asset) { return (await importMedia([asset]))[0] },
  get: repository.get,
  resolveDisplay: (id) => mediaRegistry.ensure(id),
}

export async function hydrateMedia(references) {
  const ids = collectMediaIds(references)
  const results = await Promise.allSettled(ids.map((id) => mediaRegistry.ensure(id)))
  return {
    loaded: ids.filter((_, index) => results[index].status === 'fulfilled'),
    failures: ids.flatMap((id, index) => results[index].status === 'rejected' ? [{ mediaFileId: id, error: results[index].reason }] : []),
  }
}

// 보관함용 파생 썸네일. 원본이나 최종 PNG 내보내기용 데이터가 아니다.
export async function makePoster(blob, maxSize = 160) {
  if (Platform.OS !== 'web' || typeof createImageBitmap === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(blob)
    try {
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      return canvas.toDataURL('image/png')
    } finally { bitmap.close?.() }
  } catch { return null }
}
