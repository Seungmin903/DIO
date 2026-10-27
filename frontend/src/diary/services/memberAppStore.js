import { memberKeys } from './memberStorage.js'
import { diaryCreateInput } from './diaryCreateInput.js'
import { localTemplateReference } from '../../editor/templates/serverCatalog.js'
import { createDefaultDoc } from '../../editor/state/defaultDoc.js'

const clone = value => JSON.parse(JSON.stringify(value))
const failure = (code, message) => Object.assign(new Error(message), { code })
export function createMemberAppStore({ accountId, api, storage, makeRequestId }) {
  const keys = memberKeys(accountId), listeners = new Set()
  let state = { diaries: [], loaded: false, refreshing: false, pending: null, error: null }, disposed = false, creating = null, starting = null, writable = false
  let revision = 0, listing = null
  const metadataVersions = new Map(), detailRequests = new Map()
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
  const active = () => { if (disposed) throw failure('STALE_ACCOUNT', '계정이 바뀌어 요청을 중단했어요.') }
  const entry = (result, previous = {}) => ({ ...previous, ...result, source: 'member-api', memberAccountId: accountId,
    type: (result.isShared ?? previous.isShared) ? '공유' : '개인', canManage: result.canEdit, canDelete: false, trashedAt: null })
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
  const createDocument = (result, input) => {
    const diary = entry({ ...result, title: result.title, templateConfig: input.templateConfig, pageSize: input.pageSize,
      paperAppearance: input.paperAppearance, favorite: false, pageCount: result.pageIds.length })
    const doc = createDefaultDoc(diary)
    doc.memberAccountId = accountId
    doc.pages = input.initialPages.map((selected, index) => {
      const ref = localTemplateReference(selected.templateCode, selected.templateVersion)
      return { id: result.pageIds[index], ...ref, ...(selected.templateConfig.paperAppearance ? { paperAppearance: selected.templateConfig.paperAppearance } : {}), objects: [] }
    })
    return { diary, doc }
  }
  const performCreate = async () => {
    if (creating) return creating
    const pending = state.pending
    if (!pending) throw failure('NO_PENDING_CREATION', '확인할 생성 요청이 없어요.')
    creating = (async () => {
      active()
      let received = false
      try {
        const result = await api.create(clone(pending.input), { requestId: pending.requestId })
        received = true; active()
        const { diary, doc } = createDocument(result, pending.input)
        const saved = await read(keys.doc(result.id), null)
        active()
        if (saved && (saved.id !== result.id || saved.memberAccountId !== accountId || !saved.pages?.length)) throw failure('INVALID_MEMBER_DOCUMENT', '기존 회원 문서를 확인하지 못했어요. 덮어쓰지 않았어요.')
        // 응답 유실/목록 저장 실패 후 재시도에서도 이미 필기한 문서를 덮어쓰지 않는다.
        if (!saved) await write(keys.doc(result.id), doc)
        active(); await publish(diary); active()
        await storage.removeItem(keys.pending); active(); emit({ pending: null, error: null })
        return diary
      } catch (error) {
        if (disposed) throw error
        const definite = !pending.uncertain && !received && [400, 403, 404, 422].includes(error.status)
        if (definite) { await storage.removeItem(keys.pending); emit({ pending: null, error }) }
        else { const retained = { ...pending, uncertain: true }; await write(keys.pending, retained); emit({ pending: retained, error }) }
        throw error
      }
    })().finally(() => { creating = null })
    return creating
  }
  return {
    source: 'member-api', keys,
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
            const previous = new Map(state.diaries.map(d => [d.id, d]))
            const diaries = [...rows.values()].map(row => entry(row, previous.get(row.id)))
            invalidateDetails(new Set([...previous.keys(), ...rows.keys()]))
            await write(keys.index, diaries); active(); emit({ diaries, error: null })
            return diaries
          })
        } catch (error) { emit({ error }); throw error }
        finally { emit({ refreshing: false }) }
      })().finally(() => { listing = null })
      return listing
    },
    create(form) {
      if (starting) return starting
      starting = (async () => {
      active()
      if (!state.loaded || !writable) throw failure('NOT_READY', '목록 저장 자료를 먼저 확인해 주세요.')
      const input = diaryCreateInput(form)
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
    async refresh(id) {
      active()
      const detailRequest = { version: version(id), sequence: (detailRequests.get(id) ?? 0) + 1 }
      detailRequests.set(id, detailRequest.sequence)
      const result = await api.get(id); active()
      const previous = state.diaries.find(d => d.id === id)
      if (!previous) throw failure('UNKNOWN_MEMBER_DIARY', '이 기기에 저장된 회원 다이어리를 확인해 주세요.')
      return publish(entry(result, previous), detailRequest)
    },
    async open(id) {
      const diary = await this.refresh(id), doc = await read(keys.doc(id), null)
      active()
      if (!doc || doc.memberAccountId !== accountId || doc.id !== id || !doc.pages?.length) throw failure('MISSING_MEMBER_DOCUMENT', '이 기기의 편집 문서를 찾지 못했어요. 빈 문서로 대체하지 않았어요.')
      return { diary, doc }
    },
    async update(id, form) {
      active()
      const previous = state.diaries.find(d => d.id === id)
      if (!previous?.canEdit) throw failure('FORBIDDEN', '소유자만 제목과 표지를 수정할 수 있어요.')
      try {
        const result = await api.update(id, { title: form.title, color: form.color, coverStyle: form.pattern ? form.pattern.toUpperCase() : 'PLAIN', expectedUpdatedAt: previous.updatedAt })
        active(); return await publish(entry(result, previous))
      } catch (error) {
        if (error.status === 409) await this.refresh(id).catch(() => {})
        throw error
      }
    },
    setDiaries(next) { return enqueue(async () => { active(); if (!writable) throw failure('READ_ONLY_CACHE', '목록을 확인한 뒤 다시 시도해 주세요.'); const diaries = typeof next === 'function' ? next(state.diaries) : next; revision++; invalidateDetails(new Set([...state.diaries, ...diaries].map(item => item.id))); await write(keys.index, diaries); active(); emit({ diaries }) }).catch(error => emit({ error })) },
    dispose() { disposed = true; listeners.clear() },
  }
}
