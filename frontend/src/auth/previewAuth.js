import {
  credentialsErrors,
  normalizeEmail,
  normalizeNickname,
  nicknameError,
  passwordError,
} from './validation.js';
const PROVIDERS = ['kakao', 'google', 'apple'];
const fail = (message) => {
  throw new Error(message);
};

// API 연결 전 메모리 계정. 비밀번호와 프로필은 서버·디스크에 저장하지 않는다.
export function createPreviewAuth({
  wait = () => new Promise((resolve) => setTimeout(resolve, 350)),
} = {}) {
  const accounts = new Map(),
    profiles = new Map(),
    reserved = new Set(['관리자', 'dio']);
  let pending = null,
    sequence = 0;
  const result = (account) => ({
    mode: 'preview',
    accountId: account.id,
    provider: account.provider,
    nickname: account.nickname,
    ...(account.email && { email: account.email }),
    ...(account.photoUri && { photoUri: account.photoUri }),
  });
  const current = (user) => {
    const account = profiles.get(user?.accountId);
    if (!account || account.provider !== user.provider)
      fail('로그인 상태를 확인해 주세요. 다시 로그인해 주세요.');
    return account;
  };
  const validateName = (value, self) => {
    if (nicknameError(value)) fail(nicknameError(value));
    const name = normalizeNickname(value),
      key = name.toLowerCase();
    if (
      reserved.has(key) ||
      [...profiles.values()].some((a) => a.id !== self?.id && a.nickname.toLowerCase() === key)
    )
      fail('이미 사용 중인 닉네임이에요.');
    return name;
  };
  return {
    async social(provider) {
      await wait();
      if (!PROVIDERS.includes(provider)) fail('지원하지 않는 로그인 방식이에요.');
      return { provider };
    },
    async login(values) {
      await wait();
      if (Object.values(credentialsErrors(values)).some(Boolean))
        fail('이메일과 비밀번호를 확인해 주세요.');
      const account = accounts.get(normalizeEmail(values.email));
      if (!account || account.password !== values.password)
        fail('이메일 또는 비밀번호가 맞지 않아요.');
      return result(account);
    },
    async signup(values) {
      await wait();
      if (Object.values(credentialsErrors(values, true)).some(Boolean))
        fail('가입 정보를 확인해 주세요.');
      const email = normalizeEmail(values.email);
      if (accounts.has(email)) fail('이미 사용 중인 이메일이에요.');
      pending = { enrollment: ++sequence, email, password: values.password };
      return { provider: 'email', email, enrollment: pending.enrollment };
    },
    async checkNickname(value) {
      await wait();
      if (nicknameError(value)) fail(nicknameError(value));
      try {
        validateName(value);
        return true;
      } catch {
        return false;
      }
    },
    async completeProfile({ nickname, provider, email, enrollment, photoUri = null }) {
      await wait();
      nickname = validateName(nickname);
      if (provider === 'email') {
        if (!pending || pending.enrollment !== enrollment || pending.email !== email)
          fail('이메일 정보를 다시 입력해 주세요.');
        if (accounts.has(email)) fail('이미 사용 중인 이메일이에요.');
      } else if (!PROVIDERS.includes(provider)) fail('지원하지 않는 로그인 방식이에요.');
      const account = { id: `preview-account-${++sequence}`, provider, email, nickname, photoUri };
      if (provider === 'email') {
        account.password = pending.password;
        accounts.set(email, account);
        pending = null;
      }
      profiles.set(account.id, account);
      return result(account);
    },
    async checkProfileNickname(user, value) {
      await wait();
      return validateName(value, current(user));
    },
    async updateProfile(user, { nickname, photoUri = null }) {
      await wait();
      const account = current(user),
        name = validateName(nickname, account);
      if (photoUri !== null && (typeof photoUri !== 'string' || !photoUri.trim()))
        fail('사진을 다시 선택해 주세요.');
      Object.assign(account, { nickname: name, photoUri });
      return result(account);
    },
    async changePassword(user, { currentPassword, password, confirmation }) {
      await wait();
      const account = current(user);
      if (account.provider !== 'email')
        fail('소셜 계정은 해당 서비스에서 비밀번호를 변경해 주세요.');
      if (account.password !== currentPassword) fail('현재 비밀번호가 맞지 않아요.');
      if (passwordError(password)) fail(passwordError(password));
      if (password !== confirmation) fail('비밀번호가 일치하지 않아요.');
      if (password === currentPassword) fail('현재 비밀번호와 다른 비밀번호를 입력해 주세요.');
      account.password = password;
    },
    async withdraw(user) {
      await wait();
      const account = current(user);
      if (account.email) accounts.delete(account.email);
      profiles.delete(account.id);
    },
  };
}
export const previewAuth = createPreviewAuth();
