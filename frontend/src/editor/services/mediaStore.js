// 문서에는 media:{UUID} 참조만, 원본·메타데이터는 플랫폼 보관소에 저장한다.
import {retryRemoteMedia} from './mediaRetry.js'
import { Platform } from 'react-native'
import { randomUUID } from 'expo-crypto'
import * as repository from '../utils/mediaRepository'
import { createMediaImporter } from '../utils/mediaImport.js'
import { MediaError } from '../utils/mediaPolicy.js'
import { collectMediaIds, createMediaRegistry, isMediaRef, mediaId, mediaReference } from '../utils/mediaReferences.js'

export { isMediaRef }
export function reportMediaDisplayError(item) {
  const id = mediaId(item)
  if (id) mediaRegistry.fail(id, new MediaError('MEDIA_CORRUPT', '이미지를 표시하지 못했어요. 원본 파일을 다시 선택해 주세요.'))
}
// 보관함처럼 한꺼번에 여러 장을 열 때 저장소 읽기가 한 번에 몰리지 않게 8장씩 읽는다.
// 표시 전 디코딩 검사(Image.getSize)는 하지 않는다: 안드로이드에서 원본을 통째로 풀어 보관함 썸네일이 줄줄이 늦게 떴다.
// 깨진 파일은 실제로 그리는 쪽의 onError → reportMediaDisplayError 로 같은 오류 상태가 된다.
const LOAD_LIMIT = 8
let loading = 0
const waiting = []
async function limited(task) {
  if (loading >= LOAD_LIMIT) await new Promise(resolve => waiting.push(resolve))
  loading += 1
  try { return await task() } finally { loading -= 1; waiting.shift()?.() }
}

export const mediaRegistry = createMediaRegistry({
  load: id => limited(async () => {
    const { media, blob, displayBlob } = await repository.get(id)
    const source = displayBlob ?? blob
    return { media, uri: Platform.OS === 'web' ? URL.createObjectURL(source) : source.uri }
  }),
  release(uri) { if (Platform.OS === 'web') URL.revokeObjectURL(uri) },
  // 보관함을 닫았다 다시 열 때 다시 읽지 않도록 잠시 더 들고 있는다 (앱 파일 경로는 메모리를 거의 쓰지 않는다)
  idleMs: Platform.OS === 'web' ? 60000 : 300000,
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

/** Only freshly imported, not-yet-published generator results may be rolled back. */
export async function discardGeneratedMedia(items) {
  await Promise.allSettled(items.map(item => repository.remove(item.mediaFileId)))
}

export const mediaService = {
  async import(asset) { return (await importMedia([asset]))[0] },
  get: repository.get,
  resolveDisplay: (id) => mediaRegistry.ensure(id),
  async retryDisplay(id) { await retryRemoteMedia(id); return mediaRegistry.ensure(id) },
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
