import {loadServerPages} from '../../collaboration/serverPages.js'
import { DiaryApiError } from './diaryApi.js'
import { toServerInitialPageSelections } from '../../editor/templates/serverCatalog.js'
import { createSharedCover } from './sharedCover.js'

const invalid = () => new DiaryApiError('INVALID_RESPONSE', '회원 다이어리 응답을 확인하지 못했어요.')
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
function diary(body) {
  const row = body?.diary
  if (!row || !uuid(row.diaryId)
    || typeof row.version !== 'string' || !/^[1-9][0-9]{0,18}$/.test(row.version) || BigInt(row.version)>9223372036854775807n
    || !['OWNER','EDITOR'].includes(row.myRole) || typeof row.myMembership?.isFavorite!=='boolean'
    || !row.permissions || ['canEditMetadata','canEditCanvas','canTrash','canRestore','canPermanentlyDelete'].some(k=>typeof row.permissions[k]!=='boolean')
    || row.canEdit !== (row.myRole==='OWNER') || row.permissions.canEditMetadata !== row.canEdit || row.permissions.canEditCanvas !== true
    || typeof row.diaryTitle !== 'string' || !row.diaryTitle.trim() || typeof row.coverStyle !== 'string' || typeof row.canEdit !== 'boolean'
    || typeof row.coverColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(row.coverColor)
    || !['PRIVATE', 'MEMBERS', 'LINK'].includes(row.visibility)
    || typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))
    || typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw invalid()
  return { id: row.diaryId, title: row.diaryTitle, color: row.coverColor, coverStyle: row.coverStyle,
    pattern: row.coverStyle === 'PLAIN' ? null : row.coverStyle.toLowerCase(), visibility: row.visibility,
    version: row.version, myRole: row.myRole, favorite: row.myMembership.isFavorite, permissions: row.permissions, canEdit: row.canEdit, createdAt: row.createdAt, updatedAt: row.updatedAt }
}
function keyedOptions(options) {
  if (typeof options.requestId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(options.requestId)) {
    throw new DiaryApiError('INVALID_IDEMPOTENCY_KEY', '생성 키가 필요해요. 재시도에는 처음 사용한 키를 유지해 주세요.', 400)
  }
  return options
}
const idempotencyMessages = {
  IDEMPOTENCY_KEY_EXPIRED: '생성 키의 응답 보관 기간이 지났어요. 보관함에서 상태를 확인해 주세요.',
  IDEMPOTENCY_IN_PROGRESS: '같은 생성 요청을 처리 중이에요. 처음 사용한 키로 잠시 후 다시 확인해 주세요.',
  IDEMPOTENCY_KEY_REUSED: '이 키는 다른 생성 내용에 사용됐어요. 내용을 바꾼 새 작업에는 새 키가 필요해요.',
  IDEMPOTENCY_RESULT_UNAVAILABLE: '기존 생성 결과를 반환할 수 없어요. 보관함에서 상태를 확인해 주세요.',
}
// 기존 목/비회원 API와 분리한 실제 회원 HTTP 경계.
export function createMemberDiaryApi(transport, { media, hydrateCovers = true } = {}) {
  const covers=createSharedCover(media)
  const mapDiary=body=>{
    const result=diary(body)
    if (body.diary.paperAppearance != null) {
      if (typeof body.diary.paperAppearance !== 'object' || Array.isArray(body.diary.paperAppearance)) throw invalid()
      result.paperAppearance = body.diary.paperAppearance
    }
    // 다이어리 단위 속지 구성(고른 속지 묶음·날짜 표시 방식·방향). 예전에 만든 다이어리는 없을 수 있다.
    if (body.diary.templateConfig != null) {
      if (typeof body.diary.templateConfig !== 'object' || Array.isArray(body.diary.templateConfig)) throw invalid()
      result.templateConfig = body.diary.templateConfig
    }
    if(body.diary.cover!=null) {
      if(typeof body.diary.cover!=='object'||Array.isArray(body.diary.cover))throw invalid()
      result.cover=hydrateCovers?covers.hydrate(body.diary.cover):body.diary.cover
    }
    return result
  }
  return {
    async setFavorite(id, favorite) {
      if (!uuid(id) || typeof favorite !== 'boolean') throw invalid()
      const result = await transport({ method: 'PATCH', path: `/diaries/${encodeURIComponent(id)}/membership`, body: { favorite } })
      if (result?.diaryId !== id || typeof result.userId !== 'string' || !result.userId
        || result.favorite !== favorite) throw invalid()
      return { id, userId: result.userId, favorite: result.favorite }
    },
    loadPages: id => loadServerPages(transport,id),
    /** 첫 페이지 크기로 정한 방향. 목록 응답에는 방향이 없고 페이지 목록은 요소 없이 크기만 준다. 페이지가 없으면 null. */
    async pageOrientation(id) {
      if (!uuid(id)) throw invalid()
      const result = await transport({ path: `/diaries/${encodeURIComponent(id)}/pages` })
      if (!Array.isArray(result?.items)) throw invalid()
      const first = result.items[0]
      if (!first) return null
      if (![first.canvasWidth, first.canvasHeight].every(value => Number.isFinite(value) && value > 0)) throw invalid()
      return first.canvasWidth >= first.canvasHeight ? 'landscape' : 'portrait'
    },
    async trashList({cursor,limit=100,q,signal}={}) {
      const body=await transport({path:'/member/diaries/trash',query:{cursor,limit,q},signal});
      if(!Array.isArray(body?.items) || typeof body.hasNext!=='boolean' || (body.hasNext?typeof body.nextCursor!=='string'||!body.nextCursor:body.nextCursor!==null)) throw invalid();
      const items=body.items.map(row=>{
        const deleted=Date.parse(row.deletedAt),expiry=Date.parse(row.purgeAt);
        if(!uuid(row.diaryId) || typeof row.diaryTitle!=='string' || !row.diaryTitle.trim() || !/^#[0-9a-f]{6}$/i.test(row.coverColor) || typeof row.coverStyle!=='string'
            || typeof row.version!=='string' || !/^[1-9][0-9]{0,18}$/.test(row.version) || BigInt(row.version)>9223372036854775807n
            || !Number.isFinite(deleted) || !Number.isFinite(expiry) || expiry-deleted!==30*86400000 || typeof row.canRestore!=='boolean' || typeof row.canPermanentlyDelete!=='boolean') throw invalid();
        // 속지 구성(방향 포함). 예전 서버·예전 다이어리는 없으니 그때는 기기에 남긴 값을 덮지 않도록 키를 싣지 않는다.
        if(row.templateConfig!=null && (typeof row.templateConfig!=='object' || Array.isArray(row.templateConfig))) throw invalid();
        return {id:row.diaryId,title:row.diaryTitle,color:row.coverColor,coverStyle:row.coverStyle,pattern:row.coverStyle==='PLAIN'?null:row.coverStyle.toLowerCase(),version:row.version,
          trashedAt:row.deletedAt,expiresAt:row.purgeAt,canRestore:row.canRestore,retentionStatus:row.canRestore?'RESTORABLE':'EXPIRED',canPermanentlyDelete:row.canPermanentlyDelete,
          ...(row.templateConfig!=null && {templateConfig:row.templateConfig})};
      });
      if(new Set(items.map(x=>x.id)).size!==items.length) throw invalid();return {items,hasNext:body.hasNext,nextCursor:body.nextCursor};
    },
    async purge(id,options={}) {if(!uuid(id))throw invalid();await transport({...options,method:'DELETE',path:`/member/diaries/${encodeURIComponent(id)}/purge`});},
    async trash(id,options={}) {if(!uuid(id))throw invalid();await transport({...options,method:'DELETE',path:`/member/diaries/${encodeURIComponent(id)}`});},
    async restore(id,options={}) {if(!uuid(id))throw invalid();const result=diary(await transport({...options,method:'POST',path:`/member/diaries/${encodeURIComponent(id)}/restore`}));if(result.id!==id)throw invalid();return result;},
    async list({ cursor, q, sort = 'updated', limit = 100, filter = 'all', favorite = false, signal } = {}) {
      const body = await transport({ path: '/member/diaries', query: { cursor, q, sort, limit, filter, favorite }, signal })
      if (!Array.isArray(body?.items) || typeof body.hasNext !== 'boolean' ||
          (body.hasNext ? typeof body.nextCursor !== 'string' || !body.nextCursor.trim() : body.nextCursor !== null)) throw invalid()
      const items = body.items.map(item => {
        const result = mapDiary(item)
        if (!Number.isSafeInteger(item.pageCount) || item.pageCount < 0 || typeof item.shared !== 'boolean') throw invalid()
        return { ...result, pageCount: item.pageCount, isShared: item.shared }
      })
      if (new Set(items.map(item => item.id)).size !== items.length) throw invalid()
      return { items, hasNext: body.hasNext, nextCursor: body.nextCursor }
    },
    async create(input, options = {}) {
      const initialPages = toServerInitialPageSelections(input.initialPages).map(({ templateCode, templateVersion, configurationJson }) =>
        ({ templateCode, templateVersion, templateConfig: JSON.parse(configurationJson) }))
      let body
      try { body = await transport({ ...keyedOptions(options), method: 'POST', path: '/member/diaries', body: {
        diaryTitle: input.title, coverColor: input.color,
        coverStyle: input.coverStyle ?? (input.pattern ? input.pattern.toUpperCase() : 'PLAIN'), initialPages,
        ...(input.defaultPaperAppearance && { paperAppearance: input.defaultPaperAppearance }),
        // 예전 앱이 남긴 미확인 생성 요청에는 없다. 같은 키의 본문을 바꾸지 않도록 표시된 요청에만 싣는다.
        ...(input.diaryTemplateConfig && { templateConfig: input.diaryTemplateConfig }),
      } }) } catch (error) {
        if (idempotencyMessages[error.code]) throw new DiaryApiError(error.code, idempotencyMessages[error.code], error.status)
        throw error
      }
      const result = mapDiary(body)
      if (!Array.isArray(body.pageIds) || body.pageIds.length !== initialPages.length || new Set(body.pageIds).size !== body.pageIds.length
        || !body.pageIds.every(uuid) || body.firstPageId !== body.pageIds[0]) throw invalid()
      return { ...result, firstPageId: body.firstPageId, pageIds: [...body.pageIds] }
    },
    async saveInitialCover(id, cover) {
      // A retried creation receipt must not overwrite a newer server cover.
      const current=await this.get(id)
      return current.cover?current:this.update(id,{cover,expectedVersion:current.version})
    },
    // 날짜 속지: 만든 페이지 설정에 날짜 ID(datedTemplate)를 넣는다. 생성 요청은 설정 키를 제한해 실을 수 없다(serverCatalog).
    // 설정은 통째로 바뀌므로 만들 때 보낸 설정 + datedTemplate 을 보낸다. 같은 값을 다시 보내도 같은 결과다.
    async setDatedPages(pages, options = {}) {
      let next = 0
      const worker = async () => {
        while (next < pages.length) {
          const { pageId, templateConfig } = pages[next++]
          if (!uuid(pageId) || typeof templateConfig?.datedTemplate !== 'string') throw invalid()
          const body = await transport({ ...options, method: 'PATCH', path: `/pages/${encodeURIComponent(pageId)}`, body: { templateConfig } })
          if (body?.page?.pageId !== pageId || body.page.templateConfig?.datedTemplate !== templateConfig.datedTemplate) throw invalid()
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, pages.length) }, worker))
    },
    // PDF 쪽: 만들어 둔 빈 페이지의 크기를 쪽 비율에 맞춘다(초기 페이지는 속지 목록의 크기로만 만들 수 있다). 같은 값을 다시 보내도 같은 결과다.
    async setPageSizes(sizes, options = {}) {
      let next = 0
      const worker = async () => {
        while (next < sizes.length) {
          const { pageId, canvasWidth, canvasHeight } = sizes[next++]
          if (!uuid(pageId)) throw invalid()
          const body = await transport({ ...options, method: 'PATCH', path: `/pages/${encodeURIComponent(pageId)}`, body: { canvasWidth, canvasHeight } })
          if (body?.page?.pageId !== pageId) throw invalid()
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, sizes.length) }, worker))
    },
    async get(id, options = {}) {
      const result = mapDiary(await transport({ ...options, method: 'GET', path: `/member/diaries/${encodeURIComponent(id)}` }))
      if (result.id !== id) throw invalid()
      return result
    },
    async update(id, input, options = {}) {
      if (typeof input.expectedVersion !== 'string' || !/^[1-9][0-9]{0,18}$/.test(input.expectedVersion) || BigInt(input.expectedVersion)>9223372036854775807n) throw new DiaryApiError('INVALID_REQUEST', '최신 수정 시각이 필요해요.', 400)
      const body = { expectedVersion: input.expectedVersion }
      if (input.title !== undefined) body.diaryTitle = input.title
      if (input.color !== undefined) body.coverColor = input.color
      if (input.coverStyle !== undefined) body.coverStyle = input.coverStyle
      if (input.cover !== undefined) body.cover = await covers.prepare(input.cover)
      if (input.templateConfig !== undefined) body.templateConfig = input.templateConfig
      if (input.paperAppearance !== undefined) {
        body.paperAppearance = input.paperAppearance
        body.paperAppearanceScope = input.paperAppearanceScope
      }
      if (Object.keys(body).length === 1) throw new DiaryApiError('INVALID_REQUEST', '수정할 항목을 골라 주세요.', 400)
      const result = mapDiary(await transport({ ...options, method: 'PATCH', path: `/member/diaries/${encodeURIComponent(id)}`, body }))
      if (result.id !== id) throw invalid()
      if(input.cover!==undefined&&!result.cover)throw new DiaryApiError('COVER_NOT_SAVED','서버에 표지가 저장되지 않았어요. 다시 시도해 주세요.')
      if (input.templateConfig !== undefined && !result.templateConfig)
        throw new DiaryApiError('TEMPLATE_CONFIG_NOT_SAVED', '서버에 속지 구성을 저장하지 못했어요. 다시 시도해 주세요.')
      if (input.paperAppearance && !result.paperAppearance)
        throw new DiaryApiError('PAPER_APPEARANCE_NOT_SAVED', '서버에 속지 설정을 저장하지 못했어요. 다시 시도해 주세요.')
      return result
    },
  }
}
