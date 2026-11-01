import { NotificationError } from './notificationApi.js';

const clone = value => JSON.parse(JSON.stringify(value));
const abort = () => Object.assign(new Error('Cancelled'), { name: 'AbortError' });
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abort()); return; }
    const cancel = () => { clearTimeout(timer); reject(abort()); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}
// 개발용 메모리 서버. 저장소/인증/로컬 다이어리와 접촉하지 않는다.
// seed: 처음부터 받은 초대 4건(대기 · 만료 · 취소 · 대기)을 넣어 둘지. 끄면 빈 알림함으로 시작한다.
export function createMockNotificationTransport({ account = 'A', delay = 500, pageSize = 2, seed = true } = {}) {
  let serial = 0;
  const rows = [], invitations = new Map(), modes = new Map();
  const add = (status = 'PENDING') => {
    const n = ++serial, inviteId = `${account}-invite-${n}`, notificationId = String(n);
    const diary = { diaryId: `${account}-diary-${n}`, title: `${account} 계정 초대 ${n}` };
    invitations.set(inviteId, { inviteId, status, canOpen: status === 'PENDING', diary, role: 'EDITOR' });
    rows.unshift({ notificationId, type: 'DIARY_INVITED', actor: { nickname: '샘플 친구' }, diary,
      invitation: { inviteId, status }, action: { enabled: status === 'PENDING' }, readAt: null, createdAt: new Date().toISOString() });
    return notificationId;
  };
  if (seed) ['PENDING', 'EXPIRED', 'REVOKED', 'PENDING'].forEach(add);
  const project = row => { if (!row.invitation) return row; const status = invitations.get(row.invitation.inviteId)?.status || 'UNAVAILABLE';
    return { ...row, invitation: { ...row.invitation, status }, action: { enabled: status === 'PENDING' } }; };
  const fail = () => { throw new NotificationError('TEMPORARILY_UNAVAILABLE', '알림 요청을 처리하지 못했어요. 다시 시도해 주세요.', 503); };
  return {
    add,
    // 테스트용 종류이며 서버 계약의 enum을 추가하지 않는다.
    addGeneral(type = 'MOCK_NOTICE') {
      const notificationId = String(++serial);
      rows.unshift({ notificationId, type, readAt: null, createdAt: new Date().toISOString() });
      return notificationId;
    },
    setScenario(channel, mode) { modes.set(channel, mode); },
    setInvitationStatus(id, status) { const value = invitations.get(id); if (value) value.status = status; },
    setInvitationCanOpen(id, canOpen) { const value = invitations.get(id); if (value) value.canOpen = canOpen; },
    inspect: () => ({ rows: clone(rows), invitations: clone([...invitations.values()]) }),
    async transport({ path, method = 'GET', query = {}, body, signal }) {
      const channel = path.startsWith('/me/') ? 'invitation' : method !== 'GET' ? 'write' : path.endsWith('unread-count') ? 'count' : 'list';
      const mode = modes.get(channel);
      if (mode === 'fail-once' || mode === 'response-lost') modes.delete(channel);
      await wait(delay, signal);
      if (mode === 'fail-once' || mode === 'error') fail();
      if (mode === 'unauthorized') throw new NotificationError('AUTHENTICATION_REQUIRED', '로그인이 필요해요.', 401);
      if (mode === 'not-found') throw new NotificationError('NOT_FOUND', '대상을 찾을 수 없어요.', 404);
      if (mode === 'network-error') throw new NotificationError('NETWORK_ERROR', '연결하지 못했어요.');
      if (mode === 'forbidden') throw new NotificationError('FORBIDDEN', '이 초대를 확인할 권한이 없어요.', 403);
      if (channel === 'invitation') {
        const inviteId = decodeURIComponent(path.split('/').pop());
        const value = invitations.get(inviteId);
        if (!value) throw new NotificationError('INVITATION_NOT_FOUND', '초대를 찾을 수 없어요.', 404);
        const status = mode === 'expired' ? 'EXPIRED' : mode === 'revoked' ? 'REVOKED' : value.status;
        return clone({ ...value, status, canOpen: status === 'PENDING' && value.canOpen === true && mode !== 'cannot-open' });
      }
      const live = rows.filter(row => !row.deletedAt);
      if (channel === 'count') return { unreadCount: live.filter(row => !row.readAt).length,
        actionableUnreadCount: live.filter(row => !row.readAt && project(row).action?.enabled === true).length };
      if (channel === 'list') {
        const start = query.cursor ? Number(query.cursor) : 0;
        const items = mode === 'empty' ? [] : live.slice(start, start + pageSize).map(project);
        const hasNext = mode !== 'empty' && start + pageSize < live.length;
        return clone({ items, hasNext, nextCursor: hasNext ? String(start + pageSize) : null });
      }
      if (path.endsWith('/read-all')) {
        if (!rows.some(row => row.notificationId === body.throughNotificationId)) throw new NotificationError('INVALID_BOUNDARY', '읽음 기준을 다시 확인해 주세요.', 400);
        live.filter(row => Number(row.notificationId) <= Number(body.throughNotificationId)).forEach(row => { row.readAt ||= new Date().toISOString(); });
      } else {
        const row = rows.find(item => item.notificationId === decodeURIComponent(path.split('/').pop()));
        if (!row) throw new NotificationError('NOTIFICATION_NOT_FOUND', '알림을 찾을 수 없어요.', 404);
        if (method === 'DELETE') row.deletedAt ||= new Date().toISOString();
        else row.readAt ||= new Date().toISOString();
      }
      if (mode === 'response-lost') fail();
      return null;
    },
  };
}
