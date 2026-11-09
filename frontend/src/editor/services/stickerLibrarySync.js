// 꾸미기 공방 스티커 보관함(폴더 구성)을 계정 서버와 맞춘다. 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).
// - 스티커 이미지는 /api/v1/media(STICKER)에 올리고, 폴더 구성은 /api/v1/me/sticker-library 문서 한 벌로 저장한다(version 으로 동시 저장을 막는다).
// - 기기의 스티커는 기기 미디어 id 를 쓰고, 서버 문서에는 서버 미디어 id 를 쓴다. 둘의 짝은 storage 에 기록한다(받은 스티커는 둘이 같다).
// - 이 기기에서 마지막으로 맞춘 상태(meta: 계정 · 서버 version · 그때의 문서)를 기억해 어느 쪽이 바뀌었는지 가린다.
//   같은 계정: 기기만 바뀜 → 올림, 서버만 바뀜 → 받음, 둘 다 → 합쳐 올림. 이 기기 처음: 합쳐 올림. 다른 계정이 쓰던 기기: 서버 것을 받음(남의 스티커를 올리지 않는다).
//   합치기는 폴더 · 스티커를 모두 남긴다(한쪽에서 지운 것이 다시 보일 수 있다. 사라지는 것보다 낫다).

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = value => typeof value === 'string' && UUID.test(value)
const FOLDER_ID = /^[A-Za-z0-9_-]{1,64}$/
const KINDS = ['builtin', 'asset', 'widget', 'style', 'emoji']
export const STICKER_SYNC_DEBOUNCE_MS = 1500

/** 서버 문서의 스티커 하나(서버 미디어 id 로) */
function serverItem(item, serverId) {
  const out = {}
  if (serverId) out.mediaFileId = serverId
  for (const kind of KINDS) if (typeof item[kind] === 'string' && item[kind]) out[kind] = item[kind]
  if (typeof item.name === 'string' && item.name) out.name = item.name
  if (Number.isFinite(item.aspect) && item.aspect > 0 && item.aspect <= 100) out.aspect = item.aspect
  return out
}
const syncable = item => Boolean(item && (uuid(item.mediaFileId) || KINDS.some(kind => kind !== 'style' && typeof item[kind] === 'string' && item[kind])))
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
const stable = folders => JSON.stringify(folders)
const serverFolderName = name => Array.from(String(name ?? '').trim()).slice(0, 40).join('') || '내 스티커'

/** 두 보관함(서버 문서 모양)을 합친다: 앞쪽(base) 순서를 지키고 뒤쪽(extra)에만 있는 폴더 · 스티커를 덧붙인다 */
export function mergeFolders(base, extra) {
  const out = base.map(folder => ({ ...folder, items: [...folder.items] }))
  for (const folder of extra) {
    const same = out.find(item => item.id === folder.id)
    if (!same) { out.push({ ...folder, items: [...folder.items] }); continue }
    const keys = new Set(same.items.map(itemKey))
    for (const item of folder.items) if (!keys.has(itemKey(item))) { same.items.push(item); keys.add(itemKey(item)) }
  }
  return out
}

/**
 * account: 지금 로그인한 계정 id(문자열)
 * api: { get() → { version, folders }, put(expectedVersion, folders) → { version, folders } } (409 는 error.status === 409)
 * media: { upload(localId) → 서버 id, download(serverId) → 기기에 저장(이미 있으면 그대로) }
 * decor: { snapshot() → 기기 보관함 폴더[], subscribe(listener) → 해제 함수, replace(folders) }
 * storage · key: 이 기기에서 맞춘 상태(meta) · 기기 id → 서버 id 짝을 둔다
 */
