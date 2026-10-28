import { DiaryApiError } from './diaryApi.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const validVersion = value => typeof value === 'string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
const invalid = () => new DiaryApiError('INVALID_RESPONSE', '다이어리 정보를 확인하지 못했어요. 다시 시도해 주세요.');
export function toAuthenticatedDiary(row) {
  if (!row || !validVersion(row.version) || !uuid(row.diaryId) || typeof row.diaryTitle !== 'string' || !row.diaryTitle.trim()
    || !['OWNER', 'EDITOR'].includes(row.myRole) || !['PRIVATE', 'MEMBERS', 'LINK'].includes(row.visibility)
    || !Number.isSafeInteger(row.pageCount) || row.pageCount < 0 || (row.firstPageId !== null && !uuid(row.firstPageId))
    || typeof row.myMembership?.isFavorite !== 'boolean'
    || !['canEditMetadata', 'canEditCanvas', 'canTrash', 'canRestore', 'canPermanentlyDelete'].every(key => typeof row.permissions?.[key] === 'boolean')
    || !/^#[0-9a-f]{6}$/i.test(row.coverColor) || typeof row.coverStyle !== 'string'
    || ![row.createdAt, row.updatedAt].every(value => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    || ![row.deletedAt, row.expiresAt].every(value => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value))))) throw invalid();
  return { version:row.version, id: row.diaryId, title: row.diaryTitle, color: row.coverColor,
    pattern: row.coverStyle === 'PLAIN' ? null : row.coverStyle.toLowerCase(),
    type: row.visibility === 'PRIVATE' ? '개인' : '공유', favorite: row.myMembership.isFavorite,
    role: row.myRole, permissions: { ...row.permissions }, pageCount: row.pageCount, firstPageId: row.firstPageId,
    createdAt: row.createdAt, updatedAt: row.updatedAt, trashedAt: row.deletedAt, expiresAt: row.expiresAt,
    // 개별 관리만 연결한다. 일괄 관리는 별도 단계다.
    canPermanentlyDelete: row.myRole === 'OWNER' && row.deletedAt !== null && row.permissions.canPermanentlyDelete,
    canRestore: row.myRole === 'OWNER' && row.deletedAt !== null && row.permissions.canRestore,
    canTrash: row.myRole === 'OWNER' && row.deletedAt === null && row.permissions.canTrash,
    retentionStatus: row.deletedAt !== null && !row.permissions.canRestore ? 'EXPIRED' : 'RETAINED',
    canManage: false, canEdit: row.myRole === 'OWNER' && row.permissions.canEditMetadata && row.deletedAt === null };
}

export function diaryReadRequest({ filter = 'personal', query = '', sort = 'updated', status = 'active' } = {}) {
  // 기존 UI의 personal 탭 이름은 '모든 다이어리'다.
  return { status, filter: filter === 'shared' ? 'shared' : 'all', q: query.trim(),
    sort: ({ updated: 'updatedAtDesc', created: 'createdAtDesc', title: 'titleAsc', pages: 'pageCountDesc' })[sort] || 'updatedAtDesc',
    ...(filter === 'favorite' ? { favorite: true } : {}) };
}

