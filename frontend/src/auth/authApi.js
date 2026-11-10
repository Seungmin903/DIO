import { normalizeEmail, emailError, accountEmailError, normalizeNickname, nicknameError, passwordError } from './validation.js';
import { signupAgreements } from './signupPolicy.js';
import { developmentAuthorization } from './developmentAccess.js';
import { SESSION_EXPIRED_MESSAGE } from './sessionExpiry.js';

const authErrorMessages = new Map([
  ['INVALID_CREDENTIALS', '이메일 또는 비밀번호를 확인해 주세요.'],
  ['LOGIN_RATE_LIMITED', '로그인 시도가 너무 많아요. 15분 후 다시 시도해 주세요.'],
  ['EMAIL_ALREADY_REGISTERED', '이미 가입된 이메일이에요. 로그인해 주세요.'],
  ['INVALID_VERIFICATION_CODE', '인증번호가 유효하지 않아요. 다시 확인하거나 새로 요청해 주세요.'],
  ['VERIFICATION_ATTEMPTS_EXCEEDED', '인증 시도가 너무 많아요. 새 인증번호를 요청해 주세요.'],
  ['INVALID_SIGNUP_TOKEN', '가입 인증이 만료되었거나 유효하지 않아요. 이메일을 다시 인증해 주세요.'],
  ['AGE_CONFIRMATION_REQUIRED', '만 14세 이상인지 확인해 주세요.'],
  ['SIGNUP_CONFLICT', '이미 가입된 정보인지 확인하고 다시 시도해 주세요.'],
  ['INVALID_TERMS', '약관 정보를 다시 확인해 주세요.'],
  ['REQUIRED_TERMS_NOT_AGREED', '필수 약관에 동의해 주세요.'],
  ['INVALID_PASSWORD_RESET', '인증 정보가 유효하지 않아요. 새 인증번호를 요청해 주세요.'],
  ['CURRENT_PASSWORD_MISMATCH', '현재 비밀번호가 맞지 않아요.'],
  ['PASSWORD_UNCHANGED', '현재 비밀번호와 다른 비밀번호를 입력해 주세요.'],
  ['EMAIL_PASSWORD_REQUIRED', '이메일 로그인 계정만 비밀번호를 변경할 수 있어요.'],
  ['INVALID_SOCIAL_PROVIDER', '로그인 방식을 확인해 주세요.'],
  ['INVALID_SOCIAL_REQUEST', '로그인 방식을 다시 선택하고 시도해 주세요.'],
  ['INVALID_SOCIAL_CREDENTIAL', '소셜 인증을 다시 진행해 주세요.'],
  ['INVALID_EXISTING_CREDENTIALS', '기존 이메일 또는 비밀번호를 확인해 주세요.'],
  ['INVALID_SOCIAL_ENROLLMENT', '연령 확인과 가입 정보를 다시 확인해 주세요.'],
  ['SOCIAL_ACCOUNT_INACTIVE', '사용할 수 없는 계정이에요.'],
  ['SOCIAL_ACCOUNT_LINK_REQUIRED', '기존 계정 비밀번호를 확인해 소셜 로그인을 연결해 주세요.'],
  ['SOCIAL_EXISTING_PROVIDER_LOGIN_REQUIRED', '이 이메일로 가입할 때 사용한 로그인 방식으로 계속해 주세요.'],
  ['SOCIAL_SIGNUP_REQUIRED', '가입 정보를 입력해 주세요.'],
  ['SOCIAL_VERIFIED_EMAIL_REQUIRED', '소셜 계정에서 이메일을 인증한 뒤 다시 시도해 주세요.'],
  ['SOCIAL_IDENTITY_ALREADY_LINKED', '이미 다른 계정에 연결된 소셜 계정이에요.'],
  ['SOCIAL_PROVIDER_ALREADY_LINKED', '이미 연결된 로그인 방식이에요.'],
  ['SOCIAL_PROVIDER_NOT_LINKED', '연결된 로그인 방식이 아니에요.'],
  ['SOCIAL_PROVIDER_MISMATCH', '현재 계정에 연결된 소셜 계정으로 다시 시도해 주세요.'],
  ['SOCIAL_LINK_CONFLICT', '계정 연결 상태가 변경됐어요. 다시 확인해 주세요.'],
  ['SOCIAL_SIGNUP_CONFLICT', '가입 상태가 변경됐어요. 다시 로그인해 주세요.'],
  ['LAST_LOGIN_PROVIDER', '마지막 로그인 방식은 해제할 수 없어요.'],
  ['APPLE_REAUTH_REQUIRED', '탈퇴하려면 애플 계정으로 한 번 더 확인해 주세요.'],
  ['APPLE_ACCOUNT_MISMATCH', '현재 계정에 연결된 애플 계정으로 다시 시도해 주세요.'],
  ['INVALID_APPLE_AUTHORIZATION', '애플 계정 인증을 다시 진행해 주세요.'],
  ['PROFILE_PHOTO_TOO_LARGE', '프로필 사진은 5MB 이하로 선택해 주세요.'],
  ['INVALID_PROFILE_PHOTO', '정상적인 JPEG 또는 PNG 사진을 선택해 주세요. 최대 1600만 화소까지 지원해요.'],
]);

