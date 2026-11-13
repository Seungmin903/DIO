import { STORAGE_KEYS } from '../utils/storageContract.js'
import { checkStorageLimit } from '../../shared/freeTierLimits.js'

const PHOTO_INDEX = 'dio:guest:photo-library:v1'

const readFailure = key => Object.assign(
  new Error(`기기의 사진 집계 기록을 읽지 못했어요. 문제가 있는 저장 기록: ${key}. 해당 기록을 확인한 뒤 다시 시도해 주세요.`),
  { code: 'GUEST_PHOTO_INDEX_DAMAGED', storageKey: key },
)

function readRecord(raw, key) {
  try { return raw ? JSON.parse(raw) : null }
  catch { throw readFailure(key) }
}

async function saveIndex(storage, ids, recovery = {}) {
  await storage.setItem(PHOTO_INDEX, JSON.stringify({ version: 2, ids: [...ids], ...recovery }))
}

export async function guestPhotoIds(storage, entries) {
  const available = new Set((await entries({ idsOnly: true })).map(entry => entry.id))
  const raw = await storage.getItem(PHOTO_INDEX)
  let saved
  try { saved = raw ? JSON.parse(raw) : null } catch { saved = null }
  const valid = saved?.version === 2 && Array.isArray(saved.ids) && saved.ids.every(id => typeof id === 'string')
  const scannedIds = new Set(valid && Array.isArray(saved.scannedIds) ? saved.scannedIds : [])
  if (valid && !saved.needsRescan && [...available].every(id => scannedIds.has(id))) {
    return new Set(saved.ids.filter(id => available.has(id)))
  }
  const prior = valid ? saved.ids
    : Array.isArray(saved) && saved.every(id => typeof id === 'string') ? saved : raw ? [...available] : []
  const ids = new Set(prior.filter(id => typeof id === 'string' && available.has(id)))
  let damaged = false
  const inspect = async (key, collect) => {
    const raw = await storage.getItem(key)
    try { collect(readRecord(raw, key)) }
    catch (error) {
      if (error.code !== 'GUEST_PHOTO_INDEX_DAMAGED') throw error
      damaged = true
    }
  }
  const add = photo => {
    const id = photo?.mediaFileId ?? (typeof photo?.src === 'string' && photo.src.startsWith('media:') ? photo.src.slice(6) : null)
    if (available.has(id)) ids.add(id)
  }
  const keys = await storage.getAllKeys()
  for (const key of keys) {
    if (key !== STORAGE_KEYS.doc && !key.startsWith(`${STORAGE_KEYS.doc}:`)) continue
    // PDF·저장 작업용 보조 키는 편집 문서가 아니다.
    if (key.slice(STORAGE_KEYS.doc.length + 1).includes(':')) continue
    await inspect(key, doc => {
      if (doc !== null && (!doc || !Array.isArray(doc.pages))) throw readFailure(key)
      for (const page of doc?.pages ?? []) {
        if (!page || (page.objects != null && !Array.isArray(page.objects))) throw readFailure(key)
        for (const object of page.objects ?? []) {
          if (!object || (object.cells != null && !Array.isArray(object.cells))) throw readFailure(key)
          if (object.type !== 'photo') continue
          add(object)
          for (const cell of object.cells ?? []) add(cell)
        }
      }
    })
  }
  await inspect(STORAGE_KEYS.customDecor, decor => {
    if (decor !== null && (typeof decor !== 'object' || Array.isArray(decor))) throw readFailure(STORAGE_KEYS.customDecor)
    if (decor?.recentPhotos != null && !Array.isArray(decor.recentPhotos)) throw readFailure(STORAGE_KEYS.customDecor)
    for (const photo of decor?.recentPhotos ?? []) add(photo)
  })
  await inspect(STORAGE_KEYS.diaries, value => {
    const diaries = value ?? []
    if (!Array.isArray(diaries)) throw readFailure(STORAGE_KEYS.diaries)
    for (const diary of diaries) add(diary?.cover?.photo)
  })
  // 손상 문서는 보존한다. 알 수 없는 사진을 0장으로 세지 않도록 남은 기기 파일을 보수적으로 합산한다.
  if (damaged) for (const id of available) ids.add(id)
  const recovery = { scannedIds: [...available], ...(damaged ? { needsRescan: true } : {}) }
  await saveIndex(storage, ids, recovery)
  return ids
}

export function checkGuestPhotoCapacity(ids, adding = 1) {
  checkStorageLimit('photo', ids.size + adding)
}

export async function rememberGuestPhotos(storage, ids, photos) {
  const saved = readRecord(await storage.getItem(PHOTO_INDEX), PHOTO_INDEX)
  const added = photos.map(photo => photo.mediaFileId)
  const recovery = { scannedIds: [...new Set([...(saved?.scannedIds ?? []), ...added])], ...(saved?.needsRescan ? { needsRescan: true } : {}) }
  await saveIndex(storage, new Set([...ids, ...added]), recovery)
}
