// 꾸미기 공방 내 속지(PDF 로 만든 속지 묶음 목록)와 기본 속지 스타일을 계정 서버와 맞춘다. 맞추는 규칙은 내 표지(coverLibrarySync.js)와 같고,
// 묶음마다 쪽 그림이 여럿이라는 점과 문서에 기본 속지 스타일 한 칸이 함께 있다는 점만 다르다.
// - 쪽 그림은 /api/v1/media 에 올리고, 문서 { papers, style } 은 /api/v1/me/paper-library 한 벌로 저장한다(version 으로 동시 저장을 막는다).
// - 기기의 쪽은 기기 미디어 id 를 쓰고, 서버 문서에는 서버 미디어 id 를 쓴다. 둘의 짝은 storage 에 기록한다(받은 그림은 둘이 같다).
// - 확대용 원본 PDF(pdfSource)는 기기에만 둔다. 서버 문서에는 넣지 않고, 받을 때 이 기기에 같은 쪽이 있으면 그대로 이어 붙인다.
// - 이 기기에서 마지막으로 맞춘 상태(meta: 계정 · 서버 version · 그때의 문서)를 기억해 어느 쪽이 바뀌었는지 가린다.
//   같은 계정: 기기만 바뀜 → 올림, 서버만 바뀜 → 받음, 둘 다 → 합쳐 올림. 이 기기 처음: 합쳐 올림. 다른 계정이 쓰던 기기: 서버 것을 받음.
//   합치기는 속지를 id 로 가려 모두 남기고(같은 속지를 양쪽에서 고쳤으면 이 기기 것), 스타일은 이 기기에서 고른 값이 있으면 그것을 쓴다.
// 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = value => typeof value === 'string' && UUID.test(value)
const ENTRY_ID = /^[A-Za-z0-9_-]{1,64}$/
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g
const clip = (value, max) => Array.from(String(value ?? '').replace(CONTROL_CHARS, '')).slice(0, max).join('')

export const PAPER_SYNC_DEBOUNCE_MS = 1500
// 서버(PaperLibraryService)와 같은 한도. 넘는 속지는 보내지 않고 기기에만 남긴다
export const PAPER_LIBRARY_LIMITS = Object.freeze({ papers: 100, pages: 100, name: 40, date: 40 })
const ORIENTATIONS = new Set(['portrait', 'landscape'])
const HEX = /^#[0-9A-F]{6}$/
const FONT = /^[A-Za-z0-9_-]{1,40}$/
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/
const stable = document => JSON.stringify({ papers: document.papers, style: document.style ?? null })

/** 서버 문서 모양의 스타일(칸 순서는 서버 응답 PaperStyle 과 같게). 보낼 수 없으면 null */
function serverStyle(style) {
  if (!style || !HEX.test(style.backgroundColor ?? '') || !HEX.test(style.layoutColor ?? '')) return null
  return { backgroundColor: style.backgroundColor, layoutColor: style.layoutColor, ...(FONT.test(style.font ?? '') ? { font: style.font } : {}) }
}

/** 서버로 보낼 수 있는 속지인지(서버가 거절할 속지는 기기에만 남긴다) */
function syncable(entry) {
  return !!entry && ENTRY_ID.test(String(entry.id ?? '')) && Array.isArray(entry.pages) && entry.pages.length > 0 && entry.pages.length <= PAPER_LIBRARY_LIMITS.pages
    && entry.pages.every(page => typeof page?.mediaFileId === 'string' && page.mediaFileId && Number.isFinite(page.aspect) && page.aspect > 0 && page.aspect <= 100)
}
const name = (value, fallback) => clip(String(value ?? '').trim(), PAPER_LIBRARY_LIMITS.name).trim() || fallback
/** 서버 문서의 속지 하나. 칸 순서는 서버 응답(PaperEntry · PaperPage)과 같게 둔다(바뀌었는지 문자열로 비교한다) */
function serverEntry(entry, pages) {
  const out = { id: entry.id, name: name(entry.name, '내 속지') }
  if (typeof entry.createdAt === 'string' && entry.createdAt && entry.createdAt.length <= PAPER_LIBRARY_LIMITS.date && !CONTROL.test(entry.createdAt)) out.createdAt = entry.createdAt
  out.orientation = ORIENTATIONS.has(entry.orientation) ? entry.orientation : 'portrait'
  out.pages = pages
  return out
}

/** 두 목록(서버 문서 모양)을 합친다: 앞쪽(base) 순서를 지키고 뒤쪽(extra)에만 있는 속지를 덧붙인다 */
export function mergePapers(base, extra) {
  const ids = new Set(base.map(entry => entry.id))
  return [...base, ...extra.filter(entry => !ids.has(entry.id))]
}