export function authBaseUrl(value) {
  const base = value.replace(/\/+$/, '');
  if (base.endsWith('/api/v1')) return base;
  return base.endsWith('/api') ? `${base}/v1` : `${base}/api/v1`;
}

// Access tokens and development-server Basic credentials stay in memory.
// Only the injected native secure store persists refresh credentials.
// Never save passwords or tokens in AsyncStorage.
export function createAuthApi({ baseUrl, fetchImpl = globalThis.fetch, buildPhotoBody, googleSignIn, googleRevoke, appleSignIn, now = Date.now, accessTokenHeader = 'Authorization', allowDevelopmentAccess = false, developmentAccessStore = null, presetDevelopmentAccess = null, sessionStore = null }) {
  if (!['Authorization', 'X-DIO-Access-Token'].includes(accessTokenHeader)) throw new Error('인증 헤더 설정을 확인해 주세요.');
  const base = authBaseUrl(baseUrl);
  const accessOrigin = new URL(base).origin;
  const accessStore = allowDevelopmentAccess && new URL(base).protocol === 'https:' ? developmentAccessStore : null;
  // 개발 실행에서 .env로 받은 개발 서버 접속 정보. iOS 개발 빌드는 Basic 401 응답이 앱까지 오지 않고
  // 요청이 멈춰 입력 화면이 뜰 수 없으므로, 처음부터 붙이고 로그아웃으로 지워져도 다음 요청 전에 다시 넣는다.
  let presetAccess = null;
  if (allowDevelopmentAccess && presetDevelopmentAccess?.username && presetDevelopmentAccess?.password) {
    try { presetAccess = developmentAuthorization(base, presetDevelopmentAccess.username, presetDevelopmentAccess.password); }
    catch (error) { console.warn('[auth] DEVELOPMENT_ACCESS_PRESET_IGNORED', error.message); }
  }
  let developmentAccess = presetAccess;
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
  const signupDraftRequired = () => Object.assign(new Error('가입 정보를 다시 확인해 주세요. 이메일·비밀번호 입력 화면에서 이어갈 수 있어요.'), { code: 'SIGNUP_DRAFT_REQUIRED' });
  const invalidSignupToken = () => Object.assign(new Error('가입 인증이 만료되었거나 유효하지 않아요. 입력한 내용은 유지돼요. 이메일 인증을 다시 진행해 주세요.'), { code: 'INVALID_SIGNUP_TOKEN' });
  const requireEmail = (value, existingAccount = false) => {
    const error = (existingAccount ? accountEmailError : emailError)(value);
    if (error) throw Object.assign(new Error(error), { code: 'INVALID_EMAIL', status: 400 });
    return normalizeEmail(value);
  };
  let signupPending = false;
  let socialDraft = null;
  // 지원 제공자와 네이티브 로그인 함수. 화면 문구는 SOCIAL_NAMES를 쓴다.
  const socialSignIns = { google: googleSignIn, apple: appleSignIn };
  const SOCIAL_NAMES = { google: '구글', apple: '애플' };
  let session = null, draft = null, verification = null, revision = 0, refreshing = null, accessRefreshAt = 0, sessionSequence = 0;
  let restoringSession = null, storageWrites = Promise.resolve();
  let expiredSessionKey = null;
  const expiryListeners = new Set();
  const store = (method, value) => {
    const operation = storageWrites.then(() => sessionStore?.[method]?.(base, value));
    storageWrites = operation.catch(() => {});
    return operation;
  };
  const clearStoredSession = () => store('clear');
  // LoginException.token() is the backend's explicit refresh rejection contract.
  const invalidRefreshToken = error => error?.status === 401 && error.code === 'INVALID_TOKEN';
  const clearStoredSessionSafely = async () => {
    try { await clearStoredSession(); return true; }
    catch { console.warn('[auth] SECURE_SESSION_CLEAR_FAILED'); return false; }
  };
  const incompleteLogout = () => Object.assign(new Error('로그아웃을 완료하지 못했어요. 다음 실행에서 로그인이 복원될 수 있어요. 연결 상태를 확인한 뒤 다시 로그인하여 로그아웃해 주세요.'),
    { code: 'LOGOUT_INCOMPLETE' });
  const endLocalSession = async () => {
    // Invalidate in-memory work before touching Keychain/Keystore. A local cleanup
    // failure must not turn a completed server action into an apparent failure.
    session = null;
    expiredSessionKey = null;
    accessRefreshAt = 0;
    api.cancelPending();
    return clearStoredSessionSafely();
  };
  const acceptSession = async (result, { keepSessionOnStorageFailure = false } = {}) => {
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
    session = { ...result, provider: result.provider || session?.provider || 'email' };
    accessRefreshAt = now() + lifetime - Math.min(30000, lifetime / 2);
    const accepted = session, acceptedRevision = revision;
    try {
      await store('save', { refreshToken: session.refreshToken, provider: session.provider, userId: String(session.user.userId) });
    } catch {
      if (keepSessionOnStorageFailure && session === accepted && revision === acceptedRevision) {
        // Rotation already succeeded. Keep its new tokens in memory so a
        // temporarily locked secure store does not interrupt the active user.
        console.warn('[auth] SECURE_SESSION_SAVE_FAILED');
      } else {
        if (session === accepted) {
          session = null;
          await clearStoredSession().catch(() => {});
        }
        throw Object.assign(new Error('로그인 정보를 안전하게 저장하지 못했어요. 다시 시도해 주세요.'), { code: 'SESSION_STORAGE_UNAVAILABLE' });
      }
    }
    if (session !== accepted) throw new Error('로그인 상태가 변경되었어요.');
    if (revision !== acceptedRevision) {
      session = null;
      await clearStoredSession();
      throw new Error('로그인 요청이 취소되었어요.');
    }
    expiredSessionKey = null;
  };
  const unauthorized = () => {
    const sessionExpired = !session && expiredSessionKey !== null;
    return Object.assign(new Error(sessionExpired ? SESSION_EXPIRED_MESSAGE : '다시 로그인해 주세요.'),
      { status: 401, code: 'AUTHENTICATION_REQUIRED', sessionExpired });
  };
  let passwordReset = null, resetRevision = 0, resetVerifying = null, verificationRevision = 0;

  const userView = (user) => ({
    mode: 'authenticated', provider: session?.provider || 'email', userId: user.userId,
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
  async function request(path, body, accessToken, multipart = false, method = 'POST', memberPath = false, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      if (restoringAccess) await restoringAccess;
      if (!developmentAccess && presetAccess) developmentAccess = presetAccess;
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
          // A rejected .env preset must not be re-injected before every request, or the manual entry flow never recovers.
          if (sentAccess && sentAccess === presetAccess) presetAccess = null;
          throw Object.assign(new Error('개발 서버 접근 인증이 필요해요. 서버 담당자에게 앱의 API 접근 방법을 확인해 주세요.'),
            { status: 401, code: 'DEVELOPMENT_ACCESS_REQUIRED' });
        }
        // The server's diagnostic detail can contain technical text and is never UI copy.
        const fallback = response.status === 429 ? '잠시 후 다시 요청해 주세요.' : '요청을 처리하지 못했어요. 다시 시도해 주세요.';
        const message = response.status >= 500 ? '서버에 문제가 있어요. 잠시 후 다시 시도해 주세요.'
          : authErrorMessages.get(data?.code) ?? fallback;
        const error = new Error(message);
        error.status = response.status;
        error.code = data?.code;
        const retryAfter = Number(response.headers?.get?.('Retry-After'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
        throw error;
      }
      return data;
    } catch (error) {
      if (error?.status) throw error;
      throw Object.assign(new Error('서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'), { code: 'NETWORK_ERROR' });
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
    subscribeSessionExpired(listener) {
      expiryListeners.add(listener);
      return () => expiryListeners.delete(listener);
    },
    getConnectionOptions() { return { baseUrl: base, accessTokenHeader, getAuthHeaders }; },
    getProfilePhotoSource(uri) {
      const target = new URL(uri, base), server = new URL(base);
      // Public photos need only the development gateway credential, never a member token.
      const profilePath = `${server.pathname}/auth/profile-photos/`;
      const validProfilePath = target.pathname.startsWith(profilePath) &&
        /^[0-9a-f-]+$/i.test(target.pathname.slice(profilePath.length)) && !target.search && !target.hash;
      // 서버가 :8443으로 접속한 요청에 포트 없는 절대 URL을 돌려주는 경우가 있다.
      // 같은 HTTPS 호스트의 검증된 프로필 경로만 현재 API origin으로 정규화해 Basic이
      // 정확히 같은 개발 게이트웨이로 향하도록 한다. 다른 호스트·경로에는 절대 보내지 않는다.
      // userinfo가 붙은 URL은 정규화하지도, Basic을 붙여 돌려주지도 않는다.
      const noUserinfo = !target.username && !target.password;
      const canonicalTarget = noUserinfo && target.protocol === server.protocol &&
        target.hostname === server.hostname && validProfilePath
        ? new URL(target.pathname, base) : target;
      return developmentAccess && noUserinfo && canonicalTarget.origin === server.origin && validProfilePath
        ? { uri: canonicalTarget.href, headers: getAuthHeaders(canonicalTarget.href) } : { uri };
    },
    getCurrentUserId() { return session ? String(session.user.userId) : null; },
    getSessionKey() { return session ? `${session.user.userId}:${sessionSequence}` : null; },
    // UI/store identity only, never an authorization credential. The completed
    // login generation survives expiry and changes on a successful new login.
    getMemberSessionKey(userId) { return userId == null ? null : `${userId}:${sessionSequence}`; },
    isSessionExpired(sessionKey) { return !session && sessionKey != null && sessionKey === expiredSessionKey; },
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

      if (!keepEnrollment) { verificationRevision++; draft = null; verification = null; socialDraft = null; }
    },
    async login({ email, password }) {
      const normalized = requireEmail(email, true);
      const attempt = ++revision;
      const result = await request('login', { email: normalized, password });
      if (attempt !== revision) throw new Error('로그인 요청이 취소되었어요.');
      if (typeof result?.user?.email !== 'string' || normalizeEmail(result.user.email) !== normalized) {
        throw Object.assign(new Error('로그인 응답의 계정을 확인하지 못했어요. 다시 로그인해 주세요.'),
          { status: 502, code: 'INVALID_AUTH_RESPONSE' });
      }
      await acceptSession({ ...result, provider: 'email' });
      sessionSequence++;
      return userView(result.user);
    },
    async signup({ email, password, ageConfirmed }) {
      if (ageConfirmed !== true) throw new Error('만 14세 이상인지 확인해 주세요.');
      const normalized = requireEmail(email);
      const attempt = ++revision;
      const result = await request('email-availability', { email: normalized });
      if (attempt !== revision) throw new Error('가입 요청이 취소되었어요.');
      if (typeof result?.available !== 'boolean') throw new Error('이메일 확인 정보를 받지 못했어요. 다시 시도해 주세요.');
      if (!result.available) throw new Error('이미 사용 중인 이메일이에요.');
      draft = { email: normalized, password, ageConfirmed };
      if (verification?.email !== normalized) verification = null;
      return { provider: 'email', email: normalized };
    },
    async checkEmailAvailability(email) {
      const attempt = revision;
      const result = await request('email-availability', { email: requireEmail(email) });
      if (attempt !== revision) throw new Error('이메일 확인 요청이 취소되었어요.');
      if (typeof result?.available !== 'boolean') throw new Error('이메일 확인 정보를 받지 못했어요. 다시 시도해 주세요.');
      if (!result.available) throw new Error('이미 사용 중인 이메일이에요.');
    },
    async sendVerification(email) {
      const normalized = requireEmail(email);
      const attempt = ++verificationRevision;
      verification = null;
      const result = await request('email-verifications', { email: normalized });
      if (attempt !== verificationRevision) throw new Error('인증번호 발송 요청이 취소되었어요.');
      if (!Number.isSafeInteger(result?.expiresIn) || result.expiresIn <= 0 ||
        !Number.isSafeInteger(result?.resendAfter) || result.resendAfter < 0) {
        throw new Error('인증번호 발송 정보를 확인하지 못했어요. 다시 시도해 주세요.');
      }
      return { expiresIn: result.expiresIn, retryAfter: result.resendAfter };
    },
    async verifyEmail(email, code) {
      const normalized = requireEmail(email);
      const attempt = ++verificationRevision;
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
      const normalized = requireEmail(email, true);
      if (passwordReset?.email === normalized && passwordReset.expiresAt > now())
        throw new Error('이메일 인증이 이미 완료됐어요. 새 비밀번호를 입력해 주세요.');
      if (resetVerifying?.email === normalized)
        throw new Error('인증번호를 확인하고 있어요. 잠시만 기다려 주세요.');
      resetRevision++; passwordReset = null; resetVerifying = null;
      return request('password-reset-requests', { email: normalized });
    },
    async verifyPasswordReset(email, code) {
      const normalized = requireEmail(email, true);
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
      // Only the active session identifies which account owns the saved token.
      // Otherwise retain it: the server revokes the reset account's sessions.
      if (previousSession && normalizeEmail(previousSession.user.email) === current.email) await endLocalSession();
      else api.cancelPending();
    },

    async completeProfile({ provider, email, nickname, photoUri, terms, ageConfirmed }) {
      if (SOCIAL_NAMES[provider]) {
        if(signupPending)throw new Error('회원가입을 처리하고 있어요. 잠시만 기다려 주세요.');
        const current=socialDraft, attempt=revision;
        if(!current || current.provider!==provider || current.email!==normalizeEmail(email))throw new Error(`${SOCIAL_NAMES[provider]} 인증을 다시 진행해 주세요.`);
        if(nicknameError(nickname))throw new Error(nicknameError(nickname));
        if(ageConfirmed!==true || terms?.service!==true || terms?.privacy!==true)throw new Error('연령 확인과 필수 약관 동의가 필요해요.');
        const body={idToken:current.idToken,enrollment:{nickname:normalizeNickname(nickname),ageConfirmed:true,agreements:signupAgreements(terms)}};
        let upload;signupPending=true;
        try{
          if(photoUri)upload=await buildPhotoBody(body,photoUri,'oauth');
          if(revision!==attempt||socialDraft!==current)throw new Error('가입 요청이 취소되었어요.');
          const result=await request(`oauth/${provider}`,upload?.body ?? body,undefined,!!upload);
          if(revision!==attempt||socialDraft!==current)throw new Error('가입 요청이 취소되었어요.');
          await acceptSession({...result,provider});sessionSequence++;socialDraft=null;
          return userView(result.user);
        }catch(error){if(socialDraft===current&&error?.code==='INVALID_SOCIAL_CREDENTIAL')socialDraft=null;throw error;}
        finally {try{await upload?.dispose?.();}catch{}signupPending=false;}
      }
      if (signupPending) throw new Error('회원가입을 처리하고 있어요. 잠시만 기다려 주세요.');
      if (!draft || draft.email !== normalizeEmail(email)) throw signupDraftRequired();
      if (!verification || verification.email !== draft.email || verification.expiresAt <= now()) {
        throw invalidSignupToken();
      }
      if (draft.ageConfirmed !== true) throw new Error('만 14세 이상인지 확인해 주세요.');
      if (nicknameError(nickname)) throw new Error(nicknameError(nickname));
      if (terms?.service !== true || terms?.privacy !== true) throw new Error('필수 약관에 동의해 주세요.');
      const currentDraft = draft, currentVerification = verification, attempt = revision;
      const isCurrent = () => attempt === revision && draft === currentDraft && verification === currentVerification;
      const body = {
        ...currentDraft, signupToken: currentVerification.token, nickname: normalizeNickname(nickname),
        agreements: signupAgreements(terms),
      };
      signupPending = true;
      let upload;
      try {
        if (photoUri) upload = await buildPhotoBody(body, photoUri);
        if (!isCurrent()) throw new Error('가입 요청이 취소되었어요.');
        if (currentVerification.expiresAt <= now()) throw invalidSignupToken();
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
        if (isCurrent() && error?.code === 'INVALID_SIGNUP_TOKEN') {
          verification = null;
          throw invalidSignupToken();
        }
        throw error;
      } finally {
        // Temporary photo cleanup must not turn a successful signup into a retry.
        try { await upload?.dispose?.(); } catch {}
        signupPending = false;
      }
    },
    async linkSocial(provider, email, password) {
      const current=socialDraft, attempt=revision;
      if(!SOCIAL_NAMES[provider]||!current||current.provider!==provider||current.email!==normalizeEmail(email))
        throw new Error(`${SOCIAL_NAMES[provider] || '소셜'} 인증을 다시 진행해 주세요.`);
      if(!password)throw new Error('기존 계정 비밀번호를 입력해 주세요.');
      const result=await request(`oauth/${provider}/link`,{idToken:current.idToken,email:current.email,password});
      if(attempt!==revision||socialDraft!==current)throw new Error('계정 연결 요청이 취소되었어요.');
      await acceptSession({...result,provider});sessionSequence++;socialDraft=null;
      return userView(result.user);
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
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
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
      await endLocalSession();
    },
    async withdraw(user) {
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      if (refreshing) await refreshing;
      if (!session || String(user?.userId) !== String(session.user.userId)) throw unauthorized();
      let current = session;
      let withdrawn = false;
      let body;
      const remove = async () => {
        try { await request('me', body, current.accessToken, false, 'DELETE', true); }
        catch (error) {
          if (error.status !== 401 || error.code === 'DEVELOPMENT_ACCESS_REQUIRED') throw error;
          if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
          await api.refresh();
          current = session;
          await request('me', body, current.accessToken, false, 'DELETE', true);
        }
      };
      try {
        try { await remove(); }
        catch (error) {
          // 애플 회원은 Apple 토큰 철회를 위해 애플 로그인을 한 번 더 받아 authorizationCode를 보낸다.
          if (error.code !== 'APPLE_REAUTH_REQUIRED' || typeof socialSignIns.apple !== 'function') throw error;
          const credential = await socialSignIns.apple();
          if (!credential?.authorizationCode) throw new Error('애플 확인 정보를 받지 못했어요. 다시 시도해 주세요.');
          if (session !== current) throw new Error('로그인 상태가 변경되었어요.');
          body = { appleAuthorizationCode: credential.authorizationCode };
          await remove();
        }
        withdrawn = true;
      } finally {
        if (withdrawn && session === current) {
          await endLocalSession();
          // 구글로 로그인한 회원은 DIO 탈퇴가 끝난 뒤 구글 쪽 앱 연결도 끊는다(구글 계정 설정 > 연결된 앱에서 DIO 제거).
          // 탈퇴는 이미 끝났으므로 기다리지 않고, 실패해도 경고만 남긴다.
          if (current.provider === 'google' && typeof googleRevoke === 'function')
            Promise.resolve().then(googleRevoke).catch(error => console.warn('[auth] GOOGLE_REVOKE_FAILED', error?.code ?? ''));
        }
      }
    },
    // 앱 잠금 4자리를 잊었을 때(지라 799): 지금 로그인한 계정의 주인인지 다시 확인한다. 지금 세션 · 기기 정보는 그대로 둔다.
    // 이메일 가입은 계정 비밀번호, 구글 · 애플 가입은 그 로그인을 한 번 더 받는다. 확인용으로 서버가 새로 연 세션은 쓰지 않고 바로 끊는다(로그아웃은 그 세션만 끊는다).
    // 다른 계정(다른 구글 계정 · 가입 안 된 계정)이면 그 세션을 받지 않고 거절한다 — 계정이 바뀌지 않는다.
    async verifyAccount({ password } = {}) {
      const current = session;
      if (!current) throw unauthorized();
      const provider = current.provider || 'email';
      const mismatch = () => Object.assign(new Error('지금 로그인한 계정으로 확인해 주세요.'), { code: 'ACCOUNT_MISMATCH' });
      let result;
      if (provider === 'email') {
        if (typeof password !== 'string' || !password) throw Object.assign(new Error('비밀번호를 입력해 주세요.'), { code: 'PASSWORD_REQUIRED' });
        result = await request('login', { email: normalizeEmail(current.user.email), password });
      } else {
        const name = SOCIAL_NAMES[provider], signIn = socialSignIns[provider];
        if (!name || typeof signIn !== 'function') throw Object.assign(new Error('이 로그인 방식으로는 확인할 수 없어요.'), { code: 'REAUTH_UNAVAILABLE' });
        const credential = await signIn();
        if (!credential?.idToken) throw new Error(`${name} 인증 정보를 받지 못했어요.`);
        try { result = await request(`oauth/${provider}`, { idToken: credential.idToken }); }
        catch (error) {
          if (error?.code === 'SOCIAL_SIGNUP_REQUIRED' || error?.code === 'SOCIAL_ACCOUNT_LINK_REQUIRED') throw mismatch();
          throw error;
        }
      }
      if (typeof result?.accessToken === 'string' && result.accessToken) request('logout', undefined, result.accessToken).catch(() => {});
      if (result?.user?.userId == null || String(result.user.userId) !== String(current.user.userId)) throw mismatch();
      return true;
    },
    async social(provider) {
      const name=SOCIAL_NAMES[provider], signIn=socialSignIns[provider];
      if(!name)throw new Error('아직 준비 중인 로그인 방식이에요.');
      if(typeof signIn!=='function')throw new Error(`${name} 로그인 기능이 연결되지 않았어요.`);
      const attempt=++revision;socialDraft=null;
      const credential=await signIn();
      if(attempt!==revision)throw new Error('로그인 요청이 취소되었어요.');
      if(!credential?.idToken)throw new Error(`${name} 인증 정보를 받지 못했어요.`);
      try{
        const result=await request(`oauth/${provider}`,{idToken:credential.idToken});
        if(attempt!==revision)throw new Error('로그인 요청이 취소되었어요.');
        await acceptSession({...result,provider});sessionSequence++;
        return userView(result.user);
      }catch(error){
        if(attempt!==revision)throw new Error('로그인 요청이 취소되었어요.');
        if(error?.code!=='SOCIAL_SIGNUP_REQUIRED'&&error?.code!=='SOCIAL_ACCOUNT_LINK_REQUIRED')throw error;
        // 신규 가입은 서버가 확인된 이메일을 요구한다. 이메일을 못 받았으면 다시 로그인하게 한다.
        if(!credential.email)throw Object.assign(new Error(`${name} 계정의 이메일을 받지 못했어요. 이메일 공유를 허용하고 다시 시도해 주세요.`),{code:'SOCIAL_EMAIL_REQUIRED'});
        socialDraft={provider,idToken:credential.idToken,email:normalizeEmail(credential.email)};
        return {provider,email:socialDraft.email,mode:error.code==='SOCIAL_ACCOUNT_LINK_REQUIRED'?'social-link':'social-signup'};
      }
    },
    async refresh() {
      if (refreshing) return refreshing;
      if (!session) throw unauthorized();
      const previous = session, attempt = revision;
      const operation = (async () => {
        try {
          const result = await request('refresh', { refreshToken: previous.refreshToken });
          if (attempt !== revision || session !== previous) throw new Error('로그인 상태가 변경되었어요.');
          await acceptSession(result, { keepSessionOnStorageFailure: true });
          return userView(result.user);
        } catch (error) {
          if (session === previous && attempt === revision && invalidRefreshToken(error)) {
            const expired = { userId: String(previous.user.userId), sessionKey: api.getSessionKey() };
            expiredSessionKey = expired.sessionKey;
            session = null;
            accessRefreshAt = 0;
            // Notify once, before asynchronous cleanup. A later login must never
            // be redirected by an older refresh response or a slow secure store.
            for (const listener of expiryListeners) {
              try { listener(expired); } catch { console.warn('[auth] SESSION_EXPIRY_LISTENER_FAILED'); }
            }
            await clearStoredSessionSafely();
            error.message = SESSION_EXPIRED_MESSAGE;
            error.sessionExpired = true;
          }
          throw error;
        }
      })();
      refreshing = operation;
      try { return await operation; } finally { if (refreshing === operation) refreshing = null; }
    },
    // Restore through the existing rotating refresh endpoint, without a stored access token.
    async restoreSession() {
      if (session) return userView(session.user);
      if (restoringSession) return restoringSession;
      const attempt = revision;
      const operation = (async () => {
        const saved = await sessionStore?.load(base);
        if (!saved || attempt !== revision) return null;
        try {
          const result = await request('refresh', { refreshToken: saved.refreshToken });
          if (attempt !== revision || session) return null;
          if (String(result?.user?.userId) !== saved.userId) { await clearStoredSessionSafely(); throw unauthorized(); }
          await acceptSession({ ...result, provider: saved.provider });
          sessionSequence++;
          return userView(session.user);
        } catch (error) {
          if (attempt === revision && invalidRefreshToken(error)) {
            await clearStoredSessionSafely();
            error.message = SESSION_EXPIRED_MESSAGE;
            error.sessionExpired = true;
          }
          throw error;
        }
      })();
      restoringSession = operation;
      try { return await operation; } finally { if (restoringSession === operation) restoringSession = null; }
    },
    async logout() {
      if (restoringSession) revision++;
      // Wait for an ongoing rotation before revoking its current session.
      if (refreshing) await refreshing.catch(() => {});
      let current = session;
      const endingRevision = revision;
      let serverRevoked = false;
      if (!current) {
        clearDevelopmentAccess();
        if (!await endLocalSession()) throw incompleteLogout();
        return;
      }
      try {
        try { await request('logout', undefined, current.accessToken); }
        catch (error) {
          if (error.status !== 401) throw error;
          await api.refresh();
          current = session;
          await request('logout', undefined, current.accessToken);
        }
        serverRevoked = true;
      } finally {
        if (session === current || (!session && revision === endingRevision)) {
          clearDevelopmentAccess();
          const cleared = await endLocalSession();
          // Only report incomplete logout when neither server revocation nor
          // deletion of the saved credential could be confirmed.
          if (!cleared && !serverRevoked) throw incompleteLogout();
        }
      }
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
        return Promise.reject(invalidSignupToken());
      }
      return api.signup(values);
    },
  };
  return api;
}
