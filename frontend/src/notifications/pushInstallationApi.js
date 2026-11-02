/** 특정 로그인 세션에 묶인 푸시 설치 API. 기기 secret은 요청 헤더로만 전송한다. */
export function createPushInstallationApi({ auth, userId, fetchImpl = globalThis.fetch, allowDevelopmentHttp = false, timeoutMs = 20000 }) {
  const sessionKey = auth.getSessionKey();
  const { baseUrl, getAuthHeaders } = auth.getConnectionOptions();
  const base = new URL(baseUrl);
  if (base.username || base.password || base.search || base.hash || (base.protocol !== 'https:' && !(allowDevelopmentHttp && base.protocol === 'http:' && ['localhost','127.0.0.1','10.0.2.2'].includes(base.hostname)))) throw new Error('PUSH_HTTPS_REQUIRED');
  const check = () => { if (!sessionKey || auth.getSessionKey() !== sessionKey) throw new Error('PUSH_SESSION_CHANGED'); };
  async function request(path, { method = 'GET', body, secret, signal } = {}) {
    check(); const token = await auth.getAccessToken({ userId, sessionKey }); check();
    const url = `${baseUrl.replace(/\/+$/, '')}/push/installations${path}`;
    const headers = { Accept: 'application/json', ...getAuthHeaders(url, token) };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (secret) headers['X-DIO-Installation-Secret'] = secret;
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once:true });
    const timer = setTimeout(abort, timeoutMs);
    try {
      const response = await fetchImpl(url, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal:controller.signal });
      check(); const value = response.status === 204 ? null : await response.json().catch(() => null); check();
      if (!response.ok) { const error = new Error(value?.code || 'PUSH_REQUEST_FAILED'); error.status = response.status; throw error; }
      return value;
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
  const id = value => { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('PUSH_INVALID_ID'); return encodeURIComponent(value); };
  return {
    register: body => request('', { method:'POST', body }),
    get: installationId => request(`/${id(installationId)}`),
    inspect: (installationId, secret) => request(`/${id(installationId)}/binding`, { secret }),
    update: (installationId, secret, body) => request(`/${id(installationId)}`, { method:'PUT', secret, body }),
    bind: (installationId, secret, body) => request(`/${id(installationId)}/binding`, { method:'POST', secret, body }),
    unbind: (installationId, secret, body) => request(`/${id(installationId)}/binding`, { method:'DELETE', secret, body }),
  };
}

/** 서버가 전달한 식별자만 읽고 초대 상세 권한은 앱의 기존 조회에서 재검증한다. */
export function pushInvitationId(data) {
  return data?.type === 'DIARY_INVITE' && typeof data.inviteId === 'string' && /^[1-9][0-9]{0,18}$/.test(data.inviteId) ? data.inviteId : null;
}
