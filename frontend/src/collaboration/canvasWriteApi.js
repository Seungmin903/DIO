import { createCanvasApi } from './canvasApi.js'
import { createCanvasElementApi } from './canvasElementApi.js'
import { isUuid } from './canvasElements.js'
import { assertCanvasBatchLimits } from './canvasBatchLimits.js'

// Match MemberDiaryListQuery.shared: active memberships, not online presence.
export function createCanvasWriteApi(transport, media, diaryId) {
  if (!isUuid(diaryId)) throw Error('다이어리 ID를 확인해 주세요.')
  const personal = createCanvasElementApi(transport, media), shared = createCanvasApi(transport, media)
  const checkedPages = new Set()
  // 참여 멤버 조회 결과는 잠시 기억한다. 저장·조회마다 다시 물으면 획 하나에 멤버 조회가 두 번 더 붙었다. 멤버 변경 이벤트가 오면 비운다.
  // 조회 도중 비워지면(세대가 바뀌면) 그 응답은 기억하지 않고, 진행 중인 조회는 하나로 합친다.
  const MEMBERSHIP_TTL_MS = 5000
  let membership = null, generation = 0, inflight = null
  const select = () => {
    if (membership && Date.now() - membership.at < MEMBERSHIP_TTL_MS) return Promise.resolve(membership.mode)
    if (inflight) return inflight
    const started = generation
    const job = fetchMode().then(mode => { if (generation === started) membership = { mode, at: Date.now() }; return mode }).finally(() => { if (inflight === job) inflight = null })
    inflight = job
    return job
  }
  // 비우면 진행 중인 조회에도 새 호출이 합류하지 않는다(그 조회의 결과도 기억하지 않는다)
  const invalidate = () => { membership = null; inflight = null; generation += 1 }
  const fetchMode = async () => {
    const body = await transport({ path: `/diaries/${diaryId}/members` })
    if (!Array.isArray(body?.members) || !body.members.length || body.members.some(m => !m || !['OWNER','EDITOR'].includes(m.role) || !/^\d+$/.test(String(m.userId))) || new Set(body.members.map(m => String(m.userId))).size !== body.members.length) {
      throw Object.assign(Error('다이어리 참여 상태를 확인하지 못했어요.'), { code: 'INVALID_CANVAS_MEMBERSHIP' })
    }
    return body.members.length > 1 ? 'shared' : 'personal'
  }
  return {
    async load(pageId, expectedDiaryId) {
      if (expectedDiaryId !== diaryId) throw Object.assign(Error('페이지의 다이어리를 확인해 주세요.'), { code: 'INVALID_CANVAS_PAGE_MEMBERSHIP' })
      const mode = await select()
      if (mode === 'personal' && !checkedPages.has(pageId)) {
        const body = await transport({ path: `/pages/${pageId}` })
        if (body?.page?.pageId !== pageId || body.page.diaryId !== diaryId) throw Object.assign(Error('페이지의 다이어리를 확인해 주세요.'), { code: 'INVALID_CANVAS_PAGE_MEMBERSHIP' })
        checkedPages.add(pageId)
      }
      return (mode === 'personal' ? personal : shared).load(pageId, expectedDiaryId)
    },
    async prepare(request) {
      assertCanvasBatchLimits(request.changes, request.expectedVersions)
      const mode = await select()
      const prepared = shared.prepare ? await shared.prepare(request) : request
      return { ...prepared, canvasWriteMode: mode }
    },
    async apply(pageId, request) {
      const { canvasWriteMode, ...body } = request
      if (canvasWriteMode !== undefined && !['personal','shared'].includes(canvasWriteMode)) throw Error('저장 경로를 확인하지 못했어요.')
      // Pre-upgrade prepared commands retain the collaboration endpoint and ID.
      try { return await (canvasWriteMode === 'personal' ? personal : shared).apply(pageId, body) }
      catch (error) { invalidate(); throw error } // 소켓이 끊긴 동안 멤버가 바뀌었을 수 있으니 실패한 저장의 재시도 전에 다시 조회한다
    },
    history: shared.history,
    control: shared.control,
    invalidateMembership: invalidate,
  }
}
