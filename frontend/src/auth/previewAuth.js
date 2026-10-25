import {credentialsErrors,normalizeEmail,normalizeNickname,nicknameError} from './validation.js'
const PROVIDERS=['kakao','google','apple']
const failure=message=>{throw new Error(message)}
// API 연결 전 전환 검증용. 가입 정보는 실행 중 메모리에만 두고 디스크·서버에 저장하지 않는다.
export function createPreviewAuth({wait=()=>new Promise(resolve=>setTimeout(resolve,350))}={}) {
 const accounts=new Map(),nicknames=new Set(['관리자','dio'])
 let pending=null,sequence=0
 return {
  async social(provider){await wait();if(!PROVIDERS.includes(provider))failure('지원하지 않는 로그인 방식이에요.');return {provider}},
  async login(values){
   await wait()
   if(Object.values(credentialsErrors(values)).some(Boolean))failure('이메일과 비밀번호를 확인해 주세요.')
   const email=normalizeEmail(values.email),account=accounts.get(email)
   if(!account||account.password!==values.password)failure('이메일 또는 비밀번호가 맞지 않아요.')
   return {mode:'preview',provider:'email',email,nickname:account.nickname,...(account.photoUri&&{photoUri:account.photoUri})}
  },
  async signup(values){
   await wait()
   if(Object.values(credentialsErrors(values,true)).some(Boolean))failure('가입 정보를 확인해 주세요.')
   const email=normalizeEmail(values.email)
   if(accounts.has(email))failure('이미 사용 중인 이메일이에요.')
   const enrollment=++sequence
   pending={enrollment,email,password:values.password}
   return {provider:'email',email,enrollment}
  },
  async checkNickname(value){
   await wait();if(nicknameError(value))failure(nicknameError(value))
   return !nicknames.has(normalizeNickname(value).toLowerCase())
  },
  async completeProfile({nickname,provider,email,enrollment,photoUri=null}){
   await wait();if(nicknameError(nickname))failure(nicknameError(nickname))
   nickname=normalizeNickname(nickname)
   if(nicknames.has(nickname.toLowerCase()))failure('이미 사용 중인 닉네임이에요.')
   if(provider==='email'){
    if(!pending||pending.enrollment!==enrollment||pending.email!==email)failure('이메일 정보를 다시 입력해 주세요.')
    if(accounts.has(email))failure('이미 사용 중인 이메일이에요.')
    accounts.set(email,{password:pending.password,nickname,photoUri});pending=null
   }else if(!PROVIDERS.includes(provider))failure('지원하지 않는 로그인 방식이에요.')
   nicknames.add(nickname.toLowerCase())
   return {mode:'preview',provider,nickname,...(photoUri&&{photoUri}),...(email&&{email})}
  },
 }
}
export const previewAuth=createPreviewAuth()
