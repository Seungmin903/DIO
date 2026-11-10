// 꾸미기 공방 내 표지(표지 목록)를 계정 서버와 맞춘다. 맞추는 규칙은 스티커 보관함(editor/services/stickerLibrarySync.js)과 같고,
// 폴더가 없는 한 줄 목록이며 표지 하나에 그림이 여럿(표지 사진 · 표지 스티커)이라는 점만 다르다.
// - 표지 그림은 /api/v1/media 에 올리고, 표지 목록은 /api/v1/me/cover-library 문서 한 벌로 저장한다(version 으로 동시 저장을 막는다).
// - 기기의 표지는 기기 미디어 id 를 쓰고, 서버 문서에는 서버 미디어 id 를 쓴다. 둘의 짝은 storage 에 기록한다(받은 그림은 둘이 같다).
// - 이 기기에서 마지막으로 맞춘 상태(meta: 계정 · 서버 version · 그때의 문서)를 기억해 어느 쪽이 바뀌었는지 가린다.
//   같은 계정: 기기만 바뀜 → 올림, 서버만 바뀜 → 받음, 둘 다 → 합쳐 올림. 이 기기 처음: 합쳐 올림. 다른 계정이 쓰던 기기: 서버 것을 받음.
//   합치기는 표지를 id 로 가려 모두 남긴다(같은 표지를 양쪽에서 고쳤으면 이 기기 것을 쓴다. 한쪽에서 지운 것이 다시 보일 수 있다).
// - 받지 못한 그림은 기억해 두고 맞출 때마다 다시 받는다(서버에 파일이 없으면(404 · 410) 더 받지 않는다).
// 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = value => typeof value === 'string' && UUID.test(value)
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g, HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const clip = (value, max) => Array.from(String(value ?? '').replace(CONTROL, '')).slice(0, max).join('')

export const COVER_SYNC_DEBOUNCE_MS = 1500
// 서버(CoverLibraryService)와 같은 한도. 넘는 표지는 보내지 않고 기기에만 남긴다
// (mediaPerCover: 표지 하나 안의 그림 칸 수. 서버는 하나라도 넘으면 문서 전체를 400 으로 거절한다)
export const COVER_LIBRARY_LIMITS = Object.freeze({ covers: 100, name: 40, date: 40, coverBytes: 64 * 1024, mediaPerCover: 200 })
const ORIENTATIONS = new Set(['portrait', 'landscape'])
const MEDIA_PREFIX = 'media:'
const stable = covers => JSON.stringify(covers)
const utf8Bytes = text => typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(text).length : unescape(encodeURIComponent(text)).length

/** 표지 디자인 안의 그림 칸(mediaFileId 가 있는 객체)마다 fn(칸, 종류)을 부른다. 종류는 표지 사진이면 PHOTO, 그 밖(스티커)은 STICKER */
function eachMedia(value, fn, category = 'STICKER') {
  if (Array.isArray(value)) { value.forEach(item => eachMedia(item, fn, category)); return }
  if (!value || typeof value !== 'object') return
  if ((typeof value.mediaFileId === 'string' && value.mediaFileId) || mediaRef(value.src)) fn(value, category)
  for (const [key, child] of Object.entries(value)) if (child && typeof child === 'object') eachMedia(child, fn, key === 'photo' ? 'PHOTO' : category)
}
const mediaRef = src => typeof src === 'string' && src.startsWith(MEDIA_PREFIX) && src.length > MEDIA_PREFIX.length ? src.slice(MEDIA_PREFIX.length) : null
const mediaIds = cover => { const ids = []; eachMedia(cover, slot => ids.push(slot.mediaFileId || mediaRef(slot.src))); return ids }
/**
 * 그림 칸의 src(media:…)와 mediaFileId 를 맞춘다(복사본에만). 서버는 src 가 같은 칸의 mediaFileId 를 가리키지 않으면 문서 전체를 거절한다.
 * 앱(mediaReferences.mediaId)은 mediaFileId 를 먼저 보므로 둘이 다르면 src 를 맞추고, 예전 표지처럼 src 만 있으면 그 id 를 mediaFileId 로 채운다
 */
