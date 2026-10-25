import test from 'node:test'
import assert from 'node:assert/strict'
import {credentialsErrors,credentialsValid,canCompleteProfile,emailError,passwordError,nicknameError} from '../src/auth/validation.js'
import {createPreviewAuth} from '../src/auth/previewAuth.js'
const PREVIEW_LOGIN={email:'new@example.com',password:'Dio12345!'}
test('이메일·비밀번호·확인 입력 검증',()=>{
 assert.ok(emailError('wrong'));assert.equal(emailError(' a@b.com '),'')
 for(const value of ['12345678','abcdefgh','abc123','abc 12345'])assert.ok(passwordError(value))
 assert.equal(passwordError('Dio12345!'),'')
 assert.equal(credentialsValid(PREVIEW_LOGIN),true)
 assert.ok(credentialsErrors({...PREVIEW_LOGIN,confirmation:'different'},true).confirmation)
 assert.equal(credentialsValid({...PREVIEW_LOGIN,confirmation:PREVIEW_LOGIN.password},true),true)
})
test('닉네임은 확인한 값과 필수 동의가 모두 일치해야 완료 가능',()=>{
 const state={nickname:'소연',checkedNickname:'소연',terms:{service:true,privacy:true,marketing:false}}
 assert.equal(canCompleteProfile(state),true)
 assert.equal(canCompleteProfile({...state,nickname:'새이름'}),false)
 assert.equal(canCompleteProfile({...state,checkedNickname:null}),false)
 assert.equal(canCompleteProfile({...state,terms:{service:true,privacy:false}}),false)
 assert.ok(nicknameError('a'));assert.ok(nicknameError('이름!'));assert.equal(nicknameError('소연_1'),'')
})
test('가입 완료 후 같은 정보로 로그인하고 비밀번호를 결과에 노출하지 않는다',async()=>{
 const service=createPreviewAuth({wait:async()=>{}})
 await assert.rejects(service.login(PREVIEW_LOGIN),/맞지 않아요/)
 const enrollment=await service.signup({...PREVIEW_LOGIN,confirmation:PREVIEW_LOGIN.password})
 await assert.rejects(service.login(PREVIEW_LOGIN),/맞지 않아요/)
 const profile=await service.completeProfile({...enrollment,nickname:'소연',photoUri:'file:///profile.jpg'})
 assert.equal(profile.nickname,'소연');assert.equal('password' in profile,false)
 const session=await service.login({...PREVIEW_LOGIN,email:' NEW@EXAMPLE.COM '})
 assert.equal(session.nickname,'소연');assert.equal(session.photoUri,'file:///profile.jpg');assert.equal('password' in session,false)
 await assert.rejects(service.login({...PREVIEW_LOGIN,password:'wrong12345'}),/맞지 않아요/)
 await assert.rejects(service.signup({...PREVIEW_LOGIN,confirmation:PREVIEW_LOGIN.password}),/이미 사용/)
 assert.equal(await service.checkNickname('소연'),false)
 const restarted=createPreviewAuth({wait:async()=>{}})
 await assert.rejects(restarted.login(PREVIEW_LOGIN),/맞지 않아요/)
})
test('소셜 제공자와 중복 닉네임 검증',async()=>{
 const service=createPreviewAuth({wait:async()=>{}})
 for(const provider of ['kakao','google','apple'])assert.deepEqual(await service.social(provider),{provider})
 await assert.rejects(service.social('naver'),/지원하지/)
 assert.equal(await service.checkNickname('관리자'),false)
 await service.completeProfile({provider:'google',nickname:'소연'})
 await assert.rejects(service.completeProfile({provider:'apple',nickname:'소연'}),/이미 사용/)
})
