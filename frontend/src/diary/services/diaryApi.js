import { FALLBACK_COVER_COLOR } from '../constants.js';
import { AUTHENTICATION_FAILED_MESSAGE } from '../../auth/sessionExpiry.js';

// 229 합의 전 DTO는 이 어댑터 한 곳에서만 화면 모델로 변환한다.
export class DiaryApiError extends Error {
  constructor(code, message, status = 0) { super(message); this.code = code; this.status = status; }
}
export function toDiary(row) {
  if (!row || typeof row.diaryId !== 'string' || !row.diaryId || typeof row.diaryTitle !== 'string') {
    throw new DiaryApiError('INVALID_RESPONSE', '다이어리 정보를 확인하지 못했어요. 다시 시도해 주세요.');
  }
  return {
    id: row.diaryId, title: row.diaryTitle, color: row.coverColor || FALLBACK_COVER_COLOR,
    pattern: row.coverPattern?.toLowerCase() || null, binding: row.bindingType,
    type: row.visibility === 'MEMBERS' ? '공유' : '개인',
    favorite: row.myMembership?.isFavorite === true,
    createdAt: row.createdAt, updatedAt: row.updatedAt, trashedAt: row.deletedAt ?? null,
    expiresAt: row.expiresAt ?? null, retentionStatus: row.retentionStatus ?? null,
    canRestore: row.canRestore === true,
    pageSize: row.orientation === 'portrait' ? 'portrait' : 'landscape', pageCount: row.pageCount ?? null, version: row.version,
    templateConfig: row.templateConfig, paperAppearance: row.paperAppearance,
    canEdit: row.canEdit === true,
  };
}
export function createDiaryApi(transport) {
  const write = async (method, path, body, options) => {
    const result = await transport({ ...options, method, path, body });
    const diary = toDiary(result?.diary);
    return result?.firstPageId ? { ...diary, firstPageId: result.firstPageId } : diary;
  };
  return {
    // 요청/응답 및 Idempotency-Key는 229 합의 전 제안이다. 화면은 이 메서드만 사용한다.
    create(input, options = {}) {
      return write('POST', '/diaries', { diaryTitle: input.title, coverColor: input.color, initialPages: input.initialPages,
        ...(input.pattern !== undefined ? { coverPattern: input.pattern } : {}),
        ...(input.pageSize ? { orientation: input.pageSize } : {}),
        ...(input.templateConfig ? { templateConfig: input.templateConfig } : {}),
        ...(input.paperAppearance ? { paperAppearance: input.paperAppearance } : {}) }, options);
    },
    async update(id, input, options = {}) {
      const diary = await write('PATCH', `/diaries/${encodeURIComponent(id)}`, { diaryTitle: input.title, coverColor: input.color, expectedVersion: input.version,
        ...(input.pattern !== undefined ? { coverPattern: input.pattern } : {}) }, options);
      if (diary.id !== id) throw new DiaryApiError('INVALID_RESPONSE', '요청한 다이어리와 수정 응답이 달라요.');
      return diary;
    },
    async trash(id, options = {}) {
      await transport({ ...options, method: 'DELETE', path: `/diaries/${encodeURIComponent(id)}` });
      return { id };
    },
    async restore(id, options = {}) {
      await transport({ ...options, method: 'POST', path: `/diaries/${encodeURIComponent(id)}/restore` });
      return { id };
    },
    async permanentlyDelete(id, options = {}) {
      await transport({ ...options, method: 'DELETE', path: `/diaries/${encodeURIComponent(id)}`, query: { permanent: true } });
      return { id };
    },
    async list(options = {}) {
      const body = await transport({ ...options, path: '/diaries' });
      if (!Array.isArray(body?.items)) throw new DiaryApiError('INVALID_RESPONSE', '목록 정보를 확인하지 못했어요.');
      // 기존 비페이지 응답(hasNext 생략)도 지원한다. 커서는 해석하지 않는다.
      if ((body.hasNext !== undefined && typeof body.hasNext !== 'boolean')
        || (body.hasNext === true && (typeof body.nextCursor !== 'string' || !body.nextCursor.trim()))) {
        throw new DiaryApiError('INVALID_RESPONSE', '다음 목록 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      return { items: body.items.map(toDiary), nextCursor: body.hasNext === true ? body.nextCursor : null, hasNext: body.hasNext === true };
    },
    async get(id, options = {}) {
      const body = await transport({ ...options, path: `/diaries/${encodeURIComponent(id)}` });
      const diary = toDiary(body?.diary);
      if (diary.id !== id) throw new DiaryApiError('INVALID_RESPONSE', '요청한 다이어리와 응답이 달라요.');
      return diary;
    },
  };
}
// 합의 후 사용할 HTTP 경계. 앱 기본 경로에는 아직 연결하지 않는다.
export function createHttpTransport({ baseUrl, getAccessToken, fetchImpl = globalThis.fetch, accessTokenHeader = 'Authorization', getAuthHeaders }) {
  if (!['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader)) throw new Error('인증 헤더 설정을 확인해 주세요.');
  return async ({ path, signal, query = {}, method = 'GET', body: payload, requestId }) => {
    const token = await getAccessToken();
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (!token) throw new DiaryApiError('UNAUTHENTICATED', '로그인이 필요해요.', 401);
    const search = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== undefined).map(([k, v]) => [k, String(v)]));
    const queryString = search.toString();
    const url = `${baseUrl.replace(/\/$/, '')}${path}${queryString ? `?${queryString}` : ''}`;
    let authHeaders;
    try {
      authHeaders = getAuthHeaders ? getAuthHeaders(url, token)
        : { [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${token}` : token };
    } catch {
      throw new DiaryApiError('API_NOT_CONFIGURED', '다이어리 서버 인증 설정을 확인해 주세요.');
    }
    let response;
    try {
      response = await fetchImpl(url, {
        credentials: 'omit', redirect: 'error',
        signal, method, body: payload === undefined ? undefined : JSON.stringify(payload),
        headers: { Accept: 'application/json', ...authHeaders,
          ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(requestId ? { 'Idempotency-Key': requestId } : {}) },
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new DiaryApiError('NETWORK_ERROR', '연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.');
    }
    let body;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const message = response.status === 401 ? AUTHENTICATION_FAILED_MESSAGE
        : response.status === 403 ? '이 작업을 할 권한이 없어요.'
        : response.status === 404 ? '다이어리를 찾을 수 없어요.'
        : response.status === 409 ? '다른 변경이 있어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.'
        : response.status === 410 ? '복원 가능한 기간이 지났어요.' : '요청을 처리하지 못했어요. 다시 시도해 주세요.';
      throw new DiaryApiError(body?.code || 'HTTP_ERROR', message, response.status);
    }
    return body;
  };
}