function linkMediaRefs(cover) {
  eachMedia(cover, slot => {
    if (typeof slot.mediaFileId !== 'string' || !slot.mediaFileId) slot.mediaFileId = mediaRef(slot.src)
    else if (mediaRef(slot.src)) slot.src = MEDIA_PREFIX + slot.mediaFileId
  })
  return cover
}
/** 그림 칸의 미디어 id 를 바꾼다(src 가 media: 참조면 같이) */
function retarget(slot, id) {
  slot.mediaFileId = id
  if (typeof slot.src === 'string' && slot.src.startsWith(MEDIA_PREFIX)) slot.src = MEDIA_PREFIX + id
}

/** 서버로 보낼 수 있는 표지인지(서버가 거절할 표지는 기기에만 남긴다) */
function syncable(entry) {
  if (!entry || !ENTRY_ID.test(String(entry.id ?? '')) || !entry.cover || typeof entry.cover !== 'object' || Array.isArray(entry.cover)) return false
  if (mediaIds(entry.cover).length > COVER_LIBRARY_LIMITS.mediaPerCover) return false
  return utf8Bytes(JSON.stringify(entry.cover)) <= COVER_LIBRARY_LIMITS.coverBytes
}
/** 보낼 수 있고 한도(100개) 안인 표지 */
const withinLimits = covers => (covers ?? []).filter(syncable).slice(0, COVER_LIBRARY_LIMITS.covers)
/** 서버 문서의 표지 하나. 칸 순서는 서버 응답(CoverEntry)과 같게 둔다(바뀌었는지 문자열로 비교한다) */
function serverEntry(entry, cover) {
  const out = { id: entry.id, name: clip(String(entry.name ?? '').trim(), COVER_LIBRARY_LIMITS.name).trim() || '내 표지' }
  if (typeof entry.createdAt === 'string' && entry.createdAt && entry.createdAt.length <= COVER_LIBRARY_LIMITS.date && !HAS_CONTROL.test(entry.createdAt)) out.createdAt = entry.createdAt
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
 *            replace(covers, base) → base 가 지금 목록과 같을 때만 바꾸고 적용한 목록(그 사이 사용자가 고쳤으면 null) }
 * storage · key: 이 기기에서 맞춘 상태(meta) · 기기 id → 서버 id 짝 · 받지 못한 그림을 둔다
 * onStatus({ error }): 맞추기 결과(올리지 못한 표지 · 받지 못한 그림 · 연결 오류가 있으면 문구)
 */
