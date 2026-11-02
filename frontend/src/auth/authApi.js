import { normalizeEmail, normalizeNickname, nicknameError, passwordError } from './validation.js';
import { developmentAuthorization } from './developmentAccess.js';

export function authBaseUrl(value) {
  const base = value.replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) return base;
  return base.endsWith('/api') ? `${base}/v1` : `${base}/api/v1`;
}

// Tokens and the optional development-server Basic header stay in memory.
// Never save passwords or tokens in AsyncStorage.
export function createAuthApi({ baseUrl, fetchImpl = globalThis.fetch, buildPhotoBody, now = Date.now, accessTokenHeader = 'Authorization', allowDevelopmentAccess = false, developmentAccessStore = null }) {
  if (!['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader)) throw new Error('인증 헤더 설정을 확인해 주세요.');
  const base = authBaseUrl(baseUrl);
  const accessOrigin = new URL(base).origin;
  const accessStore = allowDevelopmentAccess && new URL(base).protocol === 'https:' ? developmentAccessStore : null;
  let developmentAccess = null;
  let restoringAccess = accessStore ? Promise.resolve().then(() => accessStore.load(accessOrigin))
    .then(value => { if (!developmentAccess && value) developmentAccess = value; })
    .catch(() => {}).finally(() => { restoringAccess = null; }) : null;
  const clearDevelopmentAccess = () => {
    developmentAccess = null;
    if (typeof accessStore?.clearAll === 'function') accessStore.clearAll().catch(() => {});
    else accessStore?.clear(accessOrigin).catch(() => {});
  };
  const forgetAccess = rejected => {
    if (!rejected || developmentAccess !== rejected) return;
    developmentAccess = null;
    accessStore?.clear(accessOrigin).catch(() => {});
  };
  let signupPending = false;
  let session = null, draft = null, verification = null, revision = 0, refreshing = null, accessRefreshAt = 0, sessionSequence = 0;
  const acceptSession = result => {
    const text = value => typeof value === 'string' && value.trim().length > 0;
    const identifier = value => value != null && String(value).trim().length > 0;
    let validPhoto = result?.user?.profilePhotoUrl == null;
    if (text(result?.user?.profilePhotoUrl)) {
      try { validPhoto = ['https:', 'http:'].includes(new URL(result.user.profilePhotoUrl, base).protocol); } catch {}
    }
    if (!Number.isSafeInteger(result?.expiresIn) || result.expiresIn <= 0 || result.expiresIn > 86400 ||
        !text(result.accessToken) || !text(result.refreshToken) ||
        !identifier(result.user?.userId) || !text(result.user?.email) || !text(result.user?.nickname) || !validPhoto) {
      session = null; accessRefreshAt = 0;
      throw Object.assign(new Error('로그인 응답을 확인하지 못했어요. 다시 로그인해 주세요.'), { status: 502, code: 'INVALID_AUTH_RESPONSE' });
    }
    const lifetime = result.expiresIn * 1000;
    session = result;
    accessRefreshAt = now() + lifetime - Math.min(30000, lifetime / 2);
  };
  const unauthorized = () => Object.assign(new Error('다시 로그인해 주세요.'), { status: 401, code: 'AUTHENTICATION_REQUIRED' });
  let passwordReset = null, resetRevision = 0, resetVerifying = null, verificationRevision = 0;

  const userView = (user) => ({
    mode: 'authenticated', provider: 'email', userId: user.userId,
    email: user.email, nickname: user.nickname,
    photoUri: user.profilePhotoUrl ? new URL(user.profilePhotoUrl, base).href : null,
  });
  // Read credentials at request time; never put them in a user/session view.
  const getAuthHeaders = (url, accessToken) => {
    const target = new URL(url), server = new URL(base);
    if (target.username || target.password || target.origin !== server.origin || !target.pathname.startsWith(`${server.pathname}/`)) {
      throw new Error('인증 정보를 다른 서버로 보낼 수 없어요.');
    }
    return {
      ...(developmentAccess ? { Authorization: developmentAccess } : {}),
      ...(accessToken ? { [developmentAccess ? 'X-DIO-Access-Token' : accessTokenHeader]:
        !developmentAccess && accessTokenHeader === 'Authorization' ? `Bearer ${accessToken}` : accessToken } : {}),
    };
  };
  async function request(path, body, accessToken, multipart = false, method = 'POST', memberPath = false) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      if (restoringAccess) await restoringAccess;
      const sentAccess = developmentAccess;
      const response = await fetchImpl(`${base}/${memberPath ? path : `auth/${path}`}`, {
        method, signal: controller.signal,
        headers: { ...(!multipart && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...getAuthHeaders(`${base}/${memberPath ? path : `auth/${path}`}`, accessToken) },
        ...(body === undefined ? {} : { body: multipart ? body : JSON.stringify(body) }),
      });
      const data = response.status === 204 ? null : await response.json().catch(() => null);
      if (!response.ok) {
        const challenge = response.headers?.get?.('WWW-Authenticate');
        if (response.status === 401 && /^Basic(?:\s|$)/i.test(challenge ?? '')) {
          // A saved or entered credential the server rejected is dropped so the app asks again.
          forgetAccess(sentAccess);
          throw Object.assign(new Error('개발 서버 접근 인증이 필요해요. 서버 담당자에게 앱의 API 접근 방법을 확인해 주세요.'),
            { status: 401, code: 'DEVELOPMENT_ACCESS_REQUIRED' });
        }
        const error = new Error(data?.detail || '요청을 처리하지 못했어요. 다시 시도해 주세요.');
        error.status = response.status;
        error.code = data?.code;
        const retryAfter = Number(response.headers?.get?.('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.status) throw error;
      throw new Error('서버에 연결하지 못했어요. 서버 주소와 네트워크를 확인해 주세요.');
    } finally { clearTimeout(timer); }
  }
  // GET/PATCH /me: one token refresh on 401, then accept only this session's account.
  async function memberProfile(current, method, body, invalidMessage, multipart = false) {
    let result;
    try {
      result = await request('me', body, current.accessToken, multipart, method, true);
    } catch (error) {
      if (error.status !== 401 || error.code === 'DEVELOPMENT_ACCESS_REQUIRED') throw error;
      if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
      await api.refresh();
      current = session;
      result = await request('me', body, current.accessToken, multipart, method, true);
    }
    if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
    const profile = result?.user || result;
    const text = value => typeof value === 'string' && value.trim().length > 0;
    const identifier = value => value != null && String(value).trim().length > 0;
    let validPhoto = profile?.profilePhotoUrl == null;
    if (text(profile?.profilePhotoUrl)) {
      try { validPhoto = ['https:', 'http:'].includes(new URL(profile.profilePhotoUrl, base).protocol); } catch {}
    }
    if (!identifier(profile?.userId) || String(profile.userId) !== String(current.user.userId) ||
        !text(profile?.email) || normalizeEmail(profile.email) !== normalizeEmail(current.user.email) ||
        !text(profile?.nickname) || !validPhoto) {
      throw Object.assign(new Error(invalidMessage), { status: 502, code: 'INVALID_PROFILE_RESPONSE' });
    }
    const { userId, email, nickname, profilePhotoUrl = null } = profile;
    session = { ...current, user: { ...current.user, userId, email, nickname, profilePhotoUrl } };
    return userView(session.user);
  }
  const api = {
    getConnectionOptions() { return { baseUrl: base, accessTokenHeader, getAuthHeaders }; },
    getProfilePhotoSource(uri) {
      const target = new URL(uri, base), server = new URL(base);
      // Public photos need only the development gateway credential, never a member token.
      const profilePath = `${server.pathname}/auth/profile-photos/`;
      return developmentAccess && !target.username && !target.password && target.origin === server.origin && target.pathname.startsWith(profilePath) &&
        /^[0-9a-f-]+$/i.test(target.pathname.slice(profilePath.length)) && !target.search && !target.hash
        ? { uri: target.href, headers: getAuthHeaders(target.href) } : { uri };
    },
    getSessionKey() { return session ? `${session.user.userId}:${sessionSequence}` : null; },
    // Optional collaboration bridge: dev Basic only reaches this API's origin.
    getCollaborationHeaders({ url, userId, sessionKey }) {
      if (!session || String(session.user.userId) !== String(userId) || api.getSessionKey() !== sessionKey) throw unauthorized();
      const target=new URL(url), origin=new URL(base);
      const protocol=target.protocol==='wss:'?'https:':target.protocol==='ws:'?'http:':target.protocol;
      if(target.username || target.password || protocol!==origin.protocol || target.host!==origin.host ||
        !(target.pathname.startsWith(`${origin.pathname}/pages/`) || (target.pathname.startsWith(`${origin.pathname}/diaries/`)&&/^\/diaries\/[0-9a-f-]{36}\/pages(?:\/order)?$/i.test(target.pathname.slice(origin.pathname.length))) || target.pathname.startsWith('/ws/diaries/'))) throw unauthorized();
      return developmentAccess ? { Authorization:developmentAccess } : {};
    },
    async getAccessToken({ userId, sessionKey, forceRefresh = false } = {}) {
      const matches = () => session && String(session.user.userId) === String(userId) && sessionKey === api.getSessionKey();
      if (!matches()) throw unauthorized();
      if (refreshing) { try { await refreshing; forceRefresh = false; } catch (error) { if (!matches()) throw unauthorized(); throw error; } }
      if (!matches()) throw unauthorized();
      if (forceRefresh || now() >= accessRefreshAt) {
        try { await api.refresh(); } catch (error) { if (!matches()) throw unauthorized(); throw error; }
      }
      if (!matches()) throw unauthorized();
      return session.accessToken;
    },
    cancelPending({ keepEnrollment = false } = {}) {
      revision++;
      resetRevision++; passwordReset = null; resetVerifying = null;

      if (!keepEnrollment) { verificationRevision++; draft = null; verification = null; }
    },
    async login({ email, password }) {
      const attempt = ++revision;
      const normalized = normalizeEmail(email);
      const result = await request('login', { email: normalized, password });
      if (attempt !== revision) throw new Error('로그인 요청이 취소되었어요.');
      if (typeof result?.user?.email !== 'string' || normalizeEmail(result.user.email) !== normalized) {
        throw Object.assign(new Error('로그인 응답의 계정을 확인하지 못했어요. 다시 로그인해 주세요.'),
          { status: 502, code: 'INVALID_AUTH_RESPONSE' });
      }
      acceptSession(result);
      sessionSequence++;
      return userView(result.user);
    },
    async signup({ email, password }) {
      const attempt = ++revision;
      const normalized = normalizeEmail(email);
      const result = await request('email-availability', { email: normalized });
      if (attempt !== revision) throw new Error('가입 요청이 취소되었어요.');
      if (typeof result?.available !== 'boolean') throw new Error('이메일 확인 정보를 받지 못했어요. 다시 시도해 주세요.');
      if (!result.available) throw new Error('이미 사용 중인 이메일이에요.');
      draft = { email: normalized, password };
      if (verification?.email !== normalized) verification = null;
      return { provider: 'email', email: normalized };
    },
    async checkEmailAvailability(email) {
      const attempt = revision;
      const result = await request('email-availability', { email: normalizeEmail(email) });
      if (attempt !== revision) throw new Error('이메일 확인 요청이 취소되었어요.');
      if (typeof result?.available !== 'boolean') throw new Error('이메일 확인 정보를 받지 못했어요. 다시 시도해 주세요.');
      if (!result.available) throw new Error('이미 사용 중인 이메일이에요.');
    },
    async sendVerification(email) {
      const attempt = ++verificationRevision;
      verification = null;
      const result = await request('email-verifications', { email: normalizeEmail(email) });
      if (attempt !== verificationRevision) throw new Error('인증번호 발송 요청이 취소되었어요.');
      if (!Number.isSafeInteger(result?.expiresIn) || result.expiresIn <= 0 ||
        !Number.isSafeInteger(result?.resendAfter) || result.resendAfter < 0) {
        throw new Error('인증번호 발송 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      return { expiresIn: result.expiresIn, retryAfter: result.resendAfter };
    },
    async verifyEmail(email, code) {
      const attempt = ++verificationRevision;
      const normalized = normalizeEmail(email);
      verification = null;
      const result = await request('email-verifications/verify', { email: normalized, code });
      if (attempt !== verificationRevision) throw new Error('인증번호 확인 요청이 취소되었어요.');
      if (typeof result?.signupToken !== 'string' || !result.signupToken.trim() ||
        !Number.isSafeInteger(result?.expiresIn) || result.expiresIn <= 0 ||
        !Number.isSafeInteger(now() + result.expiresIn * 1000)) {
        throw new Error('이메일 인증 결과를 확인하지 못했어요. 다시 인증해 주세요.');
      }
      verification = { email: normalized, token: result.signupToken, expiresAt: now() + result.expiresIn * 1000 };
      return { expiresIn: result.expiresIn };
    },
    // 재설정 토큰은 메모리에만 보관한다. 비밀번호 재설정 화면에서만 이어서 사용한다.
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
      if (signupPending) throw new Error('회원가입을 처리하고 있어요. 잠시만 기다려 주세요.');
      if (!draft || draft.email !== normalizeEmail(email) || !verification ||
          verification.email !== draft.email || verification.expiresAt <= now()) {
        throw new Error('이메일 인증이 필요해요. 이전 화면으로 돌아가 다시 인증해 주세요.');
      }
      if (nicknameError(nickname)) throw new Error(nicknameError(nickname));
      if (terms?.service !== true || terms?.privacy !== true) throw new Error('필수 약관에 동의해 주세요.');
      const currentDraft = draft, currentVerification = verification, attempt = revision;
      const isCurrent = () => attempt === revision && draft === currentDraft && verification === currentVerification;
      const body = {
        ...currentDraft, signupToken: currentVerification.token, nickname: normalizeNickname(nickname),
        agreements: ['service', 'privacy', 'marketing'].map((key) => ({
          termsType: key.toUpperCase(), termsVersion: 'v1', agreed: terms?.[key] === true,
        })),
      };
      signupPending = true;
      let upload;
      try {
        if (photoUri) upload = await buildPhotoBody(body, photoUri);
        if (!isCurrent()) throw new Error('가입 요청이 취소되었어요.');
        if (currentVerification.expiresAt <= now()) throw new Error('이메일 인증이 만료됐어요. 이전 화면에서 다시 인증해 주세요.');
        const user = await request('signup', upload?.body ?? body, undefined, !!upload);
        if (!isCurrent()) throw new Error('가입 요청 이후 화면이 변경되었어요. 가입 여부는 로그인 화면에서 확인해 주세요.');
        if (typeof user?.userId !== 'string' || !user.userId.trim() ||
            typeof user.email !== 'string' || normalizeEmail(user.email) !== body.email ||
            user.nickname !== body.nickname ||
            (user.profilePhotoUrl != null && (typeof user.profilePhotoUrl !== 'string' || !user.profilePhotoUrl.trim()))) {
          throw new Error('가입 결과를 확인하지 못했어요. 로그인 화면에서 가입 여부를 확인해 주세요.');
        }
        const result = { ...userView(user), mode: 'registered' };
        draft = null; verification = null;
        return result;
      } catch (error) {
        if (isCurrent() && error?.code === 'INVALID_SIGNUP_TOKEN') verification = null;
        throw error;
      } finally {
        // Temporary photo cleanup must not turn a successful signup into a retry.
        try { await upload?.dispose?.(); } catch {}
        signupPending = false;
      }
    },
    async updateProfile(user, { nickname, photoUri }) {
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      const nextNickname = normalizeNickname(nickname);
      if (nicknameError(nextNickname)) throw new Error(nicknameError(nextNickname));
      if (refreshing) await refreshing;
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      let current = session;
      const currentPhotoUri = current.user.profilePhotoUrl ? new URL(current.user.profilePhotoUrl, base).href : null;
      const nextPhotoUri = photoUri || null;
      if (nextPhotoUri !== currentPhotoUri) {
        if (!nextPhotoUri) {
          return memberProfile(current, 'PATCH', { nickname: nextNickname, removeProfilePhoto: true },
            '회원정보 저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');
        }
        if (typeof buildPhotoBody !== 'function') throw new Error('프로필 사진 기능을 준비하지 못했어요. 앱을 다시 시작해 주세요.');
        let upload;
        try {
          upload = await buildPhotoBody({ nickname: nextNickname, removeProfilePhoto: false }, nextPhotoUri, 'profile');
          if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
          return await memberProfile(current, 'PATCH', upload.body,
            '회원정보 저장 결과를 확인하지 못했어요. 다시 시도해 주세요.', true);
        } finally {
          try { await upload?.dispose?.(); } catch {}
        }
      }
      return memberProfile(current, 'PATCH', { nickname: nextNickname }, '회원정보 저장 결과를 확인하지 못했어요. 다시 시도해 주세요.');
    },
    // Server profile wins over the login snapshot, e.g. after a nickname change on another device.
    async getProfile(user) {
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      if (refreshing) await refreshing;
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      return memberProfile(session, 'GET', undefined, '회원정보를 확인하지 못했어요. 다시 시도해 주세요.');
    },
    async changePassword(user, { currentPassword, password, confirmation }) {
      if (!session || String(user?.userId) !== String(session.user.userId)) throw new Error('다시 로그인해 주세요.');
      if (!currentPassword || passwordError(password) || password !== confirmation || currentPassword === password)
        throw new Error('현재 비밀번호와 새 비밀번호·확인 입력을 확인해 주세요.');
      if (refreshing) await refreshing;
      if (!session || String(user?.userId) !== String(session.user.userId)) throw new Error('로그인 상태가 변경되었어요.');
      let current = session;
      try { await request('me/password', { currentPassword, newPassword: password }, current.accessToken, false, 'PATCH', true); }
      catch (error) {
        if (error.status !== 401 || error.code === 'DEVELOPMENT_ACCESS_REQUIRED') throw error;
        if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
        await api.refresh(); current = session;
        await request('me/password', { currentPassword, newPassword: password }, current.accessToken, false, 'PATCH', true);
      }
      if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
      session = null; api.cancelPending();
    },
    async withdraw(user) {
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      if (refreshing) await refreshing;
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      let current = session;
      let withdrawn = false;
      try {
        try { await request('me', undefined, current.accessToken, false, 'DELETE', true); }
        catch (error) {
          if (error.status !== 401 || error.code === 'DEVELOPMENT_ACCESS_REQUIRED') throw error;
          if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
          await api.refresh();
          current = session;
          await request('me', undefined, current.accessToken, false, 'DELETE', true);
        }
        withdrawn = true;
      } finally {
        if (withdrawn && session === current) { session = null; api.cancelPending(); }
      }
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
          acceptSession(result);
          return userView(result.user);
        } catch (error) {
          if (session === previous && [401, 403].includes(error.status)) session = null;
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
      if (!current) { clearDevelopmentAccess(); api.cancelPending(); return; }
      try {
        try { await request('logout', undefined, current.accessToken); }
        catch (error) {
          if (error.status !== 401) throw error;
          await api.refresh();
          current = session;
          await request('logout', undefined, current.accessToken);
        }
      } finally { session = null; clearDevelopmentAccess(); api.cancelPending(); }
    },
  };
  api.verificationService = {
    ...(allowDevelopmentAccess ? { setDevelopmentAccess(username, password) {
      developmentAccess = developmentAuthorization(base, username, password);
      accessStore?.save(accessOrigin, developmentAccess).catch(() => {});
    } } : {}),
    async send(email) {
      await api.checkEmailAvailability(email);
      return api.sendVerification(email);
    },
    verify: (email, code) => api.verifyEmail(email, code),
    prepareSignup: values => {
      if (!verification || verification.email !== normalizeEmail(values.email) || verification.expiresAt <= now()) {
        return Promise.reject(new Error('이메일 인증이 만료됐어요. 이전 화면에서 다시 인증해 주세요.'));
      }
      return api.signup(values);
    },
  };
  return api;
}
