// 공유 다이어리의 손글씨 폰트. 런타임 의존성은 모두 주입받는다(테스트에서 바꿔 끼운다).
// - 보내는 쪽: 내 폰트로 쓴 글자를 서버에 올리기 전에 폰트 파일을 /media(FONT)에 한 번 올리고 이 다이어리에 공유한다.
// - 받는 쪽: 다이어리 폰트 목록을 받아 기기에 없는 폰트 파일을 내려받아 그 글자를 그릴 수 있게 등록한다.
// 글자 요소는 font: 'personal-<fileId>' 를 그대로 쓴다. 서버 파일과 잇기 위해 올릴 때 파일 이름을 dio-hw-<fileId>.ttf 로 둔다
// (서버는 원본 파일 이름을 폰트 목록의 name 으로 돌려준다). 요소 형식은 바꾸지 않는다.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const uuid = value => typeof value === 'string' && UUID.test(value)
const PERSONAL_FONT = /^personal-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i
const FONT_TYPES = new Set(['TEXT', 'SHAPE'])
export const SHARED_FONT_MAX_BYTES = 25 * 1024 * 1024
// 기기에 없는 폰트를 다시 찾아보는 최소 간격. 글자가 폰트 공유보다 먼저 도착하면 다음 기회에 다시 받는다
const RETRY_MS = 10000

export const sharedFontFileName = fileId => `dio-hw-${String(fileId).toLowerCase()}.ttf`
export function fileIdFromSharedName(name) {
  const match = /^dio-hw-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(?:ttf|otf)$/i.exec(typeof name === 'string' ? name : '')
  return match ? match[1].toLowerCase() : null
}
export function personalFontFileId(font) {
  const match = typeof font === 'string' ? PERSONAL_FONT.exec(font) : null
  return match ? match[1].toLowerCase() : null
}
/** 서버 요소 목록(또는 캔버스 작업 본문의 creates · updates)에서 내 폰트 파일 id 를 모은다 */
export function personalFontIds(rows) {
  const ids = new Set()
  for (const row of rows ?? []) {
    if (!FONT_TYPES.has(String(row?.elementType ?? '').toUpperCase())) continue
    const id = personalFontFileId(row.propertiesJson?.font)
    if (id) ids.add(id)
  }
  return [...ids]
}
const bodyRows = body => [...(body?.changes?.creates ?? []), ...(body?.changes?.updates ?? [])]
// 받은 파일이 TrueType · OpenType 인지(서버도 같은 머리를 본다). 기기 폰트 파서에 다른 파일을 넘기지 않는다
const FONT_SIGNATURES = [0x00010000, 0x4f54544f /* OTTO */, 0x74727565 /* true */]
export function isFontBytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length < 12) return false
  const head = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
  return FONT_SIGNATURES.includes(head)
}

/**
 * diaryId: 서버 다이어리 id
 * transport: JSON API(목록 · 공유). request: 파일 업로드 · 내려받기(createMediaRequest)
 * files: { upload(font) → 업로드 본문, cachedUri(mediaFileId) → uri|null, save(mediaFileId, bytes) → uri }
 * library: { mine() → 이 기기의 내 폰트 목록, has(fileId) → 이미 그릴 수 있는지, register(fonts[{ fileId, mediaFileId, uri }]), unregister(fileIds) }
 * storage · key: 올린 폰트의 서버 id 기록(계정 · 서버마다 한 번만 올린다)
 * consent: { status() → 'granted'|'denied'|null, ask() → 공유하기면 true } 내 폰트를 올려도 되는지(handwriting/fontShareConsent.js)
 */
