import { createServerNotificationSession } from './serverNotificationApi.js';
import { NotificationError } from './notificationApi.js';

// 생성 당시 계정·로그인 세션에 묶는다. 계정 교체 뒤 옛 호출자가 새 계정 토큰을 받지 않는다.
// describeInvitations(inviteIds, { signal }): 초대 알림에 다이어리 제목 · 보낸 사람을 채울 Map(inviteId → { title, actor }). 실패하면 그대로 둔다.
export function createAuthenticatedNotificationSession({ auth, userId, invitations, createInvitations, describeInvitations, fetchImpl }) {
  const sessionKey = auth.getSessionKey();
  const session = createServerNotificationSession({ ...auth.getConnectionOptions(), invitations, createInvitations, fetchImpl,
    getAccessToken: () => auth.getAccessToken({ userId, sessionKey }) });
  const gateway = session.invitations;
  const check = signal => {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
    if (auth.getSessionKey() !== sessionKey) throw new NotificationError('AUTHENTICATION_REQUIRED', '로그인이 필요해요.', 401);
  };
  const list = async (options = {}) => {
    const page = await session.api.list(options);
    const ids = [...new Set(page.items.filter(row => row.inviteId).map(row => row.inviteId))];
    if (!describeInvitations || !ids.length) return page;
    let names;
    try { names = await describeInvitations(ids, { signal: options.signal }); } catch (error) { if (error?.name === 'AbortError') throw error; return page; }
    check(options.signal);
    return { ...page, items: page.items.map(row => names?.get(row.inviteId) ? { ...row, ...names.get(row.inviteId) } : row) };
  };
  return { ...session, api: { ...session.api, list }, invitations: { async get(inviteId, options = {}) {
    check(options.signal);
    const detail = await gateway.get(inviteId, options);
    check(options.signal);
    return detail;
  } } };
}
