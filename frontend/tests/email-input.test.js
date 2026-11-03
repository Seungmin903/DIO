import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEmail, emailError } from '../src/auth/validation.js';
import { normalizeInviteEmail, inviteEmailError } from '../src/sharing/sharingContracts.js';
import { createAuthApi } from '../src/auth/authApi.js';
const cases=JSON.parse(readFileSync(new URL('../../docs/contracts/email-input-cases.json',import.meta.url),'utf8'));
for(const [index,row] of cases.entries())test(`공통 이메일 계약 ${index}: 인증·초대의 정규화·허용 여부 일치`,()=>{
 assert.equal(normalizeEmail(row.input),row.normalized);
 assert.equal(normalizeInviteEmail(row.input),row.normalized);
 assert.equal(!emailError(row.input),row.valid);
 assert.equal(!inviteEmailError(row.input),row.valid);
});
test('잘못된 이메일은 인증 API 어댑터에서도 서버 요청 전에 거절한다',async()=>{
 let requests=0;
 const api=createAuthApi({baseUrl:'https://server.example',fetchImpl:async()=>{requests++;throw new Error('must not request')}});
 for(const work of [()=>api.login({email:'a@localhost',password:'Password123!'}),
  ()=>api.signup({ageConfirmed:true,email:'a..b@example.com',password:'Password123!'}),
  ()=>api.checkEmailAvailability('a@example..com'),()=>api.sendVerification('a@-example.com'),
  ()=>api.verifyEmail('a@localhost','123456'),()=>api.requestPasswordReset('a@localhost'),
  ()=>api.verifyPasswordReset('a@localhost','123456')])
  await assert.rejects(work,{code:'INVALID_EMAIL'});
 assert.equal(requests,0);
});

test('잘못된 주소로 재발송을 눌러도 기존 가입 인증 토큰을 지우지 않는다',async()=>{
 const calls=[];
 const api=createAuthApi({baseUrl:'https://server.example',fetchImpl:async(url,init)=>{
  const path=url.split('/auth/')[1];calls.push(path);
  const data=path==='email-verifications/verify'?{signupToken:'valid-token',expiresIn:3600}
   :path==='signup'?{userId:'1',email:'member@example.com',nickname:'회원',profilePhotoUrl:null}:{available:true};
  return{status:200,ok:true,json:async()=>data};
 }});
 await api.signup({email:'member@example.com',password:'Password123!',ageConfirmed:true});
 await api.verifyEmail('member@example.com','123456');
 await assert.rejects(api.sendVerification('bad@localhost'),{code:'INVALID_EMAIL'});
 assert.equal((await api.completeProfile({email:'member@example.com',nickname:'회원',terms:{service:true,privacy:true}})).mode,'registered');
 assert.equal(calls.includes('email-verifications'),false);
});
