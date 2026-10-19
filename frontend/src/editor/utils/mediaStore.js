// 큰 이미지(GIF) 보관소. 문서에는 'media:{id}' 참조만 남기고 원본은 따로 둔다.
// - 웹: IndexedDB 에 Blob 으로 저장하고, 화면에는 짧은 blob: URL 을 쓴다.
//   data URI 를 문서에 넣으면 편집할 때마다 수 MB 문자열을 JSON 으로 다시 써서 화면이 멈추고 저장 공간도 넘친다.
// - 네이티브: 아직 파일 저장소 연결 전이라 data URI 를 그대로 쓴다. (백엔드 업로드가 붙으면 서버 URL 로 바뀔 자리)
import { Platform } from 'react-native'
import { createId } from './common'

const PREFIX = 'media:'
const DB_NAME = 'dio-media'
const STORE = 'blobs'
const urls = new Map() // id → blob: URL

export const isMediaRef = (src) => typeof src === 'string' && src.startsWith(PREFIX)
export const mediaSupported = Platform.OS === 'web' && typeof indexedDB !== 'undefined'

/** 화면에 쓸 주소. 보관소 참조가 아니면 그대로 돌려준다. */
export function mediaUri(src) {
  if (!isMediaRef(src)) return src
  return urls.get(src.slice(PREFIX.length)) ?? null
}

/** Blob 을 보관하고 'media:{id}' 참조를 돌려준다. */
export async function putMedia(blob) {
  const id = createId()
  const db = await openDb()
  await request(db.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, id))
  urls.set(id, URL.createObjectURL(blob))
  return PREFIX + id
}

/** 앱을 열 때 한 번: 저장된 Blob 을 모두 blob: URL 로 만들어 둔다. (디코딩은 하지 않아 가볍다) */
let hydrating = null
export function hydrateMedia() {
  if (!hydrating) hydrating = loadAll()
  return hydrating
}

async function loadAll() {
  if (!mediaSupported) return
  try {
    const db = await openDb()
    const store = db.transaction(STORE, 'readonly').objectStore(STORE)
    const [keys, blobs] = await Promise.all([request(store.getAllKeys()), request(store.getAll())])
    keys.forEach((id, index) => {
      if (!urls.has(id)) urls.set(id, URL.createObjectURL(blobs[index]))
    })
  } catch {
    // 보관소를 못 열면 해당 이미지만 빈 칸으로 보인다.
  }
}

/**
 * 첫 장면만 뽑은 작은 PNG (썸네일·레이어 목록용). 움직이는 GIF 를 여러 곳에서 동시에 돌리지 않으려고 쓴다.
 * 만들 수 없으면 null.
 */
export async function makePoster(blob, maxSize = 160) {
  if (Platform.OS !== 'web' || typeof createImageBitmap === 'undefined') return null
  try {
    const bitmap = await createImageBitmap(blob)
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

let dbPromise = null
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1)
      open.onupgradeneeded = () => open.result.createObjectStore(STORE)
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
  }
  return dbPromise
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
