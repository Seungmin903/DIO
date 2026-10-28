import { normalizeSharingNickname, sharingNicknameError, SharingError } from './sharingPreview.js';

// 로그인 세션에 묶인 공유 API. 로컬 다이어리를 서버 다이어리로 가장하지 않는다.
export function createSharingApi({ user, auth, fetchImpl = globalThis.fetch, buildPhotoBody }) {
  const { baseUrl, accessTokenHeader = 'Authorization' } = auth.getConnectionOptions();
  const sessionKey = auth.getSessionKey();
  const self = { id: String(user.userId), nickname: user.nickname, photoUri: user.photoUri || null };
  const diaries = new Map(), invitations = new Map(), listeners = new Set();
  let active = true, generation = 0, snapshot = { diaries: [], joined: [], library: [] };
  const fail = (code, message) => { throw new SharingError(code, message); };
  const publish = () => {
    snapshot = { diaries: [...diaries.values()], joined: [...diaries.values()].filter(d => d.members.some(m => m.id === self.id && m.role === 'EDITOR')), library: [] };
    listeners.forEach(fn => fn());
  };
  const headers = async () => {
    const token = await auth.getAccessToken({ userId: user.userId, sessionKey });
    return { [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${token}` : token };
  };
  async function request(path, { method = 'GET', body, multipart = false, signal } = {}) {
    const revision = generation;
    if (!active) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const controller = new AbortController();
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 20000);
    try {
      const authorization = await headers();
      if (!active || generation !== revision) fail('DISPOSED', '화면을 다시 열어 주세요.');
      if (signal?.aborted) abort();
      const response = await fetchImpl(`${baseUrl}${path}`, { method, signal: controller.signal,
        headers: { Accept: 'application/json', ...authorization, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
      const value = response.status === 204 ? null : await response.json().catch(() => null);
      if (!active || generation !== revision) fail('DISPOSED', '화면을 다시 열어 주세요.');
      if (!response.ok) {
        const error = new SharingError(value?.code || 'HTTP_ERROR', value?.detail || '공유 요청을 처리하지 못했어요. 다시 시도해 주세요.');
        error.status = response.status; throw error;
      }
      return value;
    } catch (error) {
      if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      if (error.code || error.status) throw error;
      fail('NETWORK_ERROR', '서버에 연결하지 못했어요. 서버 주소와 네트워크를 확인해 주세요.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const path = id => `/diaries/${encodeURIComponent(id)}`;
  const uri = value => value ? new URL(value, baseUrl).href : null;
  async function privatePhoto(value, authorization) {
    if (!value) return null;
    const url = new URL(value, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(`${new URL(baseUrl).pathname}/diaries/`))
      fail('INVALID_RESPONSE', '프로필 사진 주소를 확인하지 못했어요.');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(url.href, { headers: authorization, signal: controller.signal });
      if (!response.ok) return null; // 사진 실패로 멤버 관리 전체를 차단하지 않는다.
      if (!response.headers.get('content-type')?.startsWith('image/png')) return null;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length > 6 * 1024 * 1024) return null;
      const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let encoded = '';
      for (let i = 0; i < bytes.length; i += 3) {
        const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
        encoded += alphabet[(n >>> 18) & 63] + alphabet[(n >>> 12) & 63]
          + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : '=') + (i + 2 < bytes.length ? alphabet[n & 63] : '=');
      }
      return `data:image/png;base64,${encoded}`;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }
  const ensureServerId = id => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || ''))
      fail('LOCAL_DIARY', '서버에서 만든 다이어리만 공유할 수 있어요.');
  };
  const inviteView = row => ({ ...row, inviteId: String(row.inviteId), canOpen: row.status === 'PENDING',
    diary: { diaryId: row.diaryId, id: row.diaryId, title: row.diaryTitle }, inviter: row.inviterNickname });
  async function received({ cursor, signal } = {}) {
    const page = Number(cursor || 0);
    const result = await request(`/me/invites?page=${page}&size=20`, { signal });
    result.items.forEach(row => invitations.set(String(row.inviteId), inviteView(row)));
    return { items: result.items.map(row => ({ id: String(row.inviteId), inviteId: String(row.inviteId),
      title: row.diaryTitle, actor: row.inviterNickname, status: row.status, notificationType: 'DIARY_INVITE',
      actionable: row.status === 'PENDING', createdAt: row.createdAt, readAt: row.createdAt,
      diary: { title: row.diaryTitle } })), hasNext: result.hasNext, nextCursor: result.hasNext ? String(page + 1) : null };
  }
  async function invitation(id) {
    // 목록의 오래된 상태를 그대로 사용하지 않고 본인 수신 목록을 다시 확인한다.
    let cursor = null;
    do {
      const result = await received({ cursor });
      if (result.items.some(row => row.inviteId === id)) return invitations.get(id);
      cursor = result.nextCursor;
    } while (cursor);
    fail('INVITE_NOT_FOUND', '받은 초대를 찾을 수 없어요.');
  }
  async function getSharing(id) {
    const revision = generation;
    ensureServerId(id);
    const [members, links, detail, authorization] = await Promise.all([
      request(`${path(id)}/members`), request(`${path(id)}/invites`), request(path(id)), headers(),
    ]);
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const mappedMembers = await Promise.all(members.members.map(async m => ({ id: String(m.userId), nickname: m.nickname, role: m.role,
      photoUri: m.usingAccountPhoto ? uri(m.profilePhotoUrl) : await privatePhoto(m.profilePhotoUrl, authorization),
      presence: m.role === 'OWNER' ? '소유자' : '편집자' })));
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const diary = { id, title: detail.diary.diaryTitle, color: detail.diary.coverColor,
      link: links.available ? links.inviteUrl : null, favorite: detail.diary.myMembership?.isFavorite === true,
      members: mappedMembers };
    diaries.set(id, diary); publish(); return diary;
  }
  const checkNickname = async (_id, nickname) => {
    const error = sharingNicknameError(nickname);
    if (error) fail('INVALID_NICKNAME', error);
    return normalizeSharingNickname(nickname); // 별칭 중복 허용: 서버 중복 확인 API 없음.
  };
  async function updateProfile(id, { nickname, photoUri }) {
    const body = { nickname: await checkNickname(id, nickname) };
    const current = diaries.get(id)?.members.find(m => m.id === self.id);
    if (photoUri === null || photoUri === self.photoUri) body.memberProfilePhotoId = null;
    const upload = photoUri && photoUri !== self.photoUri && photoUri !== current?.photoUri;
    if (upload) {
      const prepared = await buildPhotoBody(body, photoUri, 'profile');
      try { await request(`${path(id)}/profile`, { method: 'PATCH', body: prepared.body, multipart: true }); }
      finally { prepared.dispose(); }
    } else await request(`${path(id)}/profile`, { method: 'PATCH', body });
    return getSharing(id);
  }
  return {
    self, server: true, supportsReadState: false, supportsExportSettings: false, canOpenDiary: false,
    notificationApi: { list: received, async count() {
      let cursor = null, pending = 0;
      do { const result = await received({ cursor }); pending += result.items.filter(row => row.actionable).length; cursor = result.nextCursor; } while (cursor);
      // 초대 API에는 읽음 상태가 없다. 이 값은 미수락 초대 수로만 사용한다.
      return { unreadCount: pending, actionableUnreadCount: pending };
    } },
    invitationGateway: { get: invitation }, getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    activate() { active = true; }, dispose() { active = false; generation++; diaries.clear(); invitations.clear(); publish(); },
    setAccountProfile(value) { self.nickname = value.nickname; self.photoUri = value.photoUri || null; },
    registerDiary(source) { ensureServerId(source.sharedDiaryId || source.id); return diaries.get(source.sharedDiaryId || source.id) || { ...source, members: [] }; },
    getSharing, checkProfileNickname: checkNickname, checkNickname, updateProfile,
    hasMembership(id) { return diaries.get(invitations.get(id)?.diary.diaryId)?.members.some(m => m.id === self.id) === true; },
    async createLink(id) { await request(`${path(id)}/invites`, { method: 'POST' }); return getSharing(id); },
    async resolveLink(value) {
      let url;
      try { url = new URL(value.trim()); } catch { fail('INVALID_LINK', '초대 링크를 확인해 주세요.'); }
      if (!['https:', 'http:', 'dio:'].includes(url.protocol)) fail('INVALID_LINK', '초대 링크를 확인해 주세요.');
      let token;
      try { token = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || ''); }
      catch { fail('INVALID_LINK', '초대 링크를 확인해 주세요.'); }
      if (!token) fail('INVALID_LINK', '초대 링크를 확인해 주세요.');
      const row = await request(`/invites/${encodeURIComponent(token)}`);
      const result = { ...row, inviteId: token, token, canOpen: row.status === 'PENDING', diary: { diaryId: row.diaryId, title: row.title } };
      invitations.set(token, result); return result;
    },
    async accept(id, nickname, { photoUri = self.photoUri } = {}) {
      await checkNickname(id, nickname);
      const row = invitations.get(id) || await invitation(id);
      const result = await request(`/invites/${encodeURIComponent(row.token)}/accept`, { method: 'POST' });
      await getSharing(result.diaryId);
      // 가입은 이미 완료됐으므로 프로필 오류를 참여 실패로 표시하지 않는다.
      try { return await updateProfile(result.diaryId, { nickname, photoUri }); }
      catch { return { ...diaries.get(result.diaryId), profileWarning: '참여했어요. 프로필은 공유 설정에서 다시 수정해 주세요.' }; }
    },
    async decline(id) { await request(`/me/invites/${encodeURIComponent(id)}/decline`, { method: 'POST' }); },
    async removeMember(id, memberId) { await request(`${path(id)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }); return getSharing(id); },
    async leave(id) { await request(`${path(id)}/members/${self.id}`, { method: 'DELETE' }); diaries.delete(id); publish(); },
    async toggleFavorite(id) { const diary = diaries.get(id); await request(`${path(id)}/profile`, { method: 'PATCH', body: { favorite: !diary?.favorite } }); return getSharing(id); },
  };
}
