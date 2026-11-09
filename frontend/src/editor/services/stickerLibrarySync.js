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
// 서버(StickerLibraryService)와 같은 한도. 넘는 것은 서버가 문서 전체를 거절하므로 보내기 전에 맞춘다
export const LIBRARY_LIMITS = Object.freeze({ folders: 200, items: 3000, folderName: 40, text: 200 })
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g, HAS_CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const codePoints = value => Array.from(String(value))
/** 글자(제어 문자 제외)를 max 글자까지 */
const clip = (value, max) => codePoints(String(value ?? '').replace(CONTROL, '')).slice(0, max).join('')
// 스티커 종류 값(builtin 등)은 자르면 다른 스티커가 되므로, 한도를 넘거나 제어 문자가 있으면 그 칸을 보내지 않는다(기기에만 남는다)
const validKind = value => typeof value === 'string' && value !== '' && codePoints(value).length <= LIBRARY_LIMITS.text && !HAS_CONTROL.test(value)

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
const stable = folders => JSON.stringify(folders)
const serverFolderName = name => clip(String(name ?? '').trim(), LIBRARY_LIMITS.folderName).trim() || '내 스티커'

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
export function createStickerLibrarySync({ account, api, media, decor, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = STICKER_SYNC_DEBOUNCE_MS, onError = () => {}, onStatus = () => {} }) {
  // meta 는 기기마다 하나(어느 계정과 맞췄는지 알아야 한다), 기기 id ↔ 서버 id 짝은 계정마다 따로 둔다(서버 id 가 계정마다 다르다)
  const metaKey = `${key}:meta`, idKey = id => `${key}:${account}:id:${String(id).toLowerCase()}`, localKey = id => `${key}:${account}:local:${String(id).toLowerCase()}`
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('스티커 보관함 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const writeMeta = async next => { meta = next; await storage.setItem(metaKey, JSON.stringify(next)) }

  // 기기 폴더를 서버 문서 모양으로. upload 가 거짓이면 아직 올리지 않은 스티커는 빠진다(바뀌었는지 비교할 때)
  // 폴더 200개 · 스티커 3000개를 넘는 것은 보내지 않는다(기기에만 남고, 받아 바꿀 때도 지우지 않는다)
  // 결과 배열의 pending: 보낼 수 있는데 아직 서버 짝이 없는(올리지 못한) 스티커 수. 보낼 수 없는 폴더 · 칸 · 한도 초과는 세지 않는다
  async function toServer(folders, upload) {
    const out = []
    let total = 0, pending = 0
    for (const folder of folders ?? []) {
      if (!folder || !FOLDER_ID.test(String(folder.id ?? ''))) continue
      if (out.length >= LIBRARY_LIMITS.folders) break
      const items = []
      for (const item of folder.items ?? []) {
        if (!syncable(item)) continue
        if (total >= LIBRARY_LIMITS.items) break
        total++
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
        else pending++
      }
      out.push({ id: folder.id, name: serverFolderName(folder.name), items })
    }
    out.pending = pending
    return out
  }

  // 서버 문서를 기기에 들인다: 이 기기가 올린 스티커는 기기 원본을 그대로 쓰고, 나머지 이미지는 내려받아 서버 id 로 저장한 뒤 폴더를 바꾼다.
  // keepLocal 이면 아직 서버에 없는 기기 것(올리지 못한 스티커 · 보낼 수 없는 칸 · 한 번도 맞춘 적 없는 폴더)은 지우지 않고 남긴다.
  // 다른 계정이 쓰던 기기에서는 남기지 않는다(그 계정의 스티커를 이 계정 보관함에 섞지 않는다)
  async function adopt(server, { keepLocal = true } = {}) {
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
    if (keepLocal) await keepUnsent(folders)
    active()
    applying = true
    try { decor.replace(folders) } finally { applying = false }
    await writeMeta({ account, version: server.version, synced: stable(server.folders) })
  }

  async function keepUnsent(folders) {
    let previous = new Set()
    try { previous = new Set(JSON.parse(meta?.synced ?? '[]').map(folder => folder.id)) } catch { /* 처음 맞추는 기기 */ }
    for (const folder of decor.snapshot() ?? []) {
      if (!folder) continue
      const leftovers = []
      for (const item of folder.items ?? []) {
        if (!syncable(item)) { leftovers.push(item); continue }
        if (item.mediaFileId && !uuid(await storage.getItem(idKey(item.mediaFileId)))) leftovers.push(item) // 아직 올리지 못한 스티커
      }
      active()
      const target = folders.find(item => item.id === folder.id)
      if (target) { target.items.push(...leftovers); continue }
      // 서버에 없는 폴더: 예전에 맞춘 적 있으면 다른 기기에서 지운 것이라 지우고, 한 번도 맞춘 적 없으면(보낼 수 없는 id · 한도 초과 · 새 폴더) 그대로 둔다
      if (!FOLDER_ID.test(String(folder.id ?? '')) || !previous.has(folder.id)) folders.push(folder)
      else if (leftovers.length) folders.push({ ...folder, items: leftovers })
    }
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
    if (meta && meta.account !== account) return adopt(server, { keepLocal: false }) // 다른 계정이 쓰던 기기: 그 스티커를 이 계정에 올리지 않는다
    if (!meta && !local.length) return adopt(server) // 새 기기 · 재설치: 서버 보관함을 그대로 받는다
    // 바뀌었는지는 보낼 수 있는 것끼리만 비교한다(보낼 수 없는 폴더 · 칸 · 한도 초과가 있다고 매번 저장하지 않는다).
    // 아직 올리지 못한 스티커가 있으면 업로드를 다시 시도한다
    const known = await toServer(local, false); active()
    const localChanged = !meta || stable(known) !== meta.synced || known.pending > 0
    const serverChanged = !meta || server.version !== meta.version
    if (!localChanged && !serverChanged) return report(0)
    if (!localChanged) { await adopt(server); return report(0) }
    const mine = await toServer(local, true); active()
    // 다시 올려 봤지만 새로 올라간 것이 없고 서버도 그대로면 저장하지 않는다(version 만 올라 다른 기기가 매번 다시 받지 않게)
    if (!serverChanged && meta && stable(mine) === meta.synced) return report(mine.pending)
    const saved = await push(serverChanged ? mergeFolders(mine, server.folders) : mine, server.version)
    // 저장된 결과가 기기에서 보낸 것과 다르면(서버 것과 합쳤거나, 저장 중 409 로 다른 기기의 변경을 합쳤으면) 기기에도 들인다.
    // 들이지 않으면 다음 맞추기에서 기기 목록이 '바뀜'으로 보여 다른 기기의 폴더 · 스티커를 서버에서 지운다
    if (stable(saved.folders) !== stable(mine)) await adopt(saved)
    report(mine.pending)
    return saved
  }
  // 맞추기 결과를 알린다: 올리지 못한 스티커가 남았으면 실패, 아니면 정상
  function report(pending) {
    onStatus(pending > 0 ? { error: `스티커 ${pending}개를 계정에 올리지 못했어요. 다른 기기에서는 보이지 않아요.` } : { error: null })
    return null
  }

  function run() {
    if (running) { again = true; return running }
    running = reconcile().catch(error => {
      if (error?.code === 'SYNC_CLOSED') return
      onError(error)
      onStatus({ error: error?.status === 409 ? '다른 기기의 변경과 계속 겹쳐 스티커 보관함을 계정에 저장하지 못했어요.' : '스티커 보관함을 계정과 맞추지 못했어요. 연결을 확인해 주세요.' })
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