/**
 * account: 지금 로그인한 계정 id(문자열)
 * api: { get() → { version, papers, style }, put(expectedVersion, papers, style) → { version, papers, style } } (409 는 error.status === 409)
 * media: { upload(localId, category) → 서버 id, download(serverId) → 기기에 저장(이미 있으면 그대로) }
 * library: { ready() → 기기 값을 읽은 뒤 풀리는 Promise, papers() → 기기 내 속지[], style() → 고른 기본 속지 스타일(없으면 null),
 *            subscribe(listener) → 해제 함수, replacePapers(papers, base) → base 가 지금 목록과 같을 때만 바꾸고 적용한 목록(아니면 null),
 *            replaceStyle(style, base) → base 가 지금 값과 같을 때만 바꾸고 { style: 적용한 값 }(아니면 null) }
 * storage · key: 이 기기에서 맞춘 상태(meta) · 기기 id → 서버 id 짝 · 받지 못한 쪽 그림을 둔다
 * onStatus({ error }): 맞추기 결과(올리지 못한 속지 · 받지 못한 쪽 그림 · 연결 오류가 있으면 문구)
 */
export function createPaperLibrarySync({ account, api, media, library, storage, key, isActive = () => true, setTimer = setTimeout, clearTimer = clearTimeout, debounceMs = PAPER_SYNC_DEBOUNCE_MS, onError = () => {}, onStatus = () => {} }) {
  const metaKey = `${key}:meta`, idKey = id => `${key}:${account}:id:${String(id).toLowerCase()}`, localKey = id => `${key}:${account}:local:${String(id).toLowerCase()}`
  const missingKey = `${key}:${account}:missing`, stashKey = owner => `${key}:${owner}:stash`
  // 다른 계정으로 바뀔 때 따로 둔 이 계정 몫: { papers(그때 기기 목록), style(그때 고른 스타일), synced(그때 이 계정과 맞춘 문서) }
  const readStash = async () => {
    try { const value = JSON.parse(await storage.getItem(stashKey(account)) ?? 'null'); return value && Array.isArray(value.papers) ? value : null } catch { return null }
  }
  let meta = null, timer = null, running = null, again = false, closed = false, unsubscribe = null, applying = false
  const active = () => { if (closed || !isActive()) throw Object.assign(Error('내 속지 동기화가 끝났어요.'), { code: 'SYNC_CLOSED' }) }
  const readMeta = async () => { try { const value = JSON.parse(await storage.getItem(metaKey) ?? 'null'); return value && typeof value === 'object' ? value : null } catch { return null } }
  const writeMeta = async (version, document) => { meta = { account, version, synced: stable(document) }; await storage.setItem(metaKey, JSON.stringify(meta)) }

  // 기기 속지 하나를 서버 문서 모양으로. 쪽 하나라도 서버 id 가 없으면(올리지 못했거나 upload 가 거짓) null
  async function toServerEntry(entry, upload) {
    const pages = []
    for (const page of entry.pages) {
      const localId = page.mediaFileId
      let serverId = await storage.getItem(idKey(localId)); active()
      if (!uuid(serverId) && upload) {
        try {
          serverId = await media.upload(localId, 'PHOTO'); active()
          if (!uuid(serverId)) throw Error('업로드 응답을 확인하지 못했어요.')
          await storage.setItem(idKey(localId), serverId)
          await storage.setItem(localKey(serverId), localId) // 서버에서 다시 받을 때 이 기기의 원본을 그대로 쓴다
        } catch (error) {
          if (error?.code === 'SYNC_CLOSED') throw error
          onError(error); serverId = null // 올리지 못한 속지는 이번에는 빼고, 다음 저장에서 다시 시도한다
        }
      }
      if (!uuid(serverId)) return null
      pages.push({ mediaFileId: serverId, aspect: page.aspect, name: name(page.name, 'PDF') })
    }
    return serverEntry(entry, pages)
  }
  // 기기 목록을 서버 문서 모양으로. 보낼 수 없는 속지 · 쪽을 아직 올리지 못한 속지 · 한도를 넘는 속지는 빠진다(기기에만 남는다).
  // 결과 배열의 pending: 보낼 수 있는데 쪽 그림을 아직 올리지 못한 속지 수
  async function toServer(papers, upload) {
    const out = []
    let pending = 0
    for (const entry of papers ?? []) {
      if (out.length >= PAPER_LIBRARY_LIMITS.papers) break
      if (!syncable(entry)) continue
      const sent = await toServerEntry(entry, upload)
      if (sent) out.push(sent)
      else pending++
    }
    out.pending = pending
    return out
  }

  // 내려받지 못한 서버 쪽 그림 id. 맞출 때마다 다시 받아 보고, 남아 있으면 공방에 알린다(앱을 다시 켜도 이어서 받는다)
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
  // 지난번에 받지 못한 쪽 그림을 다시 받는다. 그사이 목록에서 빠진 속지의 쪽은 더 받지 않는다
  async function retryMissing() {
    await readMissing(); active()
    if (!missing.size) return
    const present = new Set((library.papers() ?? []).flatMap(entry => (entry?.pages ?? []).map(page => page?.mediaFileId)).filter(uuid))
    for (const id of [...missing]) {
      if (present.has(id)) await fetchImage(id)
      else missing.delete(id)
    }
    await writeMissing(); active()
  }

  // 서버 문서를 기기에 들인다: 이 기기가 올린 그림은 기기 원본을 그대로 쓰고, 나머지는 내려받아 서버 id 로 저장한 뒤 목록 · 스타일을 바꾼다.
  // keepLocal 이면 아직 서버에 없는 기기 속지(올리지 못한 속지 · 보낼 수 없는 속지 · 한 번도 맞춘 적 없는 속지)는 지우지 않고 남긴다.
  // restore: 이 계정이 예전에 이 기기에 남겨 둔 몫(stash). 그중 아직 서버에 없는 속지를 같은 규칙으로 되살리고, 서버에 스타일이 없으면 그때 고른 스타일을 되살린다.
  // 받는 사이 이 기기에서 고치면 들이지 않고 false(그 편집을 덮어쓰지 않는다). 바뀐 값은 다시 맞춘다
  async function adopt(server, { keepLocal = true, restore = null } = {}) {
    await readMissing(); active()
    const base = library.papers() ?? [], baseStyle = library.style()
    const before = new Map(base.map(entry => [entry.id, entry]))
    const papers = []
    for (const entry of server.papers) {
      const pages = []
      for (const page of entry.pages) {
        const serverId = page.mediaFileId
        let id = serverId
        const mine = await storage.getItem(localKey(serverId)); active()
        if (typeof mine === 'string' && mine) id = mine
        else {
          // 서버 id 는 내려받기 성공과 상관없이 짝을 기록한다(받지 못한 그림을 '안 올린 그림'으로 보고 서버에서 빼지 않게)
          await storage.setItem(idKey(serverId), serverId); active()
          await fetchImage(serverId) // 못 받은 쪽도 속지는 남기고 다음 맞추기에서 다시 받는다
        }
        // 이 기기에 같은 쪽이 있었으면 확대용 원본 PDF 연결을 그대로 둔다
        const kept = before.get(entry.id)?.pages?.find(old => old.mediaFileId === id)?.pdfSource
        pages.push({ src: `media:${id}`, mediaFileId: id, aspect: page.aspect, name: page.name ?? 'PDF', ...(kept ? { pdfSource: kept } : {}) })
      }
      papers.push({ id: entry.id, name: entry.name, createdAt: entry.createdAt ?? null, orientation: entry.orientation, pages })
    }
    await writeMissing(); active()
    const kept = keepLocal ? await unsent(base, papers, syncedIds(meta?.synced)) : []
    const restored = restore ? await unsent(restore.papers, papers, syncedIds(restore.synced)) : []
    const next = [...restored, ...kept, ...papers]
    const restoredStyle = !server.style && restore?.style ? restore.style : null
    const style = server.style ?? (keepLocal ? baseStyle : restoredStyle)
    active()
    // replace 가 돌려준 값(적용한 것)과 지금 값이 다르면 그사이 사용자가 고친 것이다. 받아서 바꾼 알림은 무시하지만 그 편집은 다시 맞춘다
    applying = true
    let applied, appliedStyle
    try {
      applied = await library.replacePapers(next, base)
      appliedStyle = applied ? await library.replaceStyle(style, baseStyle) : null
    } finally { applying = false }
    if (!applied || !appliedStyle) { again = true; return false } // 받는 사이 이 기기에서 고쳤다: 기록을 남기지 않고 곧 다시 맞춘다
    // 되살린 속지 · 스타일은 다음 맞추기에서 올린다
    if (library.papers() !== applied || library.style() !== appliedStyle.style || restored.length || restoredStyle) again = true
    await writeMeta(server.version, server)
    return true
  }

  const syncedIds = synced => { try { return new Set(JSON.parse(synced ?? '{}').papers?.map(entry => entry.id) ?? []) } catch { return new Set() } }
  // 서버 목록에 없는 기기 속지 중 남길 것: 예전에 맞춘 적 있으면(previous) 다른 기기에서 지운 것이라 빼고, 한 번도 맞춘 적 없거나 아직 보낼 수 없으면 남긴다
  async function unsent(local, papers, previous) {
    const inServer = new Set(papers.map(entry => entry.id))
    const out = []
    for (const entry of local ?? []) {
      if (!entry || inServer.has(entry.id)) continue
      if (!syncable(entry) || !previous.has(entry.id) || !await toServerEntry(entry, false)) out.push(entry)
      active()
    }
    return out
  }

  async function push(document, version) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const saved = await api.put(version, document.papers, document.style); active()
        await writeMeta(saved.version, saved)
        return saved
      } catch (error) {
        if (error?.status !== 409) throw error
        // 다른 기기가 먼저 바꿨다: 서버 것을 받아 내 변경을 얹어 다시 저장한다
        const server = await api.get(); active()
        document = { papers: mergePapers(document.papers, server.papers), style: document.style ?? server.style ?? null }; version = server.version
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
    const local = library.papers() ?? [], localStyle = serverStyle(library.style())
    // 들이는 동안 기기 값이 바뀌어 들이지 않았으면(adopt 가 false) 알리지 않고 다시 맞춘다
    // 다른 계정이 쓰던 기기: 그 속지 · 스타일을 이 계정에 올리지 않는다. 지우지도 않고 그 계정 몫(stash)으로 따로 두었다가 그 계정으로 다시 로그인하면 되살린다
    // (올리지 못해 서버에 없던 속지가 계정을 바꾸는 순간 사라지지 않게). 이 계정이 남겨 둔 몫이 있으면 함께 되살린다
    if (meta && meta.account !== account) {
      await storage.setItem(stashKey(meta.account), JSON.stringify({ papers: local, style: library.style() ?? null, synced: meta.synced ?? '{}' })); active()
      const restore = await readStash(); active()
      if (!await adopt(server, { keepLocal: false, restore })) return null
      if (restore) await storage.setItem(stashKey(account), 'null')
      return report(0)
    }
    if (!meta && !local.length && !localStyle) return await adopt(server) ? report(0) : null // 새 기기 · 재설치: 서버 문서를 그대로 받는다
    const known = { papers: await toServer(local, false), style: localStyle }; active()
    const localChanged = !meta || stable(known) !== meta.synced || known.papers.length !== local.length
    const serverChanged = !meta || server.version !== meta.version
    if (!localChanged && !serverChanged) return report(0)
    if (!localChanged) return await adopt(server) ? report(0) : null
    const mine = { papers: await toServer(local, true), style: localStyle }; active()
    // 보낼 것이 그대로면(올리지 못한 속지만 남았으면) 서버가 바뀐 경우에만 받는다
    if (meta && stable(mine) === meta.synced) return serverChanged && !await adopt(server) ? null : report(mine.papers.pending)
    const sending = serverChanged ? { papers: mergePapers(mine.papers, server.papers), style: mine.style ?? server.style ?? null } : mine
    const saved = await push(sending, server.version)
    // 저장된 결과가 기기에서 보낸 것과 다르면(서버 것과 합쳤으면) 기기에도 들인다. 들이지 않으면 다음 맞추기에서 다른 기기 속지를 서버에서 지운다
    if (stable(saved) !== stable(mine)) await adopt(saved)
    report(mine.papers.pending)
    return saved
  }
  // 맞추기 결과를 알린다: 올리지 못한 속지나 받지 못한 쪽 그림이 남았으면 실패, 아니면 정상
  function report(pending) {
    const failures = []
    if (pending > 0) failures.push(`속지 ${pending}개를 계정에 올리지 못했어요. 다른 기기에서는 보이지 않아요.`)
    if (missing?.size) failures.push(`속지 쪽 그림 ${missing.size}개를 받지 못했어요. 연결을 확인해 주세요.`)
    onStatus({ error: failures.length ? failures.join(' ') : null })
    return null
  }

  function run() {
    if (running) { again = true; return running }
    running = reconcile().catch(error => {
      if (error?.code === 'SYNC_CLOSED') return
      onError(error)
      onStatus({ error: error?.status === 409 ? '다른 기기의 변경과 계속 겹쳐 내 속지를 계정에 저장하지 못했어요.' : '내 속지를 계정과 맞추지 못했어요. 연결을 확인해 주세요.' })
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
    /** 처음 맞추고, 그 뒤 기기 목록 · 스타일이 바뀔 때마다(잠시 모아) 올린다 */
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
