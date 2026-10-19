// 문서에는 media:{UUID} 참조만, 원본·메타데이터는 플랫폼 보관소에 저장한다.
import { Platform } from 'react-native'
import { randomUUID } from 'expo-crypto'
import * as repository from './mediaRepository'
import { createMediaImporter } from './mediaImport.js'

const PREFIX = 'media:'
const urls = new Map()
export const isMediaRef = (src) => typeof src === 'string' && src.startsWith(PREFIX)
export function mediaUri(src) {
  return isMediaRef(src) ? urls.get(src.slice(PREFIX.length)) ?? null : src
}

const importer = createMediaImporter({ ...repository, createId: randomUUID })
export async function importMedia(assets, options) {
  const items = await importer(assets, options)
  return items.map(({ uri, ...media }) => {
    urls.set(media.mediaFileId, uri)
    return { ...media, src: PREFIX + media.mediaFileId }
  })
}

export const mediaService = {
  async import(asset) { return (await importMedia([asset]))[0] },
  get: repository.get,
}

let hydrating = null
export function hydrateMedia() {
  if (!hydrating) hydrating = repository.entries().then((items) => {
    items.forEach(({ id, uri }) => {
      if (!urls.has(id)) urls.set(id, uri)
      else if (Platform.OS === 'web') URL.revokeObjectURL(uri)
    })
  }).catch(() => { hydrating = null }) // 기존 문서는 열되 조회 API는 오류를 반환한다.
  return hydrating
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