export function createCoverLibrarySync({ account, api, media, library, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = COVER_SYNC_DEBOUNCE_MS, onError = () => {}, onStatus = () => {} }) {
  // meta 는 기기마다 하나(어느 계정과 맞췄는지 알아야 한다), 기기 id ↔ 서버 id 짝은 계정마다 따로 둔다(서버 id 가 계정마다 다르다)
  const metaKey = `${key}:meta`, idKey = id => `${key}:${account}:id:${String(id).toLowerCase()}`, localKey = id => `${key}:${account}:local:${String(id).toLowerCase()}`
  const missingKey = `${key}:${account}:missing`, stashKey = owner => `${key}:${owner}:stash`
  // 다른 계정으로 바뀔 때 따로 둔 이 계정 몫: { covers(그때 기기 목록), synced(그때 이 계정과 맞춘 문서) }
  const readStash = async () => {
    try { const value = JSON.parse(await storage.getItem(stashKey(account)) ?? 'null'); return value && Array.isArray(value.covers) ? value : null } catch { return null }
  }
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('내 표지 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const writeMeta = async next => { meta = next; await storage.setItem(metaKey, JSON.stringify(next)) }

  // 기기 표지 하나를 서버 문서 모양으로. 그림 하나라도 서버 id 가 없으면(올리지 못했거나 upload 가 거짓) null
  async function toServerEntry(entry, upload) {
    const cover = linkMediaRefs(structuredClone(entry.cover))
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
          onError(error); serverId = null // 올리지 못한 표지는 이번에는 빼고, 다음 맞추기에서 다시 시도한다
        }
      }
      if (!uuid(serverId)) return null
      retarget(slot, serverId)
    }
    return serverEntry(entry, cover)
  }
  // 기기 목록을 서버 문서 모양으로. 보낼 수 없는 표지 · 한도를 넘는 표지는 빠진다(기기에만 남는다).
  // 결과 배열의 pending: 보낼 수 있는데 그림을 아직 올리지 못한 표지 수
  async function toServer(covers, upload) {
    const out = []
    let pending = 0
    for (const entry of withinLimits(covers)) {
      const sent = await toServerEntry(entry, upload)
      if (sent) out.push(sent)
      else pending++
    }
    out.pending = pending
    return out
  }

  // 내려받지 못한 서버 그림 id. 맞출 때마다 다시 받아 보고, 남아 있으면 공방에 알린다(앱을 다시 켜도 이어서 받는다)
  let missing = null
  const readMissing = async () => {
    if (missing) return missing
    try { const value = JSON.parse(await storage.getItem(missingKey) ?? '[]'); missing = new Set(Array.isArray(value) ? value.filter(uuid) : []) }
    catch { missing = new Set() }
    return missing
  }
  const writeMissing = () => storage.setItem(missingKey, JSON.stringify([...missing]))
  async function fetchImage(serverId) {
    try { await media.download(serverId); active(); missing.delete(serverId) }
    catch (error) {
      if (error?.code === 'SYNC_CLOSED') throw error
      onError(error)
      // 서버에 파일이 없으면(404 · 410) 다시 받아도 소용없다: 맞출 때마다 재시도하거나 계속 알리지 않는다
      if (error?.status === 404 || error?.status === 410) missing.delete(serverId)
      else missing.add(serverId)
    }
  }
  // 지난번에 받지 못한 그림을 다시 받는다. 그사이 목록에서 빠진 표지의 그림은 더 받지 않는다
  async function retryMissing() {
    await readMissing(); active()
    if (!missing.size) return
    const present = new Set((library.snapshot() ?? []).flatMap(entry => mediaIds(entry?.cover)).filter(uuid))
    for (const id of [...missing]) {
      if (present.has(id)) await fetchImage(id)
      else missing.delete(id)
    }
    await writeMissing(); active()
  }

  // 서버 문서를 기기에 들인다: 이 기기가 올린 그림은 기기 원본을 그대로 쓰고, 나머지는 내려받아 서버 id 로 저장한 뒤 목록을 바꾼다.
  // keepLocal 이면 아직 서버에 없는 기기 표지(올리지 못한 표지 · 보낼 수 없는 표지 · 한도 초과 · 한 번도 맞춘 적 없는 표지)는 지우지 않고 남긴다.
  // restore: 이 계정이 예전에 이 기기에 남겨 둔 몫(stash). 그중 아직 서버에 없는 표지를 같은 규칙으로 되살린다
  // 받는 사이 이 기기에서 목록을 고치면 들이지 않고 false(그 편집을 덮어쓰지 않는다). 바뀐 목록은 다시 맞춘다
  async function adopt(server, { keepLocal = true, restore = null } = {}) {
    await readMissing(); active()
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
        await fetchImage(serverId) // 못 받은 그림도 표지는 남기고 다음 맞추기에서 다시 받는다
      }
      covers.push({ id: entry.id, name: entry.name, createdAt: entry.createdAt ?? null, orientation: entry.orientation, cover })
    }
    await writeMissing(); active()
    const base = library.snapshot()
    const kept = keepLocal ? await unsent(base, covers, syncedIds(meta?.synced)) : []
    const restored = restore ? await unsent(restore.covers, covers, syncedIds(restore.synced)) : []
    const next = [...restored, ...kept, ...covers]
    active()
    // replace 가 돌려준 목록(적용한 것)과 지금 목록이 다르면 그사이 사용자가 고친 것이다. 받아서 바꾼 알림은 무시하지만 그 편집은 다시 맞춘다
    applying = true
    let applied
    try { applied = await library.replace(next, base) } finally { applying = false }
    if (!applied) { again = true; return false }
    if (library.snapshot() !== applied || restored.length) again = true // 되살린 표지는 다음 맞추기에서 올린다
    await writeMeta({ account, version: server.version, synced: stable(server.covers) })
    return true
  }

  const syncedIds = synced => { try { return new Set(JSON.parse(synced ?? '[]').map(entry => entry.id)) } catch { return new Set() } }
  // 서버 목록에 없는 기기 표지 중 남길 것: 예전에 맞춘 적 있으면(previous) 다른 기기에서 지운 것이라 빼고, 한 번도 맞춘 적 없거나 아직 보낼 수 없으면 남긴다
  async function unsent(local, covers, previous) {
    const sendable = new Set(withinLimits(local))
    const inServer = new Set(covers.map(entry => entry.id))
    const out = []
    for (const entry of local ?? []) {
      if (!entry || inServer.has(entry.id)) continue
      if (!sendable.has(entry) || !previous.has(entry.id) || !await toServerEntry(entry, false)) out.push(entry)
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
    await retryMissing()
    const local = library.snapshot() ?? []
    // 들이는 동안 기기 목록이 바뀌어 들이지 않았으면(adopt 가 false) 알리지 않고 다시 맞춘다
    // 다른 계정이 쓰던 기기: 그 표지를 이 계정에 올리지 않는다. 지우지도 않고 그 계정 몫(stash)으로 따로 두었다가 그 계정으로 다시 로그인하면 되살린다
    // (올리지 못해 서버에 없던 표지가 계정을 바꾸는 순간 사라지지 않게). 이 계정이 남겨 둔 몫이 있으면 함께 되살린다
    if (meta && meta.account !== account) {
      await storage.setItem(stashKey(meta.account), JSON.stringify({ covers: local, synced: meta.synced ?? '[]' })); active()
      const restore = await readStash(); active()
      if (!await adopt(server, { keepLocal: false, restore })) return null
      if (restore) await storage.setItem(stashKey(account), 'null')
      return report(0)
    }
    if (!meta && !local.length) return await adopt(server) ? report(0) : null // 새 기기 · 재설치: 서버 목록을 그대로 받는다
    // 바뀌었는지는 보낼 수 있는 것끼리만 비교한다(보낼 수 없는 표지 · 한도 초과가 있다고 매번 저장하지 않는다)
    const known = await toServer(local, false); active()
    const localChanged = !meta || stable(known) !== meta.synced || known.pending > 0
    const serverChanged = !meta || server.version !== meta.version
    if (!localChanged && !serverChanged) return report(0)
    if (!localChanged) return await adopt(server) ? report(0) : null
    const mine = await toServer(local, true); active()
    // 다시 올려 봤지만 새로 올라간 것이 없으면 저장하지 않는다(version 만 올라 다른 기기가 매번 다시 받지 않게). 서버가 바뀌었으면 받는다
    if (meta && stable(mine) === meta.synced) return serverChanged && !await adopt(server) ? null : report(mine.pending)
    const saved = await push(serverChanged ? mergeCovers(mine, server.covers) : mine, server.version)
    // 저장된 결과가 기기에서 보낸 것과 다르면(서버 것과 합쳤으면) 기기에도 들인다. 들이지 않으면 다음 맞추기에서 다른 기기 표지를 서버에서 지운다
    if (stable(saved.covers) !== stable(mine)) await adopt(saved)
    report(mine.pending)
    return saved
  }
  // 맞추기 결과를 알린다: 올리지 못한 표지나 받지 못한 그림이 남았으면 실패, 아니면 정상
  function report(pending) {
    const failures = []
    if (pending > 0) failures.push(`표지 ${pending}개를 계정에 올리지 못했어요. 다른 기기에서는 보이지 않아요.`)
    if (missing?.size) failures.push(`표지 그림 ${missing.size}개를 받지 못했어요. 연결을 확인해 주세요.`)
    onStatus({ error: failures.length ? failures.join(' ') : null })
    return null
  }

  function run() {
    if (running) { again = true; return running }
    running = reconcile().catch(error => {
      if (error?.code === 'SYNC_CLOSED') return
      onError(error)
      onStatus({ error: error?.status === 409 ? '다른 기기의 변경과 계속 겹쳐 내 표지를 계정에 저장하지 못했어요.' : '내 표지를 계정과 맞추지 못했어요. 연결을 확인해 주세요.' })
    })
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