export function createStickerLibrarySync({ account, api, media, decor, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = STICKER_SYNC_DEBOUNCE_MS, onError = () => {} }) {
  // meta 는 기기마다 하나(어느 계정과 맞췄는지 알아야 한다), 기기 id ↔ 서버 id 짝은 계정마다 따로 둔다(서버 id 가 계정마다 다르다)
  const metaKey = `${key}:meta`, idKey = id => `${key}:${account}:id:${String(id).toLowerCase()}`, localKey = id => `${key}:${account}:local:${String(id).toLowerCase()}`
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('스티커 보관함 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const writeMeta = async next => { meta = next; await storage.setItem(metaKey, JSON.stringify(next)) }

  // 기기 폴더를 서버 문서 모양으로. upload 가 거짓이면 아직 올리지 않은 스티커는 빠진다(바뀌었는지 비교할 때)
  async function toServer(folders, upload) {
    const out = []
    for (const folder of folders ?? []) {
      if (!folder || !FOLDER_ID.test(String(folder.id ?? ''))) continue
      const items = []
      for (const item of folder.items ?? []) {
        if (!syncable(item)) continue
        if (!item.mediaFileId) { items.push(serverItem(item, null)); continue }
        let serverId = await storage.getItem(idKey(item.mediaFileId)); active()
        if (!uuid(serverId) && upload) {
          try {
            serverId = await media.upload(item.mediaFileId); active()
            if (!uuid(serverId)) throw Error('업로드 응답을 확인하지 못했어요.')
            await storage.setItem(idKey(item.mediaFileId), serverId)
            await storage.setItem(localKey(serverId), item.mediaFileId) // 서버에서 다시 받을 때 이 기기의 원본을 그대로 쓴다
          } catch (error) {
            if (error?.code === 'SYNC_CLOSED') throw error
            onError(error); serverId = null // 올리지 못한 스티커는 이번에는 빼고, 다음 저장에서 다시 시도한다
          }
        }
        if (uuid(serverId)) items.push(serverItem(item, serverId))
      }
      out.push({ id: folder.id, name: serverFolderName(folder.name), items })
    }
    return out
  }

  // 서버 문서를 기기에 들인다: 이 기기가 올린 스티커는 기기 원본을 그대로 쓰고, 나머지 이미지는 내려받아 서버 id 로 저장한 뒤 폴더를 바꾼다
  async function adopt(server) {
    const folders = []
    for (const folder of server.folders) {
      const items = []
      for (const item of folder.items) {
        if (!item.mediaFileId) { items.push(localItem(item)); continue }
        const mine = await storage.getItem(localKey(item.mediaFileId)); active()
        if (uuid(mine)) { items.push(localItem({ ...item, mediaFileId: mine })); continue }
        // 서버 id 는 내려받기 성공과 상관없이 짝을 기록한다(받지 못한 스티커를 '안 올린 스티커'로 보고 서버에서 빼지 않게)
        await storage.setItem(idKey(item.mediaFileId), item.mediaFileId); active()
        try { await media.download(item.mediaFileId); active() }
        catch (error) { if (error?.code === 'SYNC_CLOSED') throw error; onError(error) } // 못 받은 이미지도 칸은 남기고(서버에도 있다) 다음에 다시 받는다
        items.push(localItem(item))
      }
      folders.push({ id: folder.id, name: folder.name, items })
    }
    active()
    applying = true
    try { decor.replace(folders) } finally { applying = false }
    await writeMeta({ account, version: server.version, synced: stable(server.folders) })
  }

  async function push(folders, version) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await api.put(version, folders); active()
        await writeMeta({ account, version: saved.version, synced: stable(saved.folders) })
        return saved
      } catch (error) {
        if (error?.status !== 409) throw error
        // 다른 기기가 먼저 바꿨다: 서버 것을 받아 내 변경을 얹어 다시 저장한다
        const server = await api.get(); active()
        folders = mergeFolders(folders, server.folders); version = server.version
      }
    }
    throw Object.assign(Error('다른 기기의 변경과 계속 겹쳐 저장하지 못했어요.'), { status: 409 })
  }

  async function reconcile() {
    active()
    meta ??= await readMeta(); active()
    const server = await api.get(); active()
    const local = decor.snapshot() ?? []
    if (meta && meta.account !== account) return adopt(server) // 다른 계정이 쓰던 기기: 그 스티커를 이 계정에 올리지 않는다
    if (!meta && !local.length) return adopt(server) // 새 기기 · 재설치: 서버 보관함을 그대로 받는다
    const known = await toServer(local, false); active()
    const localChanged = !meta || stable(known) !== meta.synced || known.length !== local.length || hasUnsent(local, known)
    const serverChanged = !meta || server.version !== meta.version
    if (!localChanged && !serverChanged) return null
    if (!localChanged) return adopt(server)
    const mine = await toServer(local, true); active()
    if (!serverChanged) return push(mine, server.version)
    const merged = mergeFolders(mine, server.folders)
    const saved = await push(merged, server.version)
    // 합친 결과에 서버에서 온 스티커가 있으면 기기에도 들인다
    if (stable(merged) !== stable(mine)) await adopt(saved)
    return saved
  }
  const hasUnsent = (local, known) => local.some((folder, index) => (folder.items ?? []).filter(syncable).length !== (known[index]?.items.length ?? -1))

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
    /** 처음 맞추고, 그 뒤 기기 보관함이 바뀔 때마다(잠시 모아) 올린다 */
    start() {
      unsubscribe = decor.subscribe(() => { if (!applying) schedule() }) // 받아서 바꾼 것은 다시 올리지 않는다
      return run()
    },
    /** 지금 바로 다시 맞춘다(앱이 다시 앞으로 왔을 때 등) */
    sync: run,
    whenIdle: async () => { while (running || timer != null) { if (timer != null) { clearTimer(timer); timer = null; run() } await running } },
    stop() { closed = true; if (timer != null) clearTimer(timer); timer = null; unsubscribe?.() },
  }
}
