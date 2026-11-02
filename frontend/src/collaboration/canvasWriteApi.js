import { createCanvasApi } from './canvasApi.js'
import { createCanvasElementApi } from './canvasElementApi.js'
import { isUuid } from './canvasElements.js'

// Match MemberDiaryListQuery.shared: active memberships, not online presence.
export function createCanvasWriteApi(transport, media, diaryId) {
  if (!isUuid(diaryId)) throw Error('다이어리 ID를 확인해 주세요.')
  const personal = createCanvasElementApi(transport, media), shared = createCanvasApi(transport, media)
  const checkedPages = new Set()
  const select = async () => {
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
      const mode = await select()
      const prepared = shared.prepare ? await shared.prepare(request) : request
      return { ...prepared, canvasWriteMode: mode }
    },
    apply(pageId, request) {
      const { canvasWriteMode, ...body } = request
      if (canvasWriteMode !== undefined && !['personal','shared'].includes(canvasWriteMode)) throw Error('저장 경로를 확인하지 못했어요.')
      // Pre-upgrade prepared commands retain the collaboration endpoint and ID.
      return (canvasWriteMode === 'personal' ? personal : shared).apply(pageId, body)
    },
    history: shared.history,
    control: shared.control,
  }
}
