import { memberKeys } from './memberStorage.js'
import { diaryCreateInput } from './diaryCreateInput.js'
import { serverDiaryCreateInput } from './serverPaperFont.js'
import { localTemplateReference } from '../../editor/templates/serverCatalog.js'
import { createDefaultDoc } from '../../editor/state/defaultDoc.js'
import { pdfDocPage } from '../utils/pdfImport.js'
import { normalizeMemberLibraryQuery } from './memberLibraryQuery.js'
import { readStoredDocument } from '../../editor/services/readStoredDocument.js'

const clone = value => JSON.parse(JSON.stringify(value))
const failure = (code, message) => Object.assign(new Error(message), { code })
export function createMemberAppStore({ accountId, api, storage, makeRequestId, serverLibrary = false }) {
  const keys = memberKeys(accountId), listeners = new Set()
  let state = { diaries: [], loaded: false, refreshing: false, pending: null, error: null, trash:[],trashLoaded:false,trashLoading:false,trashError:null,lifecycle:null,
    library: { items: [], criteria: normalizeMemberLibraryQuery(), ready: false, loading: false, error: null, hasNext: false, nextCursor: null }, bulkTrash: null }, disposed = false, creating = null, starting = null, writable = false
  let revision = 0, listing = null, trashListing=null, lifecycleRequest=null, lifecycleRunning=null
  let librarySequence = 0, libraryRequest = null, libraryCursors = new Set(), libraryRetryMore = false, bulkRequest = null, bulkRunning = null
  const metadataVersions = new Map(), detailRequests = new Map()
  const favoriteRequests = new Map(), favoriteVersions = new Map()
  const version = id => metadataVersions.get(id) ?? 0
  const invalidateDetails = ids => { for (const id of ids) metadataVersions.set(id, version(id) + 1) }
  let queue = Promise.resolve()
  const enqueue = action => { const result = queue.then(action); queue = result.catch(() => {}); return result }
  const emit = patch => { if (!disposed) { state = { ...state, ...patch }; listeners.forEach(fn => fn()) } }
  const read = async (key, fallback) => {
    const value = await storage.getItem(key)
    if (value === null) return fallback
    try { return JSON.parse(value) } catch { throw failure('INVALID_LOCAL_CACHE', '이 계정의 저장 자료를 읽지 못했어요. 기존 자료는 유지했어요.') }
  }
  const write = (key, value) => storage.setItem(key, JSON.stringify(value))
  const isMetaObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  // 옮겨 온 다이어리의 기기 값. 서버가 받지 않는 값이라 목록에 없으면 이것으로 채운다(이후 사용자가 고친 값이 우선이다).
  const localMeta = async () => {
    try {
      const value = await read(keys.localMeta, {})
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('INVALID_LOCAL_CACHE', '표지 자료 형식을 확인하지 못했어요.')
      const entries = Object.entries(value).filter(([, item]) => isMetaObject(item))
      emit({ metadataError: entries.length === Object.keys(value).length ? null : failure('LOCAL_METADATA_UNAVAILABLE', '기기의 일부 표지 설정을 읽지 못해 원래 모습과 다를 수 있어요.') })
      return Object.fromEntries(entries)
    } catch (error) {
      if (disposed) throw error
      // Display/restore still use authoritative server rows; warn instead of hiding the list.
      emit({ metadataError: failure('LOCAL_METADATA_UNAVAILABLE', '기기의 표지 설정을 읽지 못해 일부 표지가 원래 모습과 다를 수 있어요.') })
      return {}
    }
  }
  const active = () => { if (disposed) throw failure('STALE_ACCOUNT', '계정이 바뀌어 요청을 중단했어요.') }
  const appearanceOf = row => Object.fromEntries(['cover', 'pageSize', 'templateConfig', 'paperAppearance']
    .filter(key => row?.[key] !== undefined).map(key => [key, row[key]]))
  // Persist before removing the active index entry; the trash DTO has no detailed cover/orientation.
  const preserveAppearance = id => enqueue(async () => {
    active()
    let meta
    try { meta = await read(keys.localMeta, {}) }
    catch (error) {
      if (error.code !== 'INVALID_LOCAL_CACHE') throw error
      throw failure('INVALID_LOCAL_CACHE', '표지 저장 자료가 손상되어 휴지통으로 옮기지 않았어요. 기존 자료는 유지했어요.')
    }
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) throw failure('INVALID_LOCAL_CACHE', '표지 저장 자료가 손상되어 휴지통으로 옮기지 않았어요. 기존 자료는 유지했어요.')
    if (Object.hasOwn(meta, id) && !isMetaObject(meta[id])) throw failure('INVALID_LOCAL_CACHE', '이 다이어리의 표지 저장 자료가 손상되어 휴지통으로 옮기지 않았어요. 기존 자료는 유지했어요.')
    active()
    await write(keys.localMeta, { ...meta, [id]: { ...meta[id], ...appearanceOf(state.diaries.find(row => row.id === id)) } })
    active()
  })
  const entry = (result, previous = {}) => ({ ...previous, ...result, source: 'member-api', memberAccountId: accountId,
    type: (result.isShared ?? previous.isShared) ? '공유' : '개인', canManage: result.canEdit, canDelete: result.permissions?.canTrash===true, trashedAt: null })
  const publish = (diary, detailRequest) => {
    // Mutations invalidate reads as soon as their result is ready, including while
    // persistence is queued. The read check itself runs inside that same queue.
    if (!detailRequest) { revision++; invalidateDetails([diary.id]) }
    return enqueue(async () => {
      active()
      if (detailRequest && (version(diary.id) !== detailRequest.version || detailRequests.get(diary.id) !== detailRequest.sequence)) {
        const current = state.diaries.find(item => item.id === diary.id)
        if (!current) throw failure('UNKNOWN_MEMBER_DIARY', '이 기기에 저장된 회원 다이어리를 확인해 주세요.')
        return current
      }
      if (detailRequest) revision++
      if (!writable) throw failure('READ_ONLY_CACHE', '저장 자료를 읽지 못해 덮어쓰지 않았어요.')
      const diaries = [...state.diaries.filter(d => d.id !== diary.id), diary]
      try { await write(keys.index, diaries) } catch (error) { emit({ diaries, error }); throw error }
      active(); emit({ diaries, error: null }); return diary
    })
  }
  const refreshDiary = async (id, allowUnlisted = false) => {
    active()
    const detailRequest = { version: version(id), sequence: (detailRequests.get(id) ?? 0) + 1 }
    detailRequests.set(id, detailRequest.sequence)
    let result = await api.get(id); active()
    const previous = state.diaries.find(d => d.id === id)
    // Older releases kept detailed covers only on the creator's device. Migrate
    // on the owner's next open, using the current server version and local media.
    if(!result.cover&&result.myRole==='OWNER'&&previous?.cover) {
      try { result=await api.update(id,{cover:previous.cover,expectedVersion:result.version});active() }
      catch(error) {
        active()
        if(error.status===409) { result=await api.get(id);active() }
        else emit({metadataError:failure('COVER_SYNC_FAILED','이 기기의 표지를 공유하지 못했어요. 표지를 다시 저장해 주세요.')})
      }
    }
    if (!previous && !allowUnlisted) throw failure('UNKNOWN_MEMBER_DIARY', '이 기기에 저장된 회원 다이어리를 확인해 주세요.')
    return publish(entry({ ...result, ...(allowUnlisted && result.myRole === 'EDITOR' ? { isShared: true } : {}) }, previous), detailRequest)
  }
  const createDocument = (result, input) => {
    const diary = entry({ ...result, title: result.title, templateConfig: input.templateConfig, pageSize: input.pageSize,
      paperAppearance: input.paperAppearance, favorite: false, pageCount: result.pageIds.length, ...(result.cover || input.cover ? { cover: result.cover ?? input.cover } : {}) })
    const doc = createDefaultDoc(diary)
    doc.memberAccountId = accountId
    doc.pages = input.initialPages.map((selected, index) => {
      const ref = localTemplateReference(selected.templateCode, selected.templateVersion)
      const base = { id: result.pageIds[index], ...ref, ...(selected.templateConfig.paperAppearance ? { paperAppearance: selected.templateConfig.paperAppearance } : {}), objects: [] }
      const imported = input.importedPages?.[index]
      // PDF 쪽: 서버가 만든 페이지 id 에 쪽 크기와 쪽 그림(잠근 바탕)을 얹는다. 그림과 원본 PDF 는 편집기에서 서버로 올라간다.
      return imported ? { ...base, ...pdfDocPage(imported, input.pageSize, input.paperAppearance), id: base.id } : base
    })
    return { diary, doc }
  }
  const performCreate = async () => {
    if (creating) return creating
    const pending = state.pending
    if (pending?.expired) throw failure('IDEMPOTENCY_KEY_EXPIRED', '응답 보관 기간이 지난 요청이에요. 목록 확인 후 요청을 정리해 주세요.')
    if (!pending) throw failure('NO_PENDING_CREATION', '확인할 생성 요청이 없어요.')
    creating = (async () => {
      active()
      let received = false
      try {
        let result = await api.create(clone(pending.input), { requestId: pending.requestId })
        received = true; active()
        if(pending.input.cover&&api.saveInitialCover) {
          const saved=await api.saveInitialCover(result.id,pending.input.cover);active()
          result={...result,...saved}
        }
        const { diary, doc } = createDocument(result, pending.input)
        if (pending.input.importedPages?.length) { await api.setPageSizes(doc.pages.map(page => ({ pageId: page.id, canvasWidth: page.canvasWidth, canvasHeight: page.canvasHeight }))); active() }
        const saved = await readStoredDocument(storage, keys.doc(result.id))
        active()
        if (saved && (saved.id !== result.id || saved.memberAccountId !== accountId || !saved.pages?.length)) throw failure('INVALID_MEMBER_DOCUMENT', '기존 회원 문서를 확인하지 못했어요. 덮어쓰지 않았어요.')
        // 응답 유실/목록 저장 실패 후 재시도에서도 이미 필기한 문서를 덮어쓰지 않는다.
        if (!saved) await write(keys.doc(result.id), doc)
        active(); await publish(diary); active()
        if (serverLibrary) await store.reload().catch(() => {})
        await storage.removeItem(keys.pending); active(); emit({ pending: null, error: null })
        return diary
      } catch (error) {
        if (disposed) throw error
        const definite = !pending.uncertain && !received && [400, 403, 404, 422].includes(error.status)
        if (definite) { await storage.removeItem(keys.pending); emit({ pending: null, error }) }
        else { const retained = { ...pending, uncertain: true, expired: error.code === 'IDEMPOTENCY_KEY_EXPIRED' || pending.expired === true }; await write(keys.pending, retained); emit({ pending: retained, error }) }
        throw error
      }
    })().finally(() => { creating = null })
    return creating
  }
  const retryable = error => error?.code !== 'INVALID_LOCAL_CACHE' && ![400, 401, 403, 404, 409, 410, 422].includes(error?.status)
  const bulkResult = request => ({ ids: request.ids, succeeded: [...request.succeeded], hasRetryableFailures: [...request.failed.values()].some(retryable), failed: [...request.failed].map(([id, error]) => ({ id, error })), refreshError: request.refreshError })
  const runBulkTrash = (request, targets) => {
    revision++; invalidateDetails(targets)
    const publishBulk = busy => emit({ bulkTrash: { ...bulkResult(request), busy, canRetry: !busy && (Boolean(request.refreshError) || [...request.failed.values()].some(retryable)) } })
    publishBulk(true)
    bulkRunning = (async () => {
      let position = 0, authError = null
      const worker = async () => {
        while (position < targets.length) {
          active(); const id = targets[position++]
          if (authError) { request.failed.set(id, authError); continue }
          try { await preserveAppearance(id); await api.trash(id); active() }
          catch (error) { active(); request.failed.set(id, error); if (error.status === 401) authError = error; publishBulk(true); continue }
          request.succeeded.add(id); request.failed.delete(id); revision++; invalidateDetails([id])
          await enqueue(async () => {
            active(); const diaries = state.diaries.filter(row => row.id !== id)
            emit({ diaries, library: { ...state.library, items: state.library.items.filter(row => row.id !== id) } })
            try { await write(keys.index, diaries); active() } catch (error) { active(); request.refreshError = error }
          })
          publishBulk(true)
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker))
      active()
      try { await store.reload(); await store.loadTrash(); active(); request.refreshError = null }
      catch (error) { active(); request.refreshError = error }
      publishBulk(false); return bulkResult(request)
    })().finally(() => { bulkRunning = null })
    return bulkRunning
  }
  // 이 기기에서 만들지 않은 다이어리는 방향을 모른다. 서버 페이지 크기로 한 번만 채워 기기에 남긴다.
  // 목록을 바꾸는 작업이 아니라 표시 값을 채우는 것이라 revision 을 올리지 않는다(진행 중인 목록 요청을 무효로 만들지 않는다).
  const orientationRequests = new Set()
  const fillOrientations = () => {
    if (typeof api.pageOrientation !== 'function') return
    const targets = state.diaries.filter(row => !row.pageSize && !row.templateConfig?.orientation && !orientationRequests.has(row.id)).map(row => row.id)
    targets.forEach(id => orientationRequests.add(id))
    let position = 0
    const worker = async () => {
      while (position < targets.length && !disposed) {
        const id = targets[position++]
        try {
          const pageSize = await api.pageOrientation(id)
          if (!pageSize || disposed) continue
          await enqueue(async () => {
            active()
            const fill = row => row.id === id ? { ...row, pageSize } : row
            const diaries = state.diaries.map(fill)
            await write(keys.index, diaries); active()
            emit({ diaries, library: { ...state.library, items: state.library.items.map(fill) } })
          })
        } catch { orientationRequests.delete(id) /* 표시 값이라 실패해도 다음 목록 때 다시 읽는다. */ }
      }
    }
    Promise.all(Array.from({ length: Math.min(3, targets.length) }, worker)).catch(() => {})
  }
  const store = {
    source: 'member-api', keys,
    toggleFavorite(id) {
      try { active() } catch (error) { return Promise.reject(error) }
      if (favoriteRequests.has(id)) return favoriteRequests.get(id)
      const previous = state.diaries.find(row => row.id === id)
      if (!writable || !previous) return Promise.reject(failure('NOT_READY', '다이어리 목록을 먼저 확인해 주세요.'))
      const favorite = !previous.favorite
      const request = (async () => {
        const result = await api.setFavorite(id, favorite); active()
        if (result.id !== id || String(result.userId) !== String(accountId) || result.favorite !== favorite)
          throw failure('INVALID_RESPONSE', '즐겨찾기 응답의 계정을 확인하지 못했어요.')
        revision++; invalidateDetails([id]); favoriteVersions.set(id, (favoriteVersions.get(id) ?? 0) + 1)
        await enqueue(async () => {
          active()
          const diaries = state.diaries.map(row => row.id === id ? { ...row, favorite } : row)
          const items = state.library.items.map(row => row.id === id ? { ...row, favorite } : row)
            .filter(row => !state.library.criteria.favorite || row.favorite)
          // The server write already succeeded. Cache/refresh failures must not undo it.
          emit({ diaries, library: { ...state.library, items } })
          try { await write(keys.index, diaries); active() } catch (error) { active(); emit({ error }) }
        })
        if (serverLibrary) await store.reload().catch(() => {})
        return state.diaries.find(row => row.id === id)
      })().catch(error => { active(); throw error }).finally(() => { favoriteRequests.delete(id) })
      favoriteRequests.set(id, request)
      return request
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) }, getSnapshot: () => state,
    async load() {
      if (writable) return this.reload()
      try {
        const diaries = await read(keys.index, []), pending = await read(keys.pending, null)
        if (!Array.isArray(diaries) || diaries.some(d => d.source !== 'member-api' || d.memberAccountId !== accountId || !d.id)) throw failure('INVALID_LOCAL_CACHE', '회원 목록을 확인하지 못했어요.')
        if (pending && (pending.accountId !== accountId || !pending.input || !pending.requestId)) throw failure('INVALID_PENDING_CREATION', '이전 생성 요청을 확인하지 못했어요.')
        active(); writable = true; emit({ diaries, loaded: true, pending: pending ? { ...pending, uncertain: true } : null, error: null })
        await this.reload()
      } catch (error) { emit({ loaded: true, error }); throw error }
    },
    reload() {
      if (serverLibrary) return this.queryLibrary(state.library.criteria, { force: true })
      if (listing) return listing
      listing = (async () => {
        active(); if (!writable) throw failure('READ_ONLY_CACHE', '기기 저장 자료를 먼저 확인해 주세요.')
        const startRevision = revision; emit({ refreshing: true })
        try {
          const rows = new Map(), cursors = new Set(); let cursor
          do {
            const page = await api.list({ cursor, sort: 'created', limit: 100 }); active()
            for (const item of page.items) rows.set(item.id, item)
            if (!page.hasNext) break
            if (!page.nextCursor || cursors.has(page.nextCursor)) throw failure('INVALID_LIST_CURSOR', '다음 목록을 확인하지 못했어요. 다시 확인해 주세요.')
            cursors.add(page.nextCursor); cursor = page.nextCursor
          } while (true)
          return await enqueue(async () => {
            active()
            if (revision !== startRevision) throw failure('LIST_CHANGED', '목록을 불러오는 중 변경이 있었어요. 다시 확인해 주세요.')
            const previous = new Map(state.diaries.map(d => [d.id, d])), meta = await localMeta()
            const diaries = [...rows.values()].map(row => entry(row, { ...meta[row.id], ...previous.get(row.id) }))
            invalidateDetails(new Set([...previous.keys(), ...rows.keys()]))
            await write(keys.index, diaries); active(); emit({ diaries, error: null })
            fillOrientations()
            return diaries
          })
        } catch (error) { emit({ error }); throw error }
        finally { emit({ refreshing: false }) }
      })().finally(() => { listing = null })
      return listing
    },
    queryLibrary(input, { more = false, force = false } = {}) {
      active()
      if (!writable) return Promise.reject(failure('NOT_READY', '목록 저장 자료를 먼저 확인해 주세요.'))
      let criteria
      try { criteria = normalizeMemberLibraryQuery(input) } catch (error) {
        librarySequence++; libraryRequest = null
        emit({ library: { ...state.library, criteria: { ...state.library.criteria, ...input }, items: [], loading: false, ready: false, error, hasNext: false, nextCursor: null } })
        return Promise.reject(error)
      }
      const same = JSON.stringify(criteria) === JSON.stringify(state.library.criteria)
      if (more && (!same || !state.library.ready || !state.library.hasNext)) return Promise.resolve(state.library.items)
      const cursor = more ? state.library.nextCursor : undefined
      const key = JSON.stringify([criteria, cursor])
      if (libraryRequest?.key === key && libraryRequest.revision === revision) return libraryRequest.promise
      if (!more && same && state.library.ready && !force) return Promise.resolve(state.library.items)
      const sequence = ++librarySequence, startRevision = revision
      if (!more) libraryCursors = new Set()
      emit({ library: { ...state.library, criteria, items: same ? state.library.items : [], ready: more && state.library.ready,
        loading: true, error: null, hasNext: more && state.library.hasNext, nextCursor: more ? cursor : null } })
      const current = () => { active(); if (sequence !== librarySequence) throw failure('STALE_LIBRARY', '조회 조건이 바뀌었어요.') }
      const promise = (async () => {
        try {
          const page = await api.list({ ...criteria, cursor, limit: 20 }); current()
          if (page.hasNext && (!page.nextCursor || page.nextCursor === cursor || libraryCursors.has(page.nextCursor))) throw failure('INVALID_LIST_CURSOR', '다음 목록을 확인하지 못했어요. 처음부터 다시 확인해 주세요.')
          return await enqueue(async () => {
            current(); if (revision !== startRevision) throw failure('LIST_CHANGED', '목록이 변경됐어요. 다시 확인해 주세요.')
            const known = new Map(state.diaries.map(row => [row.id, row])), meta = await localMeta()
            const rows = page.items.map(row => entry(row, { ...meta[row.id], ...known.get(row.id) }))
            for (const row of rows) known.set(row.id, row)
            const items = new Map((more ? state.library.items : []).map(row => [row.id, row]))
            for (const row of rows) items.set(row.id, row)
            const diaries = [...known.values()]
            await write(keys.index, diaries); current()
            invalidateDetails(rows.map(row => row.id))
            if (page.hasNext) libraryCursors.add(page.nextCursor)
            libraryRetryMore = false
            emit({ diaries, error: null, library: { criteria, items: [...items.values()], ready: true, loading: false, error: null, hasNext: page.hasNext, nextCursor: page.nextCursor } })
            fillOrientations()
            return [...items.values()]
          })
        } catch (error) {
          if (!disposed && sequence === librarySequence) {
            libraryRetryMore = more && error.code !== 'INVALID_LIST_CURSOR' && error.status !== 400
            emit({ library: { ...state.library, loading: false, error } })
          }
          throw error
        } finally { if (libraryRequest?.sequence === sequence) libraryRequest = null }
      })()
      libraryRequest = { key, sequence, revision: startRevision, promise }; return promise
    },
    loadMoreLibrary() { return this.queryLibrary(state.library.criteria, { more: true }) },
    retryLibrary() { return this.queryLibrary(state.library.criteria, { force: true, more: libraryRetryMore }) },
    bulkTrash(ids) {
      active()
      const targets = Array.isArray(ids) ? [...new Set(ids)] : []
      if (!targets.length) return Promise.reject(failure('INVALID_SELECTION', '휴지통으로 옮길 다이어리를 선택해 주세요.'))
      if (bulkRunning) {
        if (JSON.stringify(targets) === JSON.stringify(bulkRequest.ids)) return bulkRunning
        return Promise.reject(failure('OPERATION_PENDING', '선택한 다이어리 처리를 먼저 확인해 주세요.'))
      }
      if (state.bulkTrash?.canRetry) return Promise.reject(failure('OPERATION_PENDING', '이전 선택 작업을 다시 확인하거나 안내를 닫아 정리해 주세요.'))
      if (lifecycleRunning || state.lifecycle?.canRetry) return Promise.reject(failure('OPERATION_PENDING', '이전 휴지통 작업 결과를 먼저 확인해 주세요.'))
      if (targets.some(id => !state.diaries.find(row => row.id === id)?.permissions?.canTrash)) return Promise.reject(failure('FORBIDDEN', '휴지통으로 옮길 수 있는 다이어리만 선택해 주세요.'))
      bulkRequest = { ids: targets, succeeded: new Set(), failed: new Map(), refreshError: null }
      return runBulkTrash(bulkRequest, targets)
    },
    retryBulkTrash() {
      active(); if (bulkRunning) return bulkRunning
      if (!bulkRequest || !state.bulkTrash?.canRetry) return Promise.reject(failure('NO_PENDING_OPERATION', '다시 확인할 선택 작업이 없어요.'))
      return runBulkTrash(bulkRequest, [...bulkRequest.failed].filter(([, error]) => retryable(error)).map(([id]) => id))
    },
    dismissMetadataCleanupWarning() { emit({ metadataCleanupError: null }) },
    dismissBulkTrash() { if (!bulkRunning) { bulkRequest = null; emit({ bulkTrash: null }) } },
    loadTrash() {
      if(trashListing) return trashListing;
      trashListing=(async()=>{active();const startRevision=revision;emit({trashLoading:true});try {
        const rows=new Map(),seen=new Set();let cursor;
        do {const page=await api.trashList({cursor});active();for(const item of page.items)rows.set(item.id,item);
          if(!page.hasNext)break;if(!page.nextCursor||seen.has(page.nextCursor))throw failure('INVALID_LIST_CURSOR','휴지통 다음 목록을 확인하지 못했어요.');seen.add(page.nextCursor);cursor=page.nextCursor;
        }while(true);
        const meta = await localMeta();active();
        if(startRevision!==revision)throw failure('LIST_CHANGED','휴지통을 다시 확인해 주세요.');
        const known = new Map([...state.trash, ...state.diaries].map(row => [row.id, row]));
        const trash = [...rows.values()].map(row => ({ ...appearanceOf(meta[row.id]), ...appearanceOf(known.get(row.id)), ...row }));
        emit({trash,trashLoaded:true,trashError:null});return trash;
      }catch(error){if(!disposed)emit({trashError:error});throw error;}finally {if(!disposed)emit({trashLoading:false});}})().finally(()=>{trashListing=null});return trashListing;
    },
    lifecycle(kind,id) {
      if (bulkRunning || state.bulkTrash?.canRetry) return Promise.reject(failure('OPERATION_PENDING', '이전 선택 작업을 다시 확인하거나 안내를 닫아 정리해 주세요.'))
      active();if(!['trash','restore','purge'].includes(kind))return Promise.reject(failure('INVALID_OPERATION','지원하지 않는 작업이에요.'));if(lifecycleRunning) {
        if(lifecycleRequest?.id===id && lifecycleRequest.kind===kind)return lifecycleRunning;
        return Promise.reject(failure('OPERATION_PENDING','진행 중인 휴지통 작업을 먼저 확인해 주세요.'));
      }
      if(lifecycleRequest && (lifecycleRequest.id!==id||lifecycleRequest.kind!==kind) && state.lifecycle?.canRetry) return Promise.reject(failure('OPERATION_PENDING','이전 작업 결과를 먼저 확인해 주세요.'));
      if(!lifecycleRequest || lifecycleRequest.id!==id || lifecycleRequest.kind!==kind) {
        const row=(kind==='trash'?state.diaries:state.trash).find(x=>x.id===id);
        if(kind==='trash'?!row?.permissions?.canTrash:!(kind==='purge'?row?.canPermanentlyDelete:row?.canRestore)) return Promise.reject(failure('FORBIDDEN','이 작업을 할 수 있는 최신 권한을 확인해 주세요.'));
        lifecycleRequest={kind,id,committed:false,result:null};
      }
      const request=lifecycleRequest;revision++;invalidateDetails([id]);emit({lifecycle:{kind,id,busy:true,canRetry:false,error:null}});
      lifecycleRunning=(async()=>{try {
        if(!request.committed){if(kind==='trash')await preserveAppearance(id);request.result=kind==='trash'?await api.trash(id):kind==='purge'?await api.purge(id):await api.restore(id);request.committed=true;active();revision++;invalidateDetails([id]);}
        if(kind==='restore') {
          const meta = await localMeta();active();
          await publish(entry(request.result,{ ...appearanceOf(meta[id]), ...appearanceOf(state.trash.find(x=>x.id===id)), ...state.diaries.find(x=>x.id===id) }));
        }
        else await enqueue(async()=>{
          active();
          if(kind==='purge') {
            try {
              const meta=await read(keys.localMeta, {});active();
              if(!meta || typeof meta!=='object' || Array.isArray(meta)) throw failure('INVALID_LOCAL_CACHE','표지 자료 형식을 확인하지 못했어요.');
              if(Object.hasOwn(meta,id)) {delete meta[id];await write(keys.localMeta,meta);active();}
              emit({metadataCleanupError:null});
            } catch(error) {
              active();
              // The server purge is final. Local cleanup must not lock subsequent operations.
              emit({metadataCleanupError:failure('LOCAL_METADATA_CLEANUP_FAILED','영구 삭제는 완료됐지만 기기에 남은 표지 설정은 정리하지 못했어요.')});
            }
          }
          const diaries=state.diaries.filter(x=>x.id!==id);await write(keys.index,diaries);active();emit({diaries});
        });
        // Await older list requests before issuing the authoritative post-mutation refresh.
        if(listing)await listing.catch(()=>{});if(trashListing)await trashListing.catch(()=>{});
        await this.reload();await this.loadTrash();active();lifecycleRequest=null;emit({lifecycle:null});return true;
      }catch(error){if(!disposed){const canRetry=request.committed||(error.code!=='INVALID_LOCAL_CACHE' && ![400,401,403,404,409,410].includes(error.status));
        emit({lifecycle:{kind,id,busy:false,canRetry,error,resultKnown:request.committed}});
        if(!canRetry){lifecycleRequest=null;await this.reload().catch(()=>{});await this.loadTrash().catch(()=>{});}
      }throw error;}})().finally(()=>{lifecycleRunning=null});return lifecycleRunning;
    },
    retryLifecycle() {if(!state.lifecycle?.canRetry || !lifecycleRequest)return Promise.reject(failure('NO_PENDING_OPERATION','재시도할 작업이 없어요.'));return this.lifecycle(lifecycleRequest.kind,lifecycleRequest.id);},
    create(form) {
      if (starting) return starting
      starting = (async () => {
      active()
      if (!state.loaded || !writable) throw failure('NOT_READY', '목록 저장 자료를 먼저 확인해 주세요.')
      const input = serverDiaryCreateInput(diaryCreateInput(form))
      if (state.pending && JSON.stringify(state.pending.input) !== JSON.stringify(input)) throw failure('PENDING_CREATION', '이전 생성 요청을 먼저 확인해 주세요. 창을 닫고 이전 생성 확인을 눌러 주세요.')
      if (!state.pending) {
        const pending = { accountId, requestId: makeRequestId(), input: clone(input), uncertain: false }
        await write(keys.pending, { ...pending, uncertain: true }); active(); emit({ pending })
      }
      return performCreate()
      })().finally(() => { starting = null })
      return starting
    },
    retryCreation: performCreate,
    async archiveExpiredCreation() {
      active(); const pending=state.pending;
      if(!pending?.expired) throw failure('PENDING_NOT_EXPIRED','미확인 생성 요청은 같은 키로 먼저 확인해 주세요.')
      await this.reload(); active();
      if(state.pending?.requestId!==pending.requestId) throw failure('PENDING_CHANGED','이전 생성 요청을 다시 확인해 주세요.')
      const archive=await read(keys.pendingArchive,[]); active();
      if(!Array.isArray(archive)) throw failure('INVALID_LOCAL_CACHE','요청 보관 기록을 확인하지 못했어요.')
      if(!archive.some(item=>item.requestId===pending.requestId)) await write(keys.pendingArchive,[...archive,pending]);
      active(); await storage.removeItem(keys.pending); active(); emit({pending:null,error:null});
    },
    async refresh(id) {
      return refreshDiary(id)
    },
    async open(id) {
      // 목록 밖 수락 ID도 서버 권한을 재검증하되, 일반 refresh 계약은 유지한다.
      const diary = await refreshDiary(id, true)
      let doc = await readStoredDocument(storage, keys.doc(id));active()
      if (!doc && typeof api.loadPages === 'function') {
        const pages = await api.loadPages(id);active()
        if (!Array.isArray(pages) || !pages.length) throw failure('MISSING_MEMBER_DOCUMENT', '서버의 편집 페이지를 찾지 못했어요.')
        const candidate = {...createDefaultDoc({...diary,pageSize:pages[0].canvasWidth>=pages[0].canvasHeight?'landscape':'portrait'}),memberAccountId:accountId,pages}
        doc = await enqueue(async()=>{
          active();const existing=await readStoredDocument(storage,keys.doc(id));active()
          if(existing)return existing
          await write(keys.doc(id),candidate);active();return candidate
        })
      }
      if (!doc || doc.memberAccountId !== accountId || doc.id !== id || !doc.pages?.length) throw failure('MISSING_MEMBER_DOCUMENT', '이 기기의 편집 문서를 찾지 못했어요. 빈 문서로 대체하지 않았어요.')
      return { diary, doc }
    },
    async update(id, form) {
      active()
      const favoriteVersion = favoriteVersions.get(id)
      const previous = state.diaries.find(d => d.id === id)
      if (!previous?.canEdit) throw failure('FORBIDDEN', '소유자만 제목과 표지를 수정할 수 있어요.')
      try {
        const result = await api.update(id, { title: form.title, color: form.color, coverStyle: form.pattern ? form.pattern.toUpperCase() : 'PLAIN', ...(form.cover?{cover:form.cover}:{}), expectedVersion: previous.version })
        active()
        const metadata = favoriteVersion !== favoriteVersions.get(id)
          ? { ...result, favorite: state.diaries.find(row => row.id === id)?.favorite } : result
        const updated = await publish(entry(metadata, previous))
        if (serverLibrary) await this.reload().catch(() => {})
        return updated
      } catch (error) {
        if (error.status === 409) await this.refresh(id).catch(() => {})
        throw error
      }
    },
    setDiaries(next) { return enqueue(async () => { active(); if (!writable) throw failure('READ_ONLY_CACHE', '목록을 확인한 뒤 다시 시도해 주세요.'); const diaries = typeof next === 'function' ? next(state.diaries) : next; revision++; invalidateDetails(new Set([...state.diaries, ...diaries].map(item => item.id))); await write(keys.index, diaries); active(); emit({ diaries }) }).catch(error => emit({ error })) },
    dispose() { disposed = true; listeners.clear() },
  }
  return store
}
