import { STORAGE_KEYS } from '../utils/storageContract.js'
import { checkStorageLimit } from '../../shared/freeTierLimits.js'

const PHOTO_INDEX = 'dio:guest:photo-library:v1'

export async function guestPhotoIds(storage, entries) {
  const available = new Set((await entries({ idsOnly: true })).map(entry => entry.id))
  const saved = JSON.parse(await storage.getItem(PHOTO_INDEX) ?? '[]')
  if (!Array.isArray(saved)) throw Error('기기의 사진 보관함을 확인하지 못했어요.')
  const ids = new Set(saved.filter(id => available.has(id)))
  const add = photo => {
    const id = photo?.mediaFileId ?? (typeof photo?.src === 'string' && photo.src.startsWith('media:') ? photo.src.slice(6) : null)
    if (available.has(id)) ids.add(id)
  }
  const keys = await storage.getAllKeys()
  for (const key of keys) {
    if (key !== STORAGE_KEYS.doc && !key.startsWith(`${STORAGE_KEYS.doc}:`)) continue
    // PDF·저장 작업용 보조 키는 편집 문서가 아니다.
    if (key.slice(STORAGE_KEYS.doc.length + 1).includes(':')) continue
    const doc = JSON.parse(await storage.getItem(key) ?? 'null')
    for (const page of doc?.pages ?? []) {
      for (const object of page.objects ?? []) {
        if (object.type !== 'photo') continue
        add(object)
        for (const cell of object.cells ?? []) add(cell)
      }
    }
  }
  const decor = JSON.parse(await storage.getItem(STORAGE_KEYS.customDecor) ?? 'null')
  for (const photo of decor?.recentPhotos ?? []) add(photo)
  const diaries = JSON.parse(await storage.getItem(STORAGE_KEYS.diaries) ?? '[]')
  for (const diary of diaries) add(diary.cover?.photo)
  return ids
}

export function checkGuestPhotoCapacity(ids, adding = 1) {
  checkStorageLimit('photo', ids.size + adding)
}

export async function rememberGuestPhotos(storage, ids, photos) {
  await storage.setItem(PHOTO_INDEX, JSON.stringify([...new Set([...ids, ...photos.map(photo => photo.mediaFileId)])]))
}
