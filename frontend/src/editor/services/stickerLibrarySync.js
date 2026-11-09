// 꾸미기 공방 스티커 보관함(폴더 구성)을 계정 서버와 맞춘다. 맞추는 규칙은 libraryFolderSync.js 에 있고, 여기에는 스티커 항목 모양만 둔다.
// - 스티커 이미지는 /api/v1/media(STICKER)에 올리고, 폴더 구성은 /api/v1/me/sticker-library 문서 한 벌로 저장한다.
import { LIBRARY_LIMITS, LIBRARY_SYNC_DEBOUNCE_MS, clip, createLibrarySync, mergeFoldersWith, uuid, validKind } from './libraryFolderSync.js'

export { LIBRARY_LIMITS }
export const STICKER_SYNC_DEBOUNCE_MS = LIBRARY_SYNC_DEBOUNCE_MS
const KINDS = ['builtin', 'asset', 'widget', 'style', 'emoji']

/** 서버 문서의 스티커 하나(서버 미디어 id 로) */
function serverItem(item, serverId) {
  const out = {}
  if (serverId) out.mediaFileId = serverId
  for (const kind of KINDS) if (validKind(item[kind])) out[kind] = item[kind]
  const name = typeof item.name === 'string' ? clip(item.name, LIBRARY_LIMITS.text) : ''
  if (name) out.name = name
  if (Number.isFinite(item.aspect) && item.aspect > 0 && item.aspect <= 100) out.aspect = item.aspect
  return out
}
const syncable = item => Boolean(item && (uuid(item.mediaFileId) || KINDS.some(kind => kind !== 'style' && validKind(item[kind]))))
const itemKey = item => item.mediaFileId ? `m:${String(item.mediaFileId).toLowerCase()}` : KINDS.map(kind => item[kind] ?? '').join('|')
/** 서버 문서의 스티커를 기기 보관함 스티커로(받은 이미지는 서버 id 그대로 기기에 저장한다) */
export function localItem(item) {
  const out = {}
  if (item.mediaFileId) { out.mediaFileId = item.mediaFileId; out.src = `media:${item.mediaFileId}` }
  for (const kind of KINDS) if (item[kind]) out[kind] = item[kind]
  if (item.name) out.name = item.name
  if (item.aspect) out.aspect = item.aspect
  return out
}

/** 두 보관함(서버 문서 모양)을 합친다: 앞쪽(base) 순서를 지키고 뒤쪽(extra)에만 있는 폴더 · 스티커를 덧붙인다 */
export const mergeFolders = mergeFoldersWith(itemKey)

export const STICKER_SCHEMA = Object.freeze({ serverItem, localItem, syncable, itemKey, defaultFolderName: '내 스티커', label: '스티커 보관함' })

/** createLibrarySync 와 같은 인자(schema 제외). 스티커 보관함 동기화를 만든다 */
export const createStickerLibrarySync = options => createLibrarySync({ ...options, schema: STICKER_SCHEMA })