const ALWAYS_GRANTED = { status: async () => 'granted', ask: async () => true }
export function createDiaryFonts({ diaryId, transport, request, files, library, storage, key, isActive = () => true, ready = Promise.resolve(), consent = ALWAYS_GRANTED, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  if (!uuid(diaryId)) throw Error('다이어리 ID를 확인해 주세요.')
  // shared: 이 다이어리에 내 파일로 공유된 것을 확인한 내 폰트 id. registered: 이 세션에서 받아 등록한 친구 폰트 id → 서버 파일 id
  const shared = new Set(), sharing = new Map(), registered = new Map()
  let syncJob = null, lastSync = -Infinity, disposed = false
  const active = () => { if (!isActive()) throw Error('편집 세션이 종료됐어요.') }
  const uploadKey = fileId => `${key}:${fileId}`

  async function uploaded(font) {
    const saved = await storage.getItem(uploadKey(font.fileId)); active()
    if (uuid(saved)) return saved
    const body = await request('/media', { method: 'POST', body: await files.upload(font), timeoutMs: 120000 }); active()
    if (!uuid(body?.mediaFileId)) throw Error('폰트 업로드 응답을 확인하지 못했어요.')
    await storage.setItem(uploadKey(font.fileId), body.mediaFileId); active()
    return body.mediaFileId
  }
  function share(fileId) {
    if (shared.has(fileId)) return Promise.resolve()
    if (sharing.has(fileId)) return sharing.get(fileId)
    const job = (async () => {
      const font = (await library.mine()).find(item => item.fileId?.toLowerCase() === fileId && !item.missing); active()
      if (!font) return // 친구의 폰트이거나 이 기기에서 파일을 잃은 폰트: 올릴 것이 없다
      // 폰트 파일은 다른 멤버가 내려받을 수 있게 되므로 동의를 받은 뒤에만 올린다
      const permission = await consent.status(); active()
      if (permission === null) { askLater(fileId); return } // 아직 묻지 않음
      if (permission !== 'granted') return // 거부 또는 저장소를 읽지 못함: 올리지도 묻지도 않는다(다음 저장에서 다시 읽는다)
      let mediaFileId = await uploaded(font)
      try { await transport({ method: 'POST', path: `/diaries/${diaryId}/fonts`, body: { mediaFileId } }) }
      catch (error) {
        if (error?.status !== 404) throw error
        // 서버에서 지워진 파일이면 기록을 비우고 한 번 다시 올린다
        await storage.removeItem?.(uploadKey(fileId)); active()
        mediaFileId = await uploaded(font)
        await transport({ method: 'POST', path: `/diaries/${diaryId}/fonts`, body: { mediaFileId } })
      }
      active(); shared.add(fileId)
    })().finally(() => sharing.delete(fileId))
    sharing.set(fileId, job)
    return job
  }
  // 아직 묻지 않았으면: 글자 저장은 기다리게 하지 않고 확인 창을 한 번 띄운다. 공유하기를 고르면 그동안 모인 폰트를 바로 공유한다
  const waiting = new Set()
  let asking = null
  function askLater(fileId) {
    waiting.add(fileId)
    if (asking) return
    asking = Promise.resolve().then(() => consent.ask()).then(granted => {
      const ids = [...waiting]; waiting.clear()
      if (granted && !disposed && isActive()) for (const id of ids) share(id).catch(() => {})
    }, () => { waiting.clear() }).finally(() => { asking = null })
  }

  async function download() {
    await ready; active() // 기기 캐시 정리(다른 계정 파일 지우기)가 끝난 뒤에 받는다
    const list = await transport({ path: `/diaries/${diaryId}/fonts` }); active()
    if (!Array.isArray(list)) throw Error('다이어리 폰트 목록을 확인하지 못했어요.')
    const fetched = []
    // 내 폰트(파일이 기기에 있는 것)는 아직 글꼴 등록 전이어도 받지 않는다
    const own = new Set((await library.mine().catch(() => [])).filter(font => !font.missing).map(font => font.fileId?.toLowerCase())); active()
    // 이름(dio-hw-<폰트 id>.ttf)은 올린 사람이 정하므로 다른 멤버가 남의 폰트 id 로 다른 파일을 올릴 수 있다.
    // 서버 목록에는 올린 사람이 없어 어느 쪽이 진짜인지 알 수 없으니, 한 폰트 id 를 서로 다른 파일이 주장하면 어느 파일로도 그리지 않는다
    // (그 글자는 안내 문구로 남는다. 다른 글꼴로 바꿔치기되는 것보다 낫다)
    const entries = list.map(item => ({ item, fileId: fileIdFromSharedName(item?.name) }))
      .filter(({ item, fileId }) => fileId && item.enabled !== false && uuid(item.mediaFileId))
    const claims = new Map()
    for (const { item, fileId } of entries) claims.set(fileId, new Set([...(claims.get(fileId) ?? []), item.mediaFileId.toLowerCase()]))
    for (const [fileId, ids] of claims) {
      // 내 폰트는 내가 올린 파일(기록한 mediaFileId)이 목록에 있을 때만 공유된 것으로 본다. 남이 같은 id 를 먼저 주장해도 내 공유는 막히지 않는다
      if (!own.has(fileId)) continue
      const mine = await storage.getItem(uploadKey(fileId)).catch(() => null); active()
      if (uuid(mine) && ids.has(mine.toLowerCase())) shared.add(fileId)
    }
    // 이 세션에서 등록한 친구 폰트가 이제 다툼이 생겼거나(다른 파일이 같은 id 를 주장) 목록에서 빠졌으면 더는 그리지 않는다
    const dropped = [...registered.keys()].filter(fileId => claims.get(fileId)?.size !== 1 || !claims.get(fileId).has(registered.get(fileId)))
    if (dropped.length) { for (const fileId of dropped) registered.delete(fileId); library.unregister?.(dropped) }
    for (const [fileId, ids] of claims) {
      if (own.has(fileId) || ids.size !== 1) continue
      const item = entries.find(entry => entry.fileId === fileId).item
      if (registered.get(fileId) === item.mediaFileId.toLowerCase() || (!registered.has(fileId) && library.has(fileId))) continue
      try {
        // 캐시는 서버 파일(mediaFileId) 기준: 같은 폰트 id 를 단 다른 파일이 서로 덮어쓰지 않는다
        let uri = await files.cachedUri(item.mediaFileId); active()
        if (!uri) {
          const bytes = await request(`/diaries/${diaryId}/fonts/${item.mediaFileId}/file`, { binary: true, maxBytes: SHARED_FONT_MAX_BYTES, timeoutMs: 120000 }); active()
          if (!isFontBytes(bytes)) throw Error('폰트 파일 형식을 확인하지 못했어요.')
          uri = await files.save(item.mediaFileId, bytes); active()
        }
        fetched.push({ fileId, mediaFileId: item.mediaFileId, uri })
      } catch (error) { active() } // 한 폰트를 못 받아도 나머지는 받는다(그 글자는 안내 문구로 남는다)
    }
    for (const font of fetched) registered.set(font.fileId, font.mediaFileId.toLowerCase())
    if (fetched.length) library.register(fetched)
    return fetched
  }

  let retryTimer = null
  const clearRetry = () => { if (retryTimer != null) clearTimer(retryTimer); retryTimer = null }
  const api = {
    /** 캔버스 작업을 보내기 전에 부른다. 폰트 공유에 실패해도 글자 저장은 막지 않는다(다음 저장에서 다시 시도) */
    async prepare(body) {
      for (const fileId of personalFontIds(bodyRows(body))) {
        try { await share(fileId) } catch { /* 다음 저장에서 다시 시도한다 */ }
        if (!isActive()) return
      }
    },
    /** 다이어리 폰트 목록을 받아 기기에 없는 폰트를 등록한다. 진행 중인 받기는 하나로 합친다 */
    sync() {
      if (disposed) return Promise.resolve([])
      if (syncJob) return syncJob
      clearRetry()
      lastSync = now()
      syncJob = download().finally(() => { syncJob = null })
      return syncJob
    },
    /** 서버에서 받은 요소에 이 기기가 못 그리는 폰트가 있으면 목록을 다시 받는다.
     *  막 받은 직후라 건너뛰면 남은 시간 뒤에 한 번 다시 받는다(폰트 공유가 글자보다 늦게 끝나는 경우) */
    hydrate(rows) {
      const missing = personalFontIds(rows).filter(fileId => !library.has(fileId))
      if (disposed || !missing.length) return Promise.resolve([])
      if (syncJob) { syncJob.then(() => { if (personalFontIds(rows).some(fileId => !library.has(fileId))) api.hydrate(rows) }, () => {}); return syncJob }
      const wait = RETRY_MS - (now() - lastSync)
      if (wait <= 0) return api.sync()
      if (retryTimer == null) retryTimer = setTimer(() => { retryTimer = null; api.sync().catch(() => {}) }, wait)
      return Promise.resolve([])
    },
    /** 세션을 닫을 때: 예약한 재조회를 멈춘다 */
    dispose() { disposed = true; clearRetry() },
  }
  return api
}

/** canvasMedia 에 폰트 공유 · 받기를 붙인다. 이미지 처리는 그대로 두고 앞뒤에 폰트 일만 얹는다 */
export function withDiaryFonts(media, fonts) {
  return {
    ...media,
    async prepare(body) { await fonts.prepare(body); return media.prepare(body) },
    hydrate(rows) { fonts.hydrate(rows).catch(() => {}); return media.hydrate(rows) },
    dispose() { fonts.dispose(); return media.dispose?.() },
  }
}