export function createAuthenticatedDiaryApi({ auth, userId, fetchImpl = globalThis.fetch, allowDevelopmentHttp = typeof __DEV__ !== 'undefined' && __DEV__, timeoutMs = 15000 }) {
  const sessionKey = auth.getSessionKey();
  const { baseUrl, accessTokenHeader = 'Authorization' } = auth.getConnectionOptions();
  const local = /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\])(?::\d+)?(?:\/|$)/i.test(baseUrl);
  const configured = /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?$/i.test(baseUrl)
    && (/^https:\/\//i.test(baseUrl) || local || allowDevelopmentHttp)
    && ['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader);
  const checkSession = () => {
    if (!sessionKey || auth.getSessionKey() !== sessionKey) throw new DiaryApiError('AUTHENTICATION_REQUIRED', '다시 로그인해 주세요.', 401);
  };
  const request = async (path, { query = {}, signal, method = 'GET', payload, requestId, emptyResponse = false } = {}) => {
    if (!configured) throw new DiaryApiError('API_NOT_CONFIGURED', '서버 주소를 확인해 주세요.');
    const cancelled = () => { if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
    cancelled(); checkSession();
    const token = await auth.getAccessToken({ userId, sessionKey });
    cancelled(); checkSession();
    if (typeof token !== 'string' || !token) throw new DiaryApiError('AUTHENTICATION_REQUIRED', '다시 로그인해 주세요.', 401);
    const search = Object.entries(query).filter(([, value]) => value != null).map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
    const controller = new AbortController();
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl.replace(/\/+$/, '')}${path}${search ? `?${search}` : ''}`, {
        method, signal: controller.signal, credentials: 'omit', redirect: 'error',
        headers: { Accept: 'application/json', [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${token}` : token,
          ...(payload ? { 'Content-Type': 'application/json', ...(method==='POST'?{'Idempotency-Key':requestId}:{}) } : {}) },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      const body = await response.json().catch(() => null);
      cancelled(); checkSession();
      if (controller.signal.aborted) throw new Error('Request timed out');
      if (!response.ok) throw new DiaryApiError(body?.code || 'HTTP_ERROR', response.status === 401 ? '다시 로그인해 주세요.'
        : body?.code === 'DIARY_NOT_TRASHED' ? '휴지통으로 먼저 이동한 뒤 영구 삭제해 주세요.'
        : response.status === 403 && path.includes('permanent=true') ? '소유자만 영구 삭제할 수 있어요.'
        : response.status === 403 ? (method==='PATCH'?'소유자만 다이어리 정보를 수정할 수 있어요.':'소유자만 휴지통 이동과 복원을 할 수 있어요.')
        : response.status === 410 ? '30일 복원 기한이 지났어요. 더 이상 복원할 수 없어요.'
        : response.status === 404 ? '다이어리를 찾을 수 없어요.'
        : body?.code === 'IDEMPOTENCY_KEY_EXPIRED' ? '확인 기한이 지났어요. 목록에서 생성 여부를 확인해 주세요.'
        : method === 'PATCH' && response.status === 409 ? '저장이 이미 반영됐거나 다이어리가 변경됐어요. 최신 정보를 확인한 뒤 다시 저장해 주세요.'
        : response.status === 409 ? (method==='DELETE'||path.endsWith('/restore')?'다이어리 상태가 변경됐어요. 목록을 새로고침해 주세요.':'이 요청을 다시 처리할 수 없어요. 목록에서 생성 여부를 확인해 주세요.')
        : method === 'DELETE' || path.endsWith('/restore') ? '처리 결과를 확인하지 못했어요. 목록을 확인하고 다시 시도해 주세요.'
        : method === 'PATCH' ? '다이어리를 수정하지 못했어요. 입력을 확인하고 다시 시도해 주세요.'
        : method === 'POST' ? '다이어리를 만들지 못했어요. 입력을 확인하고 다시 시도해 주세요.' : '목록을 불러오지 못했어요. 다시 시도해 주세요.', response.status);
      if (emptyResponse) {if(response.status!==204)throw invalid();return null;}
      if (!body) throw invalid();
      return body;
    } catch (error) {
      cancelled(); checkSession();
      if (error instanceof DiaryApiError) throw error;
      throw new DiaryApiError('NETWORK_ERROR', '연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  };
  return {
    async create(input, { requestId, signal } = {}) {
      if (!uuid(requestId)) throw new DiaryApiError('INVALID_IDEMPOTENCY_KEY', '요청 정보를 확인해 주세요.', 400);
      const payload=accountDiaryCreateInput(input);
      const body=await request('/diaries', {method:'POST',payload,requestId,signal});
      const diary=toAuthenticatedDiary(body.diary);
      if (!uuid(body.firstPageId) || body.firstPageId !== diary.firstPageId || diary.pageCount !== 1
        || diary.role !== 'OWNER' || diary.type !== '개인' || diary.trashedAt !== null) throw invalid();
      return diary;
    },
    async update(id, input, {signal} = {}) {
      if (!uuid(id)) throw new DiaryApiError('INVALID_DIARY_ID','다이어리 ID를 확인해 주세요.',400);
      const payload=accountDiaryUpdatePayload(input);
      const diary=toAuthenticatedDiary((await request(`/diaries/${encodeURIComponent(id)}`,{method:'PATCH',payload,signal})).diary);
      if (diary.id!==id || !diary.canEdit || BigInt(diary.version)!==BigInt(payload.expectedVersion)+1n) throw invalid();
      return diary;
    },
    async trash(id,{signal}={}) {
      if(!uuid(id))throw new DiaryApiError('INVALID_DIARY_ID','다이어리 ID를 확인해 주세요.',400);
      return request(`/diaries/${encodeURIComponent(id)}`,{method:'DELETE',signal,emptyResponse:true});
    },
    async permanentlyDelete(id,{signal}={}) {
      if(!uuid(id))throw new DiaryApiError('INVALID_DIARY_ID','다이어리 ID를 확인해 주세요.',400);
      return request(`/diaries/${encodeURIComponent(id)}?permanent=true`,{method:'DELETE',signal,emptyResponse:true});
    },
    async restore(id,{signal}={}) {
      if(!uuid(id))throw new DiaryApiError('INVALID_DIARY_ID','다이어리 ID를 확인해 주세요.',400);
      const row=toAuthenticatedDiary((await request(`/diaries/${encodeURIComponent(id)}/restore`,{method:'POST',signal})).diary);
      if(row.id!==id || row.role!=='OWNER' || row.trashedAt!==null || row.expiresAt!==null)throw invalid();
      return row;
    },
    async list(options) {
      const body = await request('/diaries', options);
      if (!Array.isArray(body.items) || typeof body.hasNext !== 'boolean'
        || (body.hasNext ? typeof body.nextCursor !== 'string' || !body.nextCursor : body.nextCursor !== null)) throw invalid();
      return { items: body.items.map(toAuthenticatedDiary), hasNext: body.hasNext, nextCursor: body.nextCursor };
    },
    async get(id, options) {
      if (!uuid(id)) throw new DiaryApiError('INVALID_DIARY_ID', '다이어리 ID를 확인해 주세요.', 400);
      const diary = toAuthenticatedDiary((await request(`/diaries/${encodeURIComponent(id)}`, options)).diary);
      if (diary.id !== id) throw invalid();
      return diary;
    },
  };
}

export function accountDiaryCreateInput(input) {
  const title=typeof input?.title==='string'?input.title.trim():'';
  const style=input?.pattern==null?'PLAIN':String(input.pattern).toUpperCase();
  if (!title || title.length>100 || /[\u0000-\u001f\u007f]/.test(title) || !/^#[0-9a-f]{6}$/i.test(input?.color)
    || !['PLAIN','LINEN','LEATHER','DOT','GINGHAM','STRIPE'].includes(style) || !['landscape','portrait'].includes(input?.pageSize))
    throw new DiaryApiError('INVALID_CREATE_INPUT','이름과 표지, 페이지 방향을 확인해 주세요.',400);
  return {diaryTitle:title,coverColor:input.color.toUpperCase(),coverStyle:style,firstPage:{type:'BLANK',orientation:input.pageSize}};
}

// Preserve unrelated concurrent changes: send only fields edited against the original form.
export function accountDiaryUpdateInput(form, source) {
  const result={version:source.version};
  if(form.title?.trim()!==source.title)result.title=form.title?.trim();
  if(form.color?.toUpperCase()!==source.color?.toUpperCase())result.color=form.color;
  if((form.pattern??null)!==(source.pattern??null))result.pattern=form.pattern??null;
  accountDiaryUpdatePayload(result);
  return result;
}
export function accountDiaryUpdatePayload(input) {
  if(!validVersion(input?.version))throw new DiaryApiError('INVALID_VERSION','최신 정보를 다시 확인해 주세요.',400);
  const payload={expectedVersion:input.version};
  if(Object.hasOwn(input,'title')) {
    const title=typeof input.title==='string'?input.title.trim():'';
    if(!title || title.length>100 || /[\u0000-\u001f\u007f]/.test(title))throw new DiaryApiError('INVALID_TITLE','이름은 1~100자로 입력해 주세요.',400);
    payload.diaryTitle=title;
  }
  if(Object.hasOwn(input,'color')) {
    if(!/^#[0-9a-f]{6}$/i.test(input.color))throw new DiaryApiError('INVALID_COLOR','표지 색상을 확인해 주세요.',400);
    payload.coverColor=input.color.toUpperCase();
  }
  if(Object.hasOwn(input,'pattern')) {
    const style=input.pattern==null?'PLAIN':String(input.pattern).toUpperCase();
    if(!['PLAIN','LINEN','LEATHER','DOT','GINGHAM','STRIPE'].includes(style))throw new DiaryApiError('INVALID_STYLE','표지 패턴을 확인해 주세요.',400);
    payload.coverStyle=style;
  }
  if(Object.keys(payload).length===1)throw new DiaryApiError('NO_CHANGES','변경한 내용이 없어요.',400);
  return payload;
}
