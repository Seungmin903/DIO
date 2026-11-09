// 꾸미기 공방 테이프 보관함(폴더 구성)을 계정 서버와 맞춘다. 맞추는 규칙은 libraryFolderSync.js(스티커 보관함과 같다)에 있고, 여기에는 테이프 항목 모양만 둔다.
// - 사진 테이프 이미지는 /api/v1/media(TAPE)에 올리고, 폴더 구성 · 자른 자리는 /api/v1/me/tape-library 문서 한 벌로 저장한다.
// - 테이프 id 도 함께 저장한다(편집기 · 공방이 id 로 지우고 이름을 바꾸며, 기기끼리 같은 테이프를 가린다).
import { FOLDER_ID, LIBRARY_LIMITS, LIBRARY_SYNC_DEBOUNCE_MS, clip, createLibrarySync, mergeFoldersWith, uuid, validKind } from './libraryFolderSync.js'

export const TAPE_SYNC_DEBOUNCE_MS = LIBRARY_SYNC_DEBOUNCE_MS
// 서버(TapeLibraryService)와 같은 한도
const MAX_IMAGE_SIDE = 100000, MAX_RATIO = 100, MAX_ZOOM = 1000
const positive = (value, max) => Number.isFinite(value) && value > 0 && value <= max
const unit = value => Number.isFinite(value) && value >= 0 && value <= 1
const validCrop = crop => Boolean(crop && unit(crop.fx) && unit(crop.fy) && Number.isFinite(crop.zoom) && crop.zoom >= 1 && crop.zoom <= MAX_ZOOM)

/** 서버 문서의 테이프 하나(서버 미디어 id 로). 칸 순서는 서버 응답(TapeItem)과 같게 둔다(바뀌었는지 문자열로 비교한다) */
function serverItem(item, serverId) {
  const out = {}
  if (FOLDER_ID.test(String(item.id ?? ''))) out.id = item.id
  if (serverId) out.mediaFileId = serverId
  if (validKind(item.pattern)) out.pattern = item.pattern
  if (validKind(item.palette)) out.palette = item.palette
  const name = typeof item.name === 'string' ? clip(item.name, LIBRARY_LIMITS.text) : ''
  if (name) out.name = name
  if (positive(item.imageWidth, MAX_IMAGE_SIDE)) out.imageWidth = item.imageWidth
  if (positive(item.imageHeight, MAX_IMAGE_SIDE)) out.imageHeight = item.imageHeight
  if (validCrop(item.crop)) out.crop = { fx: item.crop.fx, fy: item.crop.fy, zoom: item.crop.zoom }
  if (validKind(item.size)) out.size = item.size
  if (positive(item.pieceRatio, MAX_RATIO)) out.pieceRatio = item.pieceRatio
  return out
}
// 사진 테이프는 미디어 id, 기본 무늬 테이프는 무늬가 있어야 보낼 수 있다
const syncable = item => Boolean(item && (uuid(item.mediaFileId) || validKind(item.pattern)))
const itemKey = item => item.id ? `i:${item.id}` : item.mediaFileId ? `m:${String(item.mediaFileId).toLowerCase()}` : `p:${item.pattern ?? ''}:${item.palette ?? ''}`
/** 서버 문서의 테이프를 기기 보관함 테이프로(받은 이미지는 서버 id 그대로 기기에 저장한다) */
export function localItem(item) {
  const out = {}
  // id 없이 저장된 테이프는 미디어 id · 무늬로 id 를 정한다(같은 문서를 받은 기기끼리 같은 id 가 되게)
  out.id = item.id ?? (item.mediaFileId ? `m-${item.mediaFileId}` : `p-${item.pattern}-${item.palette ?? ''}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64))
  if (item.mediaFileId) { out.mediaFileId = item.mediaFileId; out.src = `media:${item.mediaFileId}` }
  for (const field of ['pattern', 'palette', 'name', 'imageWidth', 'imageHeight', 'size', 'pieceRatio']) if (item[field] != null) out[field] = item[field]
  if (item.crop) out.crop = { ...item.crop }
  return out
}

/** 두 보관함(서버 문서 모양)을 합친다: 앞쪽(base) 순서를 지키고 뒤쪽(extra)에만 있는 폴더 · 테이프를 덧붙인다 */
export const mergeTapeFolders = mergeFoldersWith(itemKey)

export const TAPE_SCHEMA = Object.freeze({ serverItem, localItem, syncable, itemKey, defaultFolderName: '내 테이프', label: '테이프 보관함' })

/** createLibrarySync 와 같은 인자(schema 제외). 테이프 보관함 동기화를 만든다 */
export const createTapeLibrarySync = options => createLibrarySync({ ...options, schema: TAPE_SCHEMA })
