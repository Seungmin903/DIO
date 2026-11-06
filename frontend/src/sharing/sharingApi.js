import { normalizeSharingNickname, sharingNicknameError, normalizeInviteEmail, inviteEmailError, SharingError } from './sharingContracts.js';
import { AUTHENTICATION_FAILED_MESSAGE } from '../auth/sessionExpiry.js';

export const isSharingDiaryId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '');

// 로그인 세션에 묶인 공유 API. 로컬 다이어리를 서버 다이어리로 가장하지 않는다.
export function createSharingApi({ user, auth, fetchImpl = globalThis.fetch, buildPhotoBody,
  setIntervalImpl = setInterval, clearIntervalImpl = clearInterval, memberRefreshIntervalMs = 5000,
  photoCacheTtlMs = 60_000, maxPhotoCacheEntries = 32, now = Date.now }) {
  const { baseUrl, accessTokenHeader = 'Authorization', getAuthHeaders } = auth.getConnectionOptions();
  const sessionKey = auth.getSessionKey();
  const self = { id: String(user.userId), nickname: user.nickname, photoUri: user.photoUri || null };
  const diaries = new Map(), invitations = new Map(), listeners = new Set(), watchedDiaries = new Map(), realtimeDiaries = new Set(), photoCache = new Map();
  let active = true, watchingActive = true, generation = 0, snapshot = { diaries: [], joined: [], library: [] };
  const fail = (code, message) => { throw new SharingError(code, message); };
  const publish = () => {
    snapshot = { diaries: [...diaries.values()], joined: [...diaries.values()].filter(d => d.members.some(m => m.id === self.id && m.role === 'EDITOR')), library: [] };
    listeners.forEach(fn => fn());
  };
  const headers = async target => {
    const token = await auth.getAccessToken({ userId: user.userId, sessionKey });
    if (getAuthHeaders) return getAuthHeaders(target, token);
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
      const authorization = await headers(`${baseUrl}${path}`);
      if (!active || generation !== revision) fail('DISPOSED', '화면을 다시 열어 주세요.');
      if (signal?.aborted) abort();
      const response = await fetchImpl(`${baseUrl}${path}`, { method, signal: controller.signal, redirect: 'error', credentials: 'omit',
        headers: { Accept: 'application/json', ...authorization, ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }) });
      const value = response.status === 204 ? null : await response.json().catch(() => null);
      if (!active || generation !== revision) fail('DISPOSED', '화면을 다시 열어 주세요.');
      if (!response.ok) {
        const error = new SharingError(value?.code || 'HTTP_ERROR', response.status === 401 ? AUTHENTICATION_FAILED_MESSAGE : response.status >= 500 ? '서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.' : value?.detail || '공유 요청을 처리하지 못했어요. 다시 시도해 주세요.');
        error.status = response.status;
        const retryAfter = Number(response.headers?.get?.('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
        throw error;
      }
      return value;
    } catch (error) {
      if (signal?.aborted) throw Object.assign(new Error('Cancelled'), { name: 'AbortError' });
      if (error.code || error.status) throw error;
      fail('NETWORK_ERROR', '서버에 연결하지 못했어요. 서버 주소와 네트워크를 확인해 주세요.');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const path = id => { ensureServerId(id); return `/diaries/${encodeURIComponent(id)}`; };
  const uri = value => value ? new URL(value, baseUrl).href : null;
  const cachedPhoto = (key, load) => {
    const cached = photoCache.get(key);
    if (cached && cached.expiresAt > now()) {
      // Map insertion order is our small LRU policy.
      photoCache.delete(key); photoCache.set(key, cached);
      return cached.value;
    }
    photoCache.delete(key);
    const pending = Promise.resolve().then(load);
    const entry = { value: pending, expiresAt: now() + photoCacheTtlMs };
    photoCache.set(key, entry);
    while (photoCache.size > maxPhotoCacheEntries) photoCache.delete(photoCache.keys().next().value);
    pending.then(value => { if (!value && photoCache.get(key) === entry) photoCache.delete(key); }, () => { if (photoCache.get(key) === entry) photoCache.delete(key); });
    return pending;
  };
  async function privatePhoto(value) {
    if (!value) return null;
    const url = new URL(value, baseUrl);
    if (url.origin !== new URL(baseUrl).origin || !url.pathname.startsWith(`${new URL(baseUrl).pathname}/diaries/`))
      fail('INVALID_RESPONSE', '프로필 사진 주소를 확인하지 못했어요.');
    return cachedPhoto(`private:${url.href}`, () => readPhoto(url, () => headers(url.href)));
  }
  async function accountPhoto(value) {
    const photoUri = uri(value);
    if (!photoUri) return null;
    const source = auth.getProfilePhotoSource?.(photoUri) || { uri: photoUri };
    // Public account photos need only gateway access, never the member token.
    if (!source.headers) return photoUri;
    let target;
    try { target = new URL(source.uri); } catch { return null; }
    if (target.origin !== new URL(baseUrl).origin || target.username || target.password) return null;
    return cachedPhoto(`account:${target.href}`, () => readPhoto(target, () => source.headers));
  }
  async function readPhoto(url, getHeaders) {
    const revision = generation;
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const authorization = await getHeaders();
      if (!active || revision !== generation) return null;
      const response = await fetchImpl(url.href, { headers: authorization, signal: controller.signal, redirect: 'error', credentials: 'omit' });
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
    if (!isSharingDiaryId(id))
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
      if (result.items.some(row => row.inviteId === id)) {
        const own = invitations.get(id);
        if (own.status !== 'PENDING') return own;
        const detail = await request(`/invites/${encodeURIComponent(own.token)}`);
        const fresh = { ...own, ...detail, inviteId: own.inviteId, token: own.token,
          diary: { ...own.diary, title: detail.title || own.diary.title }, canOpen: detail.status === 'PENDING' };
        invitations.set(id, fresh); return fresh;
      }
      cursor = result.nextCursor;
    } while (cursor);
    fail('INVITE_NOT_FOUND', '받은 초대를 찾을 수 없어요.');
  }
  const validMemberId = value => (typeof value !== 'number' || Number.isSafeInteger(value)) && /^[1-9][0-9]{0,18}$/.test(String(value)) && BigInt(value) <= 9223372036854775807n;
  function sentPage(page) {
    if (!page || !Array.isArray(page.items) || !Number.isSafeInteger(page.page) || page.page < 0 || typeof page.hasNext !== 'boolean')
      fail('INVALID_RESPONSE', '보낸 초대 목록을 확인하지 못했어요.');
    const items = page.items.map(row => {
      if (!row || !validMemberId(row.inviteId) || (row.recipientEmail != null && typeof row.recipientEmail !== 'string') || typeof row.status !== 'string')
        fail('INVALID_RESPONSE', '보낸 초대 목록을 확인하지 못했어요.');
      // Do not copy recipient tokens or invite URLs into the sent-list view.
      return { id: String(row.inviteId), email: row.recipientEmail || '탈퇴한 사용자', status: row.status, createdAt: row.createdAt };
    });
    return { items, nextPage: page.hasNext ? page.page + 1 : null };
  }
  async function loadMoreEmailInvites(id) {
    ensureServerId(id);
    const previous = diaries.get(id);
    if (!previous || previous.emailNextPage == null) return previous;
    const result = await request(`${path(id)}/invites?page=${previous.emailNextPage}&size=20`);
    const next = sentPage(result?.emailInvites);
    if (result.emailInvites.page !== previous.emailNextPage) fail('INVALID_RESPONSE', '보낸 초대 목록을 다시 확인해 주세요.');
    if (diaries.get(id) !== previous) return diaries.get(id);
    const rows = new Map(previous.emailInvites.map(row => [row.id, row]));
    next.items.forEach(row => rows.set(row.id, row));
    const diary = { ...previous, emailInvites: [...rows.values()], emailNextPage: next.nextPage };
    diaries.set(id, diary); publish(); return diary;
  }
  async function refreshChanged(id) {
    const revision = generation;
    try { return await getSharing(id); }
    catch (error) {
      if (!active || generation !== revision || [401, 403, 404].includes(error.status) || error.code === 'DISPOSED') throw error;
      const previous = diaries.get(id);
      if (!previous) throw error;
      const diary = { ...previous, refreshWarning: '요청은 반영됐지만 최신 목록을 불러오지 못했어요. 새로고침해 주세요.' };
      diaries.set(id, diary); publish(); return diary;
    }
  }
  const mapMembers = members => Promise.all(members.map(async m => ({ id: String(m.userId), nickname: m.nickname, role: m.role, color: m.memberColor || null,
    activeAccount: m.activeAccount, blockedByMe: m.blockedByMe,
    photoUri: m.usingAccountPhoto ? await accountPhoto(m.profilePhotoUrl) : await privatePhoto(m.profilePhotoUrl),
    presence: m.role === 'OWNER' ? '소유자' : '편집자' })));
  const withMemberRoles = (diary, members) => ({ ...diary, members,
    ownerId: members.find(member => member.role === 'OWNER')?.id || null,
    myRole: members.find(member => member.id === self.id)?.role || null });
  async function getMembers(id) {
    const revision = generation;
    const value = await request(`${path(id)}/members`);
    if (!Array.isArray(value?.members)) fail('INVALID_RESPONSE', '참여자 목록을 확인하지 못했어요.');
    const rows = await mapMembers(value.members);
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    return rows;
  }
  // Canvas WebSocket notifications intentionally contain only canvas operations. Keep the
  // small membership view fresh separately while somebody is looking at this diary.
  async function refreshMembers(id) {
    const revision = generation;
    const members = await getMembers(id);
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const previous = diaries.get(id);
    if (!previous) return getSharing(id);
    const { refreshWarning, ...current } = previous;
    const next = withMemberRoles(current, members);
    if (JSON.stringify({ members: previous.members, ownerId: previous.ownerId, myRole: previous.myRole }) === JSON.stringify({ members: next.members, ownerId: next.ownerId, myRole: next.myRole }) && !refreshWarning)
      return previous;
    diaries.set(id, next);
    publish();
    return diaries.get(id);
  }
  function watchDiary(id, { onUnavailable } = {}) {
    ensureServerId(id);
    let watch = watchedDiaries.get(id);
    if (!watch) {
      watch = { count: 0, timer: null, refreshing: null, failures: 0, skipTicks: 0, stopped: false, unavailable: new Set() };
      watchedDiaries.set(id, watch);
    }
    watch.count++;
    if (typeof onUnavailable === 'function') watch.unavailable.add(onUnavailable);
    const stop = message => {
      watch.stopped = true;
      if (watch.timer !== null) clearIntervalImpl(watch.timer);
      watch.timer = null;
      if (watchedDiaries.get(id) === watch) watchedDiaries.delete(id);
      if (message) watch.unavailable.forEach(listener => { try { listener(message); } catch {} });
    };
    const refresh = (force = false) => {
      if (!force && realtimeDiaries.has(id)) return null;
      if (!active || !watchingActive || watch.stopped || watch.refreshing) return watch.refreshing;
      watch.refreshing = (diaries.has(id) ? refreshMembers(id) : getSharing(id))
        .then(value => { watch.failures = 0; watch.skipTicks = 0; return value; })
        .catch(error => {
          if (error?.code === 'DISPOSED') stop();
          else if ([401, 403, 404].includes(error?.status)) {
            const previous = diaries.get(id);
            const message = error.status === 401 ? '로그인 상태가 바뀌었어요. 다시 로그인해 주세요.' : '공유 권한 또는 다이어리 상태가 바뀌었어요. 목록을 다시 확인해 주세요.';
            if (previous) { diaries.set(id, { ...previous, refreshWarning: message }); publish(); }
            stop(message);
          } else { watch.failures = Math.min(watch.failures + 1, 3); watch.skipTicks = 2 ** watch.failures - 1; }
          return null;
        })
        .finally(() => { if (watchedDiaries.get(id) === watch) watch.refreshing = null; });
      return watch.refreshing;
    };
    watch.refresh = refresh;
    refresh(true);
    if (!watch.timer) watch.timer = setIntervalImpl(() => {
      if (watch.skipTicks > 0) { watch.skipTicks--; return; }
      refresh();
    }, memberRefreshIntervalMs);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      watch.count--;
      if (typeof onUnavailable === 'function') watch.unavailable.delete(onUnavailable);
      if (watch.count <= 0) stop();
    };
  }
  async function getSharing(id) {
    const revision = generation;
    ensureServerId(id);
    const [members, links, detail] = await Promise.all([
      request(`${path(id)}/members`), request(`${path(id)}/invites?page=0&size=20`), request(`/member/diaries/${id}`),
    ]);
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const sent = sentPage(links?.emailInvites);
    const mappedMembers = await mapMembers(members.members);
    if (!active || revision !== generation) fail('DISPOSED', '화면을 다시 열어 주세요.');
    const diary = withMemberRoles({ id, title: detail.diary.diaryTitle, color: detail.diary.coverColor,
      ...(detail.diary.cover?{cover:detail.diary.cover}:{}),
      pattern:detail.diary.coverStyle==='PLAIN'?null:detail.diary.coverStyle?.toLowerCase(),
      link: links.available ? uri(links.inviteUrl) : null, favorite: detail.diary.myMembership?.isFavorite === true,
      linkExpiresAt: links.expiresAt || null, emailInvites: sent.items, emailNextPage: sent.nextPage }, mappedMembers);
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
      try { await request(`${path(id)}/membership`, { method: 'PATCH', body: prepared.body, multipart: true }); }
      finally { prepared.dispose(); }
    } else await request(`${path(id)}/membership`, { method: 'PATCH', body });
    return getSharing(id);
  }
  return {
    self, server: true, supportsReadState: false, supportsExportSettings: false, canOpenDiary: true,
    notificationApi: { list: received, async count() {
      let cursor = null, pending = 0;
      do { const result = await received({ cursor }); pending += result.items.filter(row => row.actionable).length; cursor = result.nextCursor; } while (cursor);
      // 초대 API에는 읽음 상태가 없다. 이 값은 미수락 초대 수로만 사용한다.
      return { unreadCount: pending, actionableUnreadCount: pending };
    } },
    invitationGateway: { get: invitation }, getMembers, getSnapshot: () => snapshot,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    activate() { active = true; }, dispose() { active = false; generation++; watchedDiaries.forEach(watch => { watch.stopped = true; clearIntervalImpl(watch.timer); }); watchedDiaries.clear(); realtimeDiaries.clear(); photoCache.clear(); diaries.clear(); invitations.clear(); publish(); },
    setWatchingActive(value) { watchingActive = value === true; if (watchingActive) watchedDiaries.forEach(watch => { watch.skipTicks = 0; watch.refresh?.(); }); },
    setWatchingRealtime(id, connected) { if (!isSharingDiaryId(id)) return; if (connected) realtimeDiaries.add(id); else { realtimeDiaries.delete(id); watchedDiaries.get(id)?.refresh?.(true); } },
    setAccountProfile(value) { self.nickname = value.nickname; self.photoUri = value.photoUri || null; for (const key of photoCache.keys()) if (key.startsWith('account:')) photoCache.delete(key); },
    registerDiary(source) { ensureServerId(source.sharedDiaryId || source.id); return diaries.get(source.sharedDiaryId || source.id) || { ...source, members: [] }; },
    getSharing, refreshMembers, watchDiary, loadMoreEmailInvites, checkProfileNickname: checkNickname, checkNickname, updateProfile,
    hasMembership(id) { return diaries.get(invitations.get(id)?.diary.diaryId)?.members.some(m => m.id === self.id) === true; },
    async sendEmailInvite(id, email) {
      ensureServerId(id);
      const error = inviteEmailError(email);
      if (error) fail('INVALID_EMAIL', error);
      await request(`${path(id)}/invites/email`, { method: 'POST', body: { email: normalizeInviteEmail(email) } });
      return refreshChanged(id);
    },
    async cancelEmailInvite(id, inviteId) {
      ensureServerId(id);
      if (!validMemberId(inviteId)) fail('INVALID_INVITE', '취소할 초대를 확인해 주세요.');
      await request(`${path(id)}/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' });
      return refreshChanged(id);
    },
    async transferOwner(id, memberId) {
      ensureServerId(id);
      if (!validMemberId(memberId) || String(memberId) === self.id) fail('INVALID_MEMBER', '양도할 참여자를 확인해 주세요.');
      await request(`${path(id)}/transfer-owner`, { method: 'POST', body: { newOwnerUserId: String(memberId) } });
      const previous = diaries.get(id);
      if (previous) {
        diaries.set(id, withMemberRoles(previous, previous.members.map(member => ({ ...member,
          role: member.id === String(memberId) ? 'OWNER' : 'EDITOR', presence: member.id === String(memberId) ? '소유자' : '편집자' }))));
        publish();
      }
      return refreshChanged(id);
    },
    async createLink(id) { await request(`${path(id)}/invites`, { method: 'POST' }); return getSharing(id); },
    async resolveLink(value) {
      let url;
      try {
        const input = value.trim();
        // Local servers return /invite/{token} when no public invite base is configured.
        // Resolve only that explicit relative form; never interpret arbitrary text as a URL.
        if (input.startsWith('/')) {
          if (!/^\/invite\/[^/?#]+\/?(?:[?#].*)?$/.test(input)) throw new Error('Invalid relative invite');
          url = new URL(input, baseUrl);
          if (!/^\/invite\/[^/]+\/?$/.test(url.pathname)) throw new Error('Invalid invite path');
        } else url = new URL(input);
      } catch { fail('INVALID_LINK', '초대 링크를 확인해 주세요.'); }
      if (!['https:', 'http:', 'dio:'].includes(url.protocol)) fail('INVALID_LINK', '초대 링크를 확인해 주세요.');
      let token;
      try { token = decodeURIComponent(url.pathname.split('/').filter(Boolean).at(-1) || ''); }
      catch { fail('INVALID_LINK', '초대 링크를 확인해 주세요.'); }
      if (!token) fail('INVALID_LINK', '초대 링크를 확인해 주세요.');
      const row = await request(`/invites/${encodeURIComponent(token)}`);
      const result = { ...row, inviteId: token, token, canOpen: row.status === 'PENDING', memberCount: row.currentMembers, diary: { diaryId: row.diaryId, title: row.title } };
      invitations.set(token, result); return result;
    },
    async accept(id, nickname, { photoUri = self.photoUri, acknowledgeBlockedMembers = false } = {}) {
      await checkNickname(id, nickname);
      const row = invitations.get(id) || await invitation(id);
      const result = await request(`/invites/${encodeURIComponent(row.token)}/accept`, { method: 'POST',
        ...(acknowledgeBlockedMembers === true ? { body: { acknowledgeBlockedMembers: true } } : {}) });
      ensureServerId(result.diaryId);
      // 수락이 끝난 뒤 조회·프로필 저장에 실패해도 수락을 다시 보내지 않는다.
      try {
        await getSharing(result.diaryId);
        return await updateProfile(result.diaryId, { nickname, photoUri });
      } catch (error) {
        if (!active || auth.getSessionKey() !== sessionKey || error.code === 'DISPOSED') throw error;
        return { ...(diaries.get(result.diaryId) || { id: result.diaryId, title: row.diary?.title,
          members: [{ ...self, role: 'EDITOR' }] }),
          profileWarning: '참여했어요. 프로필은 공유 설정에서 다시 수정해 주세요.' };
      }
    },
    async decline(id) { await request(`/me/invites/${encodeURIComponent(id)}/decline`, { method: 'POST' }); },
    async removeMember(id, memberId) { await request(`${path(id)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }); return getSharing(id); },
    async leave(id) { await request(`${path(id)}/members/${self.id}`, { method: 'DELETE' }); diaries.delete(id); publish(); },
    async toggleFavorite(id) { const diary = diaries.get(id); await request(`${path(id)}/membership`, { method: 'PATCH', body: { favorite: !diary?.favorite } }); return getSharing(id); },
  };
}
