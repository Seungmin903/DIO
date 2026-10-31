// Existing fields use the email-signup API's input rules.
export const normalizeEmail = value => value.trim().toLowerCase()
export const normalizeNickname = value => value.trim().normalize('NFKC')
export function emailError(value) {
  return value.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) ? '이메일 주소를 확인해 주세요.' : ''
}
export function passwordError(value) {
  return value.length < 8 || value.length > 32 || /[^\x21-\x7e]/.test(value) || !/[a-z]/i.test(value) || !/\d/.test(value) ? '영문·숫자를 포함해 8~32자로 입력해 주세요.' : ''
}
export function nicknameError(value) {
  return !/^[가-힣a-zA-Z0-9_]{2,12}$/.test(normalizeNickname(value)) ? '한글·영문·숫자·밑줄로 2~12자를 입력해 주세요.' : ''
}
export const BIO_MAX = 30
export const normalizeBio = value => (value || '').replace(/\s+/g, ' ').trim().normalize('NFKC')
export function bioError(value) {
  return [...normalizeBio(value)].length > BIO_MAX ? `한 줄 소개는 ${BIO_MAX}자까지 쓸 수 있어요.` : ''
}
export function credentialsErrors({email,password,confirmation},signup=false) {
  return {email:emailError(email),password:passwordError(password),...(signup&&{confirmation:password!==confirmation||!confirmation?'비밀번호가 일치하지 않아요.':''})}
}
export const credentialsValid = (values,signup=false) => Object.values(credentialsErrors(values,signup)).every(error=>!error)
export const canCompleteProfile = ({nickname,terms}) => !nicknameError(nickname) && terms.service && terms.privacy
