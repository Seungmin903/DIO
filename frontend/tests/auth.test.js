import test from 'node:test'
import assert from 'node:assert/strict'
import {credentialsErrors,credentialsValid,canCompleteProfile,emailError,passwordError,nicknameError} from '../src/auth/validation.js'
const LOGIN={email:'new@example.com',password:'Dio12345!'}
test('이메일·비밀번호·확인 입력 검증',()=>{
 assert.ok(emailError('wrong'));assert.equal(emailError(' a@b.com '),'')
 for(const value of ['12345678','abcdefgh','abc123','abc 12345'])assert.ok(passwordError(value))
 assert.equal(passwordError('Dio12345!'),'')
 assert.equal(credentialsValid(LOGIN),true)
 assert.ok(credentialsErrors({...LOGIN,confirmation:'different'},true).confirmation)
 assert.equal(credentialsValid({...LOGIN,confirmation:LOGIN.password},true),true)
})
test('닉네임 형식과 필수 동의만 충족하면 완료 가능',()=>{
 const state={nickname:'소연',checkedNickname:'소연',terms:{service:true,privacy:true,marketing:false}}
 assert.equal(canCompleteProfile(state),true)
 assert.equal(canCompleteProfile({...state,nickname:'새이름'}),true)
 assert.equal(canCompleteProfile({...state,checkedNickname:null}),true)
 assert.equal(canCompleteProfile({...state,terms:{service:true,privacy:false}}),false)
 assert.ok(nicknameError('a'));assert.ok(nicknameError('이름!'));assert.equal(nicknameError('소연_1'),'')
})
