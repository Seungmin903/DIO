import { normalizeEmail, normalizeNickname } from './validation.js';

export function authBaseUrl(value) {
  const base = value.replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) return base;
  return base.endsWith('/api') ? `${base}/v1` : `${base}/api/v1`;
}

// Tokens stay in memory. Never save passwords or tokens in AsyncStorage.
export function createAuthApi({ baseUrl, fetchImpl = globalThis.fetch, buildPhotoBody, now = Date.now, accessTokenHeader = 'Authorization' }) {
  if (!['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader)) throw new Error('인증 헤더 설정을 확인해 주세요.');
  const base = authBaseUrl(baseUrl);
  let session = null, draft = null, verification = null, revision = 0, refreshing = null;
  let passwordReset = null, resetRevision = 0, resetVerifying = null;

  const userView = (user) => ({
    mode: 'authenticated', provider: 'email', userId: user.userId,
    email: user.email, nickname: user.nickname,
    photoUri: user.profilePhotoUrl ? new URL(user.profilePhotoUrl, base).href : null,
  });
  async function request(path, body, accessToken, multipart = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetchImpl(`${base}/auth/${path}`, {
        method: 'POST', signal: controller.signal,
        headers: { ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(accessToken ? { [accessTokenHeader]: accessTokenHeader === 'Authorization' ? `Bearer ${accessToken}` : accessToken } : {}) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error(data?.detail || '요청을 처리하지 못했어요. 다시 시도해 주세요.');
        error.status = response.status;
        error.code = data?.code;
        throw error;
      }
      return data;
    } catch (error) {
      if (error.status) throw error;
      throw new Error('서버에 연결하지 못했어요. 서버 주소와 네트워크를 확인해 주세요.');
    } finally { clearTimeout(timer); }
  }
  const api = {
    getAccessToken(expectedUserId) {
      return session && (expectedUserId === undefined || String(session.user.userId) === expectedUserId) ? session.accessToken : null;
    },
    cancelPending({ keepEnrollment = false } = {}) {
      revision++;
      resetRevision++; passwordReset = null; resetVerifying = null;

      if (!keepEnrollment) { draft = null; verification = null; }
    },
    async login({ email, password }) {
      const attempt = ++revision;
      const result = await request('login', { email: normalizeEmail(email), password });
      if (attempt !== revision) throw new Error('로그인 요청이 취소되었어요.');
      session = result;
      return userView(result.user);
    },
    async signup({ email, password }) {
      const attempt = ++revision;
      const normalized = normalizeEmail(email);
      const result = await request('email-availability', { email: normalized });
      if (attempt !== revision) throw new Error('가입 요청이 취소되었어요.');
      if (!result.available) throw new Error('이미 사용 중인 이메일이에요.');
      draft = { email: normalized, password };
      if (verification?.email !== normalized) verification = null;
      return { provider: 'email', email: normalized };
    },
    async checkNickname(nickname) {
      return (await request('nickname-availability', { nickname: normalizeNickname(nickname) })).available;
    },
    // Frontend can call these when its verification controls have been added.
    async sendVerification(email) {
      verification = null;
      return request('email-verifications', { email: normalizeEmail(email) });
    },
    async verifyEmail(email, code) {
      const normalized = normalizeEmail(email);
      const result = await request('email-verifications/verify', { email: normalized, code });
      verification = { email: normalized, token: result.signupToken, expiresAt: now() + result.expiresIn * 1000 };
      return { expiresIn: result.expiresIn };
    },
    // 비밀번호 찾기 화면이 추가되면 연결한다. 재설정 토큰은 메모리에만 보관한다.
    async requestPasswordReset(email) {
      if (passwordReset?.email === normalizeEmail(email) && passwordReset.expiresAt > now())
        throw new Error('이메일 인증이 이미 완료됐어요. 새 비밀번호를 입력해 주세요.');
      if (resetVerifying?.email === normalizeEmail(email))
        throw new Error('인증번호를 확인하고 있어요. 잠시만 기다려 주세요.');
      resetRevision++; passwordReset = null; resetVerifying = null;
      return request('password-reset-requests', { email: normalizeEmail(email) });
    },
    async verifyPasswordReset(email, code) {
      const normalized = normalizeEmail(email);
      if (passwordReset?.email === normalized && passwordReset.expiresAt > now())
        throw new Error('이메일 인증이 이미 완료됐어요. 새 비밀번호를 입력해 주세요.');
      if (resetVerifying?.email === normalized)
        throw new Error('인증번호를 확인하고 있어요. 잠시만 기다려 주세요.');
      const attempt = ++resetRevision, pending = { email: normalized };
      resetVerifying = pending;
      passwordReset = null;
      try {
        const result = await request('password-reset-verifications', { email: normalized, code });
        if (attempt !== resetRevision) throw new Error('비밀번호 재설정 요청이 취소되었어요.');
        passwordReset = { email: normalized, token: result.resetToken, expiresAt: now() + result.expiresIn * 1000 };
        return { expiresIn: result.expiresIn };
      } finally { if (resetVerifying === pending) resetVerifying = null; }
    },
    async completePasswordReset({ email, newPassword }) {
      const current = passwordReset;
      if (!current || current.email !== normalizeEmail(email) || current.expiresAt <= now())
        throw new Error('비밀번호 재설정 전에 이메일 인증을 완료해 주세요.');
      const resetAttempt = resetRevision, authAttempt = revision, previousSession = session;
      try {
        await request('password-resets', { email: current.email, resetToken: current.token, newPassword });
      } catch (error) {
        // 서버가 이 토큰을 거절한 경우만 정리한다. 새 흐름의 토큰이나 다른 오류는 건드리지 않는다.
        if (error.code === 'INVALID_PASSWORD_RESET' && passwordReset === current) passwordReset = null;
        throw error;
      }
      // 서버의 재설정은 완료됐어도, 이후 시작한 로그인·인증 흐름에는 영향을 주지 않는다.
      if (resetAttempt !== resetRevision || authAttempt !== revision ||
          previousSession !== session || passwordReset !== current)
        throw new Error('비밀번호는 재설정되었지만 화면 또는 로그인 상태가 변경되었어요.');
      session = null; api.cancelPending();
    },

    async completeProfile({ email, nickname, photoUri, terms }) {
      if (!draft || draft.email !== normalizeEmail(email) || !verification ||
          verification.email !== draft.email || verification.expiresAt <= now()) {
        throw new Error('회원가입 전에 이메일 인증이 필요해요. 현재 화면에는 인증 입력 단계가 아직 없어요.');
      }
      const body = {
        ...draft, signupToken: verification.token, nickname: normalizeNickname(nickname),
        agreements: ['service', 'privacy', 'marketing'].map((key) => ({
          termsType: key.toUpperCase(), termsVersion: 'v1', agreed: terms?.[key] === true,
        })),
      };
      let upload;
      try {
        if (photoUri) upload = await buildPhotoBody(body, photoUri);
        const user = await request('signup', upload?.body ?? body, undefined, !!upload);
        draft = null; verification = null;
        return { ...userView(user), mode: 'registered' };
      } finally { await upload?.dispose?.(); }
    },
    async social() { throw new Error('소셜 로그인 API는 아직 연결되지 않았어요.'); },
    async refresh() {
      if (refreshing) return refreshing;
      if (!session) throw new Error('다시 로그인해 주세요.');
      const previous = session, attempt = revision;
      const operation = (async () => {
        try {
          const result = await request('refresh', { refreshToken: previous.refreshToken });
          if (attempt !== revision || session !== previous) throw new Error('로그인 상태가 변경되었어요.');
          session = result;
          return userView(result.user);
        } catch (error) {
          if (session === previous) session = null;
          throw error;
        }
      })();
      refreshing = operation;
      try { return await operation; } finally { if (refreshing === operation) refreshing = null; }
    },
    async logout() {
      // Wait for an ongoing rotation before revoking its current session.
      if (refreshing) await refreshing.catch(() => {});
      let current = session;
      if (!current) { api.cancelPending(); return; }
      try {
        try { await request('logout', undefined, current.accessToken); }
        catch (error) {
          if (error.status !== 401) throw error;
          await api.refresh();
          current = session;
          await request('logout', undefined, current.accessToken);
        }
      } finally { session = null; api.cancelPending(); }
    },
  };
  return api;
}
