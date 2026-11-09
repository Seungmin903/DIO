// 꾸미기 공방 내 표지(표지 목록)를 계정 서버와 맞춘다. 맞추는 규칙은 스티커 · 테이프 보관함(editor/services/libraryFolderSync.js)과 같고,
// 폴더가 없는 한 줄 목록이며 표지 하나에 그림이 여럿(표지 사진 · 표지 스티커)이라는 점만 다르다.
// - 표지 그림은 /api/v1/media 에 올리고, 표지 목록은 /api/v1/me/cover-library 문서 한 벌로 저장한다(version 으로 동시 저장을 막는다).
// - 기기의 표지는 기기 미디어 id 를 쓰고, 서버 문서에는 서버 미디어 id 를 쓴다. 둘의 짝은 storage 에 기록한다(받은 그림은 둘이 같다).
// - 이 기기에서 마지막으로 맞춘 상태(meta: 계정 · 서버 version · 그때의 문서)를 기억해 어느 쪽이 바뀌었는지 가린다.
//   같은 계정: 기기만 바뀜 → 올림, 서버만 바뀜 → 받음, 둘 다 → 합쳐 올림. 이 기기 처음: 합쳐 올림. 다른 계정이 쓰던 기기: 서버 것을 받음.
//   합치기는 표지를 id 로 가려 모두 남긴다(같은 표지를 양쪽에서 고쳤으면 이 기기 것을 쓴다).
// 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).
import { FOLDER_ID, LIBRARY_SYNC_DEBOUNCE_MS, clip, uuid } from '../../editor/services/libraryFolderSync.js'

export const COVER_SYNC_DEBOUNCE_MS = LIBRARY_SYNC_DEBOUNCE_MS
// 서버(CoverLibraryService)와 같은 한도. 넘는 표지는 보내지 않고 기기에만 남긴다
export const COVER_LIBRARY_LIMITS = Object.freeze({ covers: 100, name: 40, date: 40, coverBytes: 64 * 1024 })
const ORIENTATIONS = new Set(['portrait', 'landscape'])
const MEDIA_PREFIX = 'media:'
const stable = covers => JSON.stringify(covers)
const utf8Bytes = text => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : unescape(encodeURIComponent(text)).length

/** 표지 디자인 안의 그림 칸(mediaFileId 가 있는 객체)마다 fn(칸, 종류)을 부른다. 종류는 표지 사진이면 PHOTO, 그 밖(스티커)은 STICKER */
function eachMedia(value, fn, category = 'STICKER') {
  if (Array.isArray(value)) { value.forEach(item => eachMedia(item, fn, category)); return }
  if (!value || typeof value !== 'object') return
  if (typeof value.mediaFileId === 'string' && value.mediaFileId) fn(value, category)
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') eachMedia(child, fn, key === 'photo' ? 'PHOTO' : category)
}
/** 그림 칸의 미디어 id 를 바꾼다(src 가 media: 참조면 같이) */
function retarget(slot, id) {
  slot.mediaFileId = id
  if (typeof slot.src === 'string' && slot.src.startsWith(MEDIA_PREFIX)) slot.src = MEDIA_PREFIX + id
}

/** 서버로 보낼 수 있는 표지인지(서버가 거절할 표지는 기기에만 남긴다) */
function syncable(entry) {
  if (!entry || !FOLDER_ID.test(String(entry.id ?? '')) || !entry.cover || typeof entry.cover !== 'object' || Array.isArray(entry.cover)) return false
  return utf8Bytes(JSON.stringify(entry.cover)) <= COVER_LIBRARY_LIMITS.coverBytes
}
/** 서버 문서의 표지 하나. 칸 순서는 서버 응답(CoverEntry)과 같게 둔다(바뀌었는지 문자열로 비교한다) */
function serverEntry(entry, cover) {
  const out = { id: entry.id, name: clip(String(entry.name ?? '').trim(), COVER_LIBRARY_LIMITS.name).trim() || '내 표지' }
  if (typeof entry.createdAt === 'string' && entry.createdAt && entry.createdAt.length <= COVER_LIBRARY_LIMITS.date && !/[\u0000-\u001f\u007f-\u009f]/.test(entry.createdAt)) out.createdAt = entry.createdAt
  out.orientation = ORIENTATIONS.has(entry.orientation) ? entry.orientation : 'landscape'
  out.cover = cover
  return out
}

