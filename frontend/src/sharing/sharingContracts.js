export class SharingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const normalizeSharingNickname = value => value.trim().normalize('NFKC');
export const MAX_SHARING_MEMBERS = 4;
export const COPY_TITLE_LIMIT = 24;
export const copyTitleError = value => !value.trim() ? '사본 이름을 입력해 주세요.'
  : value.trim().length > COPY_TITLE_LIMIT ? '이름은 24자 이내로 입력해 주세요.' : '';
export const defaultCopyTitle = title => {
  const prefix = title.slice(0, COPY_TITLE_LIMIT - 3).replace(/[\uD800-\uDBFF]$/, '');
  return `${prefix} 사본`;
};
export const normalizeInviteEmail = value => value.trim().toLowerCase();
export const inviteEmailError = value =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeInviteEmail(value)) && value.trim().length <= 254
    ? '' : '이메일 주소를 확인해 주세요.';
export const sharingNicknameError = value =>
  /^[가-힣a-zA-Z0-9_]{2,12}$/.test(normalizeSharingNickname(value))
    ? '' : '한글·영문·숫자·밑줄로 2~12자를 입력해 주세요.';
