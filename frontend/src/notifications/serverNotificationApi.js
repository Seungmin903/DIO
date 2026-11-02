import { NotificationError } from './notificationApi.js';
import { isInvitationNotification } from './notificationPresentation.js';

const invalid = () => new NotificationError('INVALID_RESPONSE', '알림 응답을 확인하지 못했어요. 다시 시도해 주세요.');
const id = value => typeof value === 'string' && value.trim().length > 0;

// baseUrl은 /api/v1까지 포함한다. 인증 갱신·저장은 호출자 책임이다.
export function createNotificationHttpTransport({ baseUrl, getAccessToken = async () => null, fetchImpl = globalThis.fetch, accessTokenHeader = 'Authorization', getAuthHeaders, allowDevelopmentHttp = typeof __DEV__ !== 'undefined' && __DEV__ }) {
  const localHttp = id(baseUrl) && /^http:\/\/(?:localhost|127\.0\.0\.1|10\.0\.2\.2|\[::1\])(?::[0-9]+)?(?:\/|$)/i.test(baseUrl);
  const secure = id(baseUrl) && (/^https:\/\//i.test(baseUrl) || localHttp || allowDevelopmentHttp);
  const configured = secure && ['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader) && id(baseUrl) && /^https?:\/\/[^/?#\s]+(?:\/[^?#\s]*)?$/i.test(baseUrl);
  return async ({ path, method = 'GET', query = {}, body, signal }) => {
    if (!configured) throw new NotificationError('API_NOT_CONFIGURED', '알림 서버 설정을 확인해 주세요.');
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    const token = await getAccessToken();
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (!id(token)) throw new NotificationError('AUTHENTICATION_REQUIRED', '로그인이 필요해요.', 401);
    const search = Object.entries(query).filter(([, value]) => value != null)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
    const url = `${baseUrl.replace(/\/+$/, '')}${path}${search ? `?${search}` : ''}`;
    let authHeaders;
    try {
      authHeaders = getAuthHeaders ? getAuthHeaders(url, token)
        : { [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${token}` : token };
    } catch {
      throw new NotificationError('API_NOT_CONFIGURED', '알림 서버 인증 설정을 확인해 주세요.');
    }
    let response;
    try {
      response = await fetchImpl(url, {
        method, signal, credentials: 'omit', redirect: 'error',
        headers: { Accept: 'application/json', ...authHeaders, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new NotificationError('NETWORK_ERROR', '연결하지 못했어요. 다시 시도해 주세요.');
    }
    if (response.ok && response.status === 204) return null;
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok) {
      const message = response.status === 401 ? '로그인이 필요해요.'
        : response.status === 404 ? '알림을 찾을 수 없어요.' : '알림 요청을 처리하지 못했어요. 다시 시도해 주세요.';
      throw new NotificationError(result?.code || 'HTTP_ERROR', message, response.status);
    }
    if (result === null) throw invalid();
    return result;
  };
}

export function toServerNotification(item) {
  const row = item?.notification, invite = item?.invitation;
  if (!id(row?.notificationId) || !id(row?.notificationType) || !id(row?.createdAt)
    || (row.readAt != null && !id(row.readAt))) throw invalid();
  const invitation = isInvitationNotification(row);
  if (invitation && invite != null && (!id(invite.inviteId) || !id(invite.status) || typeof invite.canOpen !== 'boolean')) throw invalid();
  return { id: row.notificationId, notificationType: row.notificationType, diaryId: row.diaryId,
    actorUserId: row.actorUserId, title: '다이어리 알림', actor: '다른 사용자',
    inviteId: invitation ? invite?.inviteId ?? null : null, status: invitation ? invite?.status ?? 'UNAVAILABLE' : null,
    actionable: invitation && invite?.canOpen === true && invite.status === 'PENDING', readAt: row.readAt ?? null, createdAt: row.createdAt };
}

export function createServerNotificationApi(transport) {
  return {
    async list({ cursor, signal } = {}) {
      const body = await transport({ path: '/notifications', query: { cursor, limit: 20 }, signal });
      if (!Array.isArray(body?.items) || typeof body.hasNext !== 'boolean' || (body.hasNext && !id(body.nextCursor))) throw invalid();
      return { items: body.items.map(toServerNotification), hasNext: body.hasNext, nextCursor: body.hasNext ? body.nextCursor : null };
    },
    async count(options = {}) {
      const body = await transport({ ...options, path: '/notifications/unread-count' });
      if (!Number.isSafeInteger(body?.unreadCount) || body.unreadCount < 0) throw invalid();
      // 이전 서버는 필드가 없다. 전체 미읽음 수를 유효 초대 수로 대체하지 않는다.
      if (body.actionableUnreadCount == null) return { unreadCount: body.unreadCount };
      if (!Number.isSafeInteger(body.actionableUnreadCount) || body.actionableUnreadCount < 0) throw invalid();
      return { unreadCount: body.unreadCount, actionableUnreadCount: body.actionableUnreadCount };
    },
    read(notificationId, options = {}) {
      return transport({ ...options, method: 'PATCH', path: `/notifications/${encodeURIComponent(notificationId)}` });
    },
    async prepareReadAll(options = {}) {
      const body = await transport({ ...options, method: 'POST', path: '/notifications/read-watermarks' });
      if (!id(body?.readWatermark) || !id(body?.expiresAt)) throw invalid();
      return body;
    },
    readAll(readWatermark, options = {}) {
      return transport({ ...options, method: 'POST', path: '/notifications/read-all', body: { readWatermark } });
    },
    remove(notificationId, options = {}) {
      return transport({ ...options, method: 'DELETE', path: `/notifications/${encodeURIComponent(notificationId)}` });
    },
  };
}

// useNotifications(session.api, session.invitations)へ渡す。アカウント変更時は再生成する。
export function createServerNotificationSession({ invitations, createInvitations, ...httpOptions }) {
  const transport = createNotificationHttpTransport(httpOptions);
  const disconnected = { async get() { throw new NotificationError('INVITATION_NOT_CONNECTED', '초대 상세 연결을 기다리고 있어요.'); } };
  const warnFactoryFailure = (error) => {
    if (typeof __DEV__ !== 'undefined' && __DEV__ && typeof console?.warn === 'function') {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      console.warn('[notifications] invitation gateway 연결 실패', detail);
    }
  };
  let gateway = disconnected;
  try {
    const candidate = invitations ?? createInvitations?.({ transport });
    if (typeof candidate?.then === 'function') {
      // factory는 동기 계약이다. 잘못 전달한 async factory의 rejection도 격리한다.
      Promise.resolve(candidate).catch(warnFactoryFailure);
    } else if (typeof candidate?.get === 'function') gateway = candidate;
    else if (candidate != null) warnFactoryFailure(new TypeError('get 메서드가 없는 초대 게이트웨이'));
  } catch (error) {
    // 공유 설정 실패로 기본 알림 목록까지 중단하거나 내부 오류를 노출하지 않는다.
    warnFactoryFailure(error);
  }
  return { api: createServerNotificationApi(transport),
    invitations: gateway };
}