/** 두 목록(서버 문서 모양)을 합친다: 앞쪽(base) 순서를 지키고 뒤쪽(extra)에만 있는 표지를 덧붙인다 */
export function mergeCovers(base, extra) {
  const ids = new Set(base.map(entry => entry.id))
  return [...base, ...extra.filter(entry => !ids.has(entry.id))]
}

/**
 * account: 지금 로그인한 계정 id(문자열)
 * api: { get() → { version, covers }, put(expectedVersion, covers) → { version, covers } } (409 는 error.status === 409)
 * media: { upload(localId, category) → 서버 id, download(serverId) → 기기에 저장(이미 있으면 그대로) }
 * library: { ready() → 기기 목록을 읽은 뒤 풀리는 Promise, snapshot() → 기기 내 표지[], subscribe(listener) → 해제 함수,
 *            replace(covers, base) → base 가 지금 목록과 같을 때만 바꾸고 true(그 사이 사용자가 고쳤으면 false) }
 * storage · key: 이 기기에서 맞춘 상태(meta) · 기기 id → 서버 id 짝을 둔다
 */
export function createCoverLibrarySync({ account, api, media, library, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = COVER_SYNC_DEBOUNCE_MS, onError = () => {} }) {
  const metaKey = `${key}:meta`, idKey = id => `${key}:${account}:id:${String(id).toLowerCase()}`, localKey = id => `${key}:${account}:local:${String(id).toLowerCase()}`
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('내 표지 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const writeMeta = async next => { meta = next; await storage.setItem(metaKey, JSON.stringify(next)) }

  // 기기 표지 하나를 서버 문서 모양으로. 그림 하나라도 서버 id 가 없으면(올리지 못했거나 upload 가 거짓) null
  async function toServerEntry(entry, upload) {
    const cover = structuredClone(entry.cover)
    const slots = []
    eachMedia(cover, (slot, category) => slots.push([slot, category]))
    for (const [slot, category] of slots) {
      const localId = slot.mediaFileId
      let serverId = await storage.getItem(idKey(localId)); active()
      if (!uuid(serverId) && upload) {
        try {
          serverId = await media.upload(localId, category); active()
          if (!uuid(serverId)) throw Error('업로드 응답을 확인하지 못했어요.')
          await storage.setItem(idKey(localId), serverId)
          await storage.setItem(localKey(serverId), localId) // 서버에서 다시 받을 때 이 기기의 원본을 그대로 쓴다
        } catch (error) {
          if (error?.code === 'SYNC_CLOSED') throw error
          onError(error); serverId = null // 올리지 못한 표지는 이번에는 빼고, 다음 저장에서 다시 시도한다
        }
      }
      if (!uuid(serverId)) return null
      retarget(slot, serverId)
    }
    return serverEntry(entry, cover)
  }
  // 기기 목록을 서버 문서 모양으로. 보낼 수 없는 표지 · 그림을 아직 올리지 못한 표지 · 한도를 넘는 표지는 빠진다(기기에만 남는다)
  async function toServer(covers, upload) {
    const out = []
    for (const entry of covers ?? []) {
      if (out.length >= COVER_LIBRARY_LIMITS.covers) break
      if (!syncable(entry)) continue
      const sent = await toServerEntry(entry, upload)
      if (sent) out.push(sent)
    }
    return out
  }

  // 서버 문서를 기기에 들인다: 이 기기가 올린 그림은 기기 원본을 그대로 쓰고, 나머지는 내려받아 서버 id 로 저장한 뒤 목록을 바꾼다.
  // keepLocal 이면 아직 서버에 없는 기기 표지(올리지 못한 표지 · 보낼 수 없는 표지 · 한 번도 맞춘 적 없는 표지)는 지우지 않고 남긴다.
  async function adopt(server, { keepLocal = true } = {}) {
    const covers = []
    for (const entry of server.covers) {
      const cover = structuredClone(entry.cover)
      const slots = []
      eachMedia(cover, slot => slots.push(slot))
      for (const slot of slots) {
        const serverId = slot.mediaFileId
        const mine = await storage.getItem(localKey(serverId)); active()
        if (typeof mine === 'string' && mine) { retarget(slot, mine); continue }
        // 서버 id 는 내려받기 성공과 상관없이 짝을 기록한다(받지 못한 그림을 '안 올린 그림'으로 보고 서버에서 빼지 않게)
        await storage.setItem(idKey(serverId), serverId); active()
        try { await media.download(serverId); active() }
        catch (error) { if (error?.code === 'SYNC_CLOSED') throw error; onError(error) } // 못 받은 그림도 표지는 남기고 다음에 다시 받는다
      }
      covers.push({ id: entry.id, name: entry.name, createdAt: entry.createdAt ?? null, orientation: entry.orientation, cover })
    }
    const base = library.snapshot()
    const next = keepLocal ? [...await unsent(base, covers), ...covers] : covers
    active()
    applying = true
    let replaced
    try { replaced = await library.replace(next, base) } finally { applying = false }
    if (!replaced) { again = true; return } // 받는 사이 이 기기에서 고쳤다: 기록을 남기지 않고 곧 다시 맞춘다
    await writeMeta({ account, version: server.version, synced: stable(server.covers) })
  }

  // 서버 목록에 없는 기기 표지 중 남길 것: 예전에 맞춘 적 있으면 다른 기기에서 지운 것이라 빼고, 한 번도 맞춘 적 없거나 아직 보낼 수 없으면 남긴다
  async function unsent(local, covers) {
    let previous = new Set()
    try { previous = new Set(JSON.parse(meta?.synced ?? '[]').map(entry => entry.id)) } catch { /* 처음 맞추는 기기 */ }
    const inServer = new Set(covers.map(entry => entry.id))
    const out = []
    for (const entry of local ?? []) {
      if (!entry || inServer.has(entry.id)) continue
      if (!syncable(entry) || !previous.has(entry.id) || !await toServerEntry(entry, false)) out.push(entry)
      active()
    }
    return out
  }

  async function push(covers, version) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await api.put(version, covers); active()
        await writeMeta({ account, version: saved.version, synced: stable(saved.covers) })
        return saved
      } catch (error) {
        if (error?.status !== 409) throw error
        // 다른 기기가 먼저 바꿨다: 서버 것을 받아 내 변경을 얹어 다시 저장한다
        const server = await api.get(); active()
        covers = mergeCovers(covers, server.covers); version = server.version
      }
    }
    throw Object.assign(Error('다른 기기의 변경과 계속 겹쳐 저장하지 못했어요.'), { status: 409 })
  }

  async function reconcile() {
    active()
    await library.ready(); active()
    meta ??= await readMeta(); active()
    const server = await api.get(); active()
    const local = library.snapshot() ?? []
    if (meta && meta.account !== account) return adopt(server, { keepLocal: false }) // 다른 계정이 쓰던 기기: 그 표지를 이 계정에 올리지 않는다
    if (!meta && !local.length) return adopt(server) // 새 기기 · 재설치: 서버 목록을 그대로 받는다
    const known = await toServer(local, false); active()
    const localChanged = !meta || stable(known) !== meta.synced || known.length !== local.length
    const serverChanged = !meta || server.version !== meta.version
    if (!localChanged && !serverChanged) return null
    if (!localChanged) return adopt(server)
    const mine = await toServer(local, true); active()
    // 보낼 것이 그대로면(올리지 못한 표지만 남았으면) 서버가 바뀐 경우에만 받는다
    if (meta && stable(mine) === meta.synced) return serverChanged ? adopt(server) : null
    const saved = await push(serverChanged ? mergeCovers(mine, server.covers) : mine, server.version)
    // 저장된 결과가 기기에서 보낸 것과 다르면(서버 것과 합쳤으면) 기기에도 들인다. 들이지 않으면 다음 맞추기에서 다른 기기 표지를 서버에서 지운다
    if (stable(saved.covers) !== stable(mine)) await adopt(saved)
    return saved
  }

  function run() {
    if (running) { again = true; return running }
    running = reconcile().catch(error => { if (error?.code !== 'SYNC_CLOSED') onError(error) })
      .finally(() => { running = null; if (again && !closed) { again = false; schedule() } })
    return running
  }
  function schedule() {
    if (closed) return
    if (timer != null) clearTimer(timer)
    timer = setTimer(() => { timer = null; run() }, debounceMs)
  }

  return {
    /** 처음 맞추고, 그 뒤 기기 목록이 바뀔 때마다(잠시 모아) 올린다 */
    start() {
      unsubscribe = library.subscribe(() => { if (!applying) schedule() }) // 받아서 바꾼 것은 다시 올리지 않는다
      return run()
    },
    /** 지금 바로 다시 맞춘다(앱이 다시 앞으로 왔을 때 등) */
    sync: run,
    whenIdle: async () => { while (running || timer != null) { if (timer != null) { clearTimer(timer); timer = null; run() } await running } },
    stop() { closed = true; if (timer != null) clearTimer(timer); timer = null; unsubscribe?.() },
  }
}
