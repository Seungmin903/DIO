import { authenticationErrorMessage } from '../auth/sessionExpiry.js';
import { normalizeParticipants, validateReport } from './safetyModel.js';

const uuid = value => typeof value === 'string' && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value);
const validId = value => (typeof value !== 'number' || Number.isSafeInteger(value)) && /^[1-9]\d{0,18}$/.test(String(value)) && BigInt(value) <= 9223372036854775807n;
const failure = (code, message, status = 0) => Object.assign(new Error(message), { code, status });
const invalid = () => failure('INVALID_RESPONSE', '서버 응답을 확인하지 못했어요. 다시 불러와 주세요.');
const messages = {
  INVALID_REPORT: '신고 대상과 사유, 설명, 사진을 확인해 주세요.',
  REPORT_TARGET_NOT_FOUND: '현재 함께 참여 중인 사용자만 신고할 수 있어요. 참여자 목록을 다시 확인해 주세요.',
  REPORT_REQUEST_CONFLICT: '이 신고의 이전 요청과 내용이 달라요. 이전 내용으로 재시도하거나 작성 취소 후 새 신고를 시작해 주세요.',
  REPORT_EVIDENCE_TOO_LARGE: '증빙 사진은 한 장당 5MiB까지 첨부할 수 있어요.',
  REPORT_EVIDENCE_UNSUPPORTED: '증빙 사진은 PNG 또는 JPEG만 첨부할 수 있어요.',
};

