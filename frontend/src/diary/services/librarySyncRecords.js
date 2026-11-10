// 꾸미기 공방 계정 동기화(스티커 · 테이프 보관함 · 내 표지 · 내 속지)가 이 기기에 남기는 기록을 다룬다.
// 네 동기화의 키는 모두 `<prefix><서버>:<계정>:…`(기기 id ↔ 서버 id 짝 · 받지 못한 그림 · 계정 전환 때 따로 둔 몫)와
// `<prefix><서버>:meta`(마지막으로 맞춘 계정 · 문서) 모양이다. 서버 주소는 encodeURIComponent 라 ':' 가 없다.

/** 동기화 기록 키 접두어(StickerLibrarySyncHost 가 만드는 key 와 같다) */
export const LIBRARY_SYNC_KEY_PREFIXES = Object.freeze([
  'dio:sticker-library-sync:v1:',
  'dio:tape-library-sync:v1:',
  'dio:cover-library-sync:v1:',
  'dio:paper-library-sync:v1:',
])

export async function removeKeys(storage, keys) {
  if (!keys.length) return
  if (storage.multiRemove) await storage.multiRemove(keys)
  else for (const key of keys) await (storage.removeItem ? storage.removeItem(key) : storage.setItem(key, 'null'))
}
export async function readJson(storage, key) { try { return JSON.parse(await storage.getItem(key) ?? 'null') } catch { return null } }

/**
 * 회원 탈퇴한 계정의 꾸미기 공방 동기화 기록(스티커 · 테이프 보관함 · 내 표지 · 내 속지)을 이 기기에서 지운다.
 * 그 계정 몫 키는 모두 지우고, meta 는 그 계정과 맞춘 것일 때만 지운다(다른 계정 기록 · 다른 기능 키는 남긴다).
 * storage 는 getAllKeys 가 있어야 한다(AsyncStorage). 없으면 아무것도 하지 않는다
 */
export async function forgetLibrarySyncRecords({ storage, account, prefixes = LIBRARY_SYNC_KEY_PREFIXES }) {
  if (!storage?.getAllKeys || account == null) return
  const owner = String(account), doomed = []
  for (const key of await storage.getAllKeys()) {
    const prefix = prefixes.find(item => key.startsWith(item))
    if (!prefix) continue
    const parts = key.slice(prefix.length).split(':') // [서버, 계정 | 'meta', …]
    if (parts[1] === owner) doomed.push(key)
    else if (parts[1] === 'meta' && parts.length === 2 && (await readJson(storage, key))?.account === owner) doomed.push(key)
  }
  await removeKeys(storage, doomed)
}
