import { MediaError, storageError } from './mediaPolicy.js'
import { validateStoredOriginal } from './mediaRecovery.js'
export { decode, createDisplay, dispose, verifyDisplay } from './mediaProcessing.web.js'

const DB_NAME = 'dio-media'
let opening
function openDb() {
  if (!opening) opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new MediaError('STORAGE_UNAVAILABLE', '이 브라우저에서는 로컬 이미지 저장을 사용할 수 없어요.'))
    const request = indexedDB.open(DB_NAME, 3)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs')
      if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata')
      if (!db.objectStoreNames.contains('displays')) db.createObjectStore('displays')
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new MediaError('STORAGE_BLOCKED', '다른 DIO 탭을 닫고 다시 시도해 주세요.'))
    request.onsuccess = () => {
      const db = request.result
      db.onversionchange = () => { db.close(); opening = null }
      resolve(db)
    }
  }).catch((error) => { opening = null; throw error })
  return opening
}

// 개별 put 성공이 아닌 트랜잭션 커밋까지 기다린다.
async function transaction(mode, work) {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['blobs', 'metadata', 'displays'], mode)
    let result
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(tx.error ?? new Error('Media transaction aborted'))
    tx.onerror = () => {}
    try { result = work(tx) } catch (error) { tx.abort(); reject(error) }
  })
}

export async function readAsset(asset) {
  try {
    const response = asset.file ? null : await fetch(asset.uri)
    if (response && !response.ok) throw new Error('Unreadable picked file')
    const source = asset.file ?? await response.blob()
    return { source, size: source.size, header: new Uint8Array(await source.slice(0, 64).arrayBuffer()) }
  } catch (error) { throw new MediaError('MEDIA_READ_FAILED', '선택한 파일을 읽지 못했어요. 다시 선택해 주세요.', error) }
}

export async function save(source, metadata, display) {
  try {
    await transaction('readwrite', (tx) => {
      tx.objectStore('blobs').add(source, metadata.mediaFileId)
      tx.objectStore('metadata').add(metadata, metadata.mediaFileId)
      if (display) tx.objectStore('displays').add(display.source, metadata.mediaFileId)
    })
    return URL.createObjectURL(display?.source ?? source)
  } catch (error) { throw storageError(error) }
}

export async function get(id) {
  try {
    const requests = await transaction('readonly', (tx) => ({
      blob: tx.objectStore('blobs').get(id), media: tx.objectStore('metadata').get(id), displayBlob: tx.objectStore('displays').get(id),
    }))
    if (!requests.blob.result) throw new MediaError('MEDIA_NOT_FOUND', '저장된 원본 이미지를 찾을 수 없어요.')
    const original = requests.blob.result
    validateStoredOriginal(new Uint8Array(await original.slice(0, 64).arrayBuffer()), original.size, requests.media.result)
    return { blob: requests.blob.result, media: requests.media.result ?? null, displayBlob: requests.displayBlob.result ?? null }
  } catch (error) { throw storageError(error, 'STORAGE_READ_FAILED') }
}

export async function entries() {
  const items = await transaction('readonly', (tx) => {
    const results = []
    const keys = tx.objectStore('blobs').getAllKeys()
    keys.onsuccess = () => keys.result.forEach((id) => {
      const item = { id, blob: null }
      results.push(item)
      const display = tx.objectStore('displays').get(id)
      display.onsuccess = () => {
        if (display.result) item.blob = display.result
        else {
          const original = tx.objectStore('blobs').get(id)
          original.onsuccess = () => { item.blob = original.result }
        }
      }
    })
    return results
  })
  // 축소본이 있으면 고해상도 원본 Blob을 읽지 않는다. 기존 v1/v2는 원본으로 복원한다.
  return items.filter((item) => item.blob).map(({ id, blob }) => ({ id, uri: URL.createObjectURL(blob) }))
}

export async function remove(id, sessionUri) {
  try {
    await transaction('readwrite', (tx) => {
      tx.objectStore('blobs').delete(id)
      tx.objectStore('metadata').delete(id)
      tx.objectStore('displays').delete(id)
    })
  } finally { if (sessionUri) URL.revokeObjectURL(sessionUri) }
}