/** The auth service owns token refresh, gateway headers and login generations. No token is persisted here. */
export function createSafetyApi({ userId, auth, fetchImpl = globalThis.fetch, buildReportBody, getParticipants, timeoutMs = 20000 }) {
  const sessionKey = auth.getSessionKey();
  const { baseUrl, accessTokenHeader = 'Authorization', getAuthHeaders } = auth.getConnectionOptions();
  const base = baseUrl.replace(/\/$/, '');
  const sessionError = () => {
    const error = failure('UNAUTHENTICATED', '', 401);
    error.sessionExpired = auth.isSessionExpired?.(sessionKey) === true;
    error.message = authenticationErrorMessage(error);
    return error;
  };
  const check = () => { if (!sessionKey || auth.getSessionKey() !== sessionKey) throw sessionError(); };
  async function request(path, { method = 'GET', body, multipart = false } = {}) {
    check();
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs);
    const url = `${base}${path}`;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        check();
        const token = await auth.getAccessToken({ userId, sessionKey }); check();
        const authorization = getAuthHeaders ? getAuthHeaders(url, token)
          : { [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${token}` : token };
        const response = await fetchImpl(url, { method, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
          headers: { Accept: 'application/json', 'Cache-Control': 'no-store', ...authorization,
            ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
          ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
        check();
        const data = response.status === 204 ? null : await response.json().catch(() => null); check();
        if (response.status === 401 && data?.code === 'DEVELOPMENT_ACCESS_REQUIRED')
          throw failure(data.code, '개발 서버 접속 인증을 확인해 주세요.', 401);
        if (response.status === 401 && attempt === 0) { await auth.refresh(); check(); continue; }
        if (!response.ok) {
          if (response.status === 401) throw sessionError();
          const code = data?.code || 'HTTP_ERROR';
          throw failure(code, messages[code] || (response.status === 404 || response.status === 501
            ? '신고·차단 서버 기능에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
            : response.status === 403 ? '이 작업을 할 권한이 없어요.'
            : response.status === 429 ? '요청이 많아요. 잠시 후 다시 시도해 주세요.'
            : '요청을 처리하지 못했어요. 다시 시도해 주세요.'), response.status);
        }
        return { data, status: response.status };
      }
    } catch (error) {
      check();
      if (controller.signal.aborted) throw failure('NETWORK_ERROR', '처리 결과를 확인하지 못했어요. 네트워크를 확인한 뒤 같은 요청으로 다시 시도해 주세요.');
      if (error.code || error.status) throw error;
      throw failure('NETWORK_ERROR', '처리 결과를 확인하지 못했어요. 네트워크를 확인한 뒤 같은 요청으로 다시 시도해 주세요.');
    } finally { clearTimeout(timer); }
  }
  async function listBlocks() {
    const unique = new Map();
    for (let page = 0; ; page++) {
      const { data } = await request(`/me/blocks?page=${page}&size=100`);
      if (!data || !Array.isArray(data.items) || data.page !== page || !Number.isSafeInteger(data.size) || data.size < 1 || data.size > 100
          || typeof data.hasNext !== 'boolean' || data.items.length > data.size || (data.hasNext && !data.items.length)) throw invalid();
      for (const row of data.items) {
        if (!row || !validId(row.userId) || typeof row.nickname !== 'string' || !row.nickname.trim()
            || typeof row.blockedAt !== 'string' || !Number.isFinite(Date.parse(row.blockedAt))) throw invalid();
        // List contract deliberately exposes account nickname only, never private diary aliases or inverse blocks.
        unique.set(String(row.userId), { id: String(row.userId), nickname: row.nickname, blockedAt: row.blockedAt });
      }
      if (!data.hasNext) return [...unique.values()];
    }
  }
  return {
    mode: 'server', listBlocks,
    async listWarningDismissals(diaryId) {
      if (!uuid(diaryId)) throw invalid();
      const { data } = await request(`/me/block-warning-dismissals/${diaryId}`);
      if (!Array.isArray(data?.userIds) || !data.userIds.every(validId)) throw invalid();
      return data.userIds.map(String);
    },
    async dismissWarning(diaryId, userIds) {
      if (!uuid(diaryId) || !Array.isArray(userIds) || !userIds.length || !userIds.every(validId)) throw invalid();
      const { status } = await request(`/me/block-warning-dismissals/${diaryId}`, { method: 'PUT', body: { userIds } });
      if (status !== 204) throw invalid();
    },
    async listParticipants(diaryId) {
      if (!uuid(diaryId)) throw failure('INVALID_DIARY', '공유 다이어리를 다시 선택해 주세요.');
      check();
      const rows = getParticipants ? await getParticipants(diaryId)
        : (await request(`/diaries/${encodeURIComponent(diaryId)}/members`)).data?.members;
      check();
      if (!Array.isArray(rows) || rows.some(row => !row || !validId(row.userId ?? row.id))) throw invalid();
      return normalizeParticipants(rows.map(row => ({ ...row, participation: 'CURRENT' })));
    },
    async block(id, diaryId) {
      if (!validId(id) || String(id) === String(userId) || !uuid(diaryId)) throw failure('INVALID_BLOCK', '차단 대상과 공유 다이어리를 확인해 주세요.');
      const result = await request(`/me/blocks/${encodeURIComponent(id)}`, { method: 'PUT', body: { diaryId } });
      if (result.status !== 204) throw invalid();
      // PUT has no DTO: obtain account nickname and original blockedAt from the authoritative list.
      try {
        const row = (await listBlocks()).find(row => row.id === String(id));
        if (!row) throw invalid();
        return row;
      } catch {
        check();
        throw failure('BLOCK_REFRESH_REQUIRED', '차단 요청은 처리됐지만 목록을 확인하지 못했어요. 차단 목록을 다시 불러와 주세요.');
      }
    },
    async unblock(id) {
      if (!validId(id) || String(id) === String(userId)) throw failure('INVALID_BLOCK', '차단 해제 대상을 확인해 주세요.');
      const result = await request(`/me/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (result.status !== 204) throw invalid();
    },
    async report(input) {
      const validation = validateReport(input);
      if (validation) throw failure('INVALID_REPORT', validation);
      if (!validId(input.targetUserId) || String(input.targetUserId) === String(userId) || !uuid(input.diaryId) || !uuid(input.clientRequestId))
        throw failure('INVALID_REPORT', messages.INVALID_REPORT);
      const numericTarget = Number(input.targetUserId);
      const payload = { reportedUserId: Number.isSafeInteger(numericTarget) ? numericTarget : String(input.targetUserId), diaryId: input.diaryId, reasonCode: input.reason,
        description: input.description?.trim() || null, clientRequestId: input.clientRequestId };
      check();
      const prepared = await buildReportBody(payload, input.photos || []);
      try {
        check();
        const { data, status } = await request('/reports', { method: 'POST', body: prepared.body, multipart: true });
        if (![200, 201].includes(status) || !validId(data?.reportId) || !['RECEIVED', 'REVIEWING', 'RESOLVED', 'DISMISSED'].includes(data.status)
            || (status === 201 && data.status !== 'RECEIVED')
            || typeof data.createdAt !== 'string' || !Number.isFinite(Date.parse(data.createdAt))) throw invalid();
        return { ...data, reportId: String(data.reportId) };
      } finally { await prepared.dispose?.(); }
    },
  };
}
