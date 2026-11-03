import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeEmail, emailError, accountEmailError, credentialsErrors } from '../src/auth/validation.js';
import { normalizeInviteEmail, inviteEmailError } from '../src/sharing/sharingContracts.js';
import { createAuthApi } from '../src/auth/authApi.js';
const cases=JSON.parse(readFileSync(new URL('../../docs/contracts/email-input-cases.json',import.meta.url),'utf8'));
for(const [index,row] of cases.entries())test(`공통 이메일 계약 ${index}: 인증·초대의 정규화·허용 여부 일치`,()=>{
 assert.equal(normalizeEmail(row.input),row.normalized);
 assert.equal(normalizeInviteEmail(row.input),row.normalized);
 assert.equal(!emailError(row.input),row.valid);
 assert.equal(!accountEmailError(row.input),row.accountValid);
 assert.equal(!credentialsErrors({email:row.input,password:"Password123!"}).email,row.accountValid);
 assert.equal(!inviteEmailError(row.input),row.accountValid);
});
test('잘못된 이메일은 인증 API 어댑터에서도 서버 요청 전에 거절한다',async()=>{
 let requests=0;
 const api=createAuthApi({baseUrl:'https://server.example',fetchImpl:async()=>{requests++;throw new Error('must not request')}});
 for(const work of [()=>api.login({email:' ',password:'Password123!'}),
  ()=>api.signup({ageConfirmed:true,email:'a..b@example.com',password:'Password123!'}),
  ()=>api.checkEmailAvailability('a@example..com'),()=>api.sendVerification('a@-example.com'),
  ()=>api.verifyEmail('a@localhost','123456'),()=>api.requestPasswordReset(' '),
  ()=>api.verifyPasswordReset(' ','123456')])
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

for(const address of ['legacy@[127.0.0.1]','legacy@old_domain.example','"legacy.user"@example.com'])
 test(`기존 주소는 로그인·재설정 세 단계 모두 새 가입 패턴으로 차단하지 않는다: ${address}`,async()=>{
 const calls=[];
 const api=createAuthApi({baseUrl:'https://server.example',fetchImpl:async(url,init)=>{
  const path=url.split('/auth/')[1];calls.push({path,body:JSON.parse(init.body)});
  const data=path==='login'?{accessToken:'access',refreshToken:'refresh',expiresIn:900,user:{userId:'1',email:address,nickname:'회원',profilePhotoUrl:null}}
   :path==='password-reset-verifications'?{resetToken:'reset-token',expiresIn:600}:{expiresIn:600,resendAfter:60};
  return{ok:true,status:path==='password-resets'?204:200,json:async()=>data};
 }});
 assert.ok(emailError(address));assert.equal(accountEmailError(address),'');
 await api.login({email:` ${address.toUpperCase()} `,password:'Password123!'});
 await api.requestPasswordReset(address);await api.verifyPasswordReset(address,'123456');
 await api.completePasswordReset({email:address,newPassword:'NewPassword123!'});
 assert.deepEqual(calls.map(c=>c.path),['login','password-reset-requests','password-reset-verifications','password-resets']);
 assert.ok(calls.every(c=>c.body.email===address));
});

for (const active of ['login', 'signup']) for (const invalid of ['login', 'signup'])
 test(`잘못된 ${invalid} 입력은 진행 중인 ${active} 요청을 취소하지 않는다`, async () => {
  let finish; let requests = 0;
  const api = createAuthApi({baseUrl:'https://server.example',fetchImpl:()=>{
   requests++; return new Promise(resolve=>{finish=()=>resolve({ok:true,status:200,json:async()=>active==='login'
    ? {accessToken:'access',refreshToken:'refresh',expiresIn:900,user:{userId:'1',email:'member@example.com',nickname:'회원',profilePhotoUrl:null}}
    : {available:true}});});
  }});
  const pending=api[active]({email:'member@example.com',password:'Password123!',ageConfirmed:true});
  await assert.rejects(api[invalid]({email:'member',password:'Password123!',ageConfirmed:true}),{code:'INVALID_EMAIL'});
  finish(); await pending; assert.equal(requests,1);
 });
for (const email of ['member','user@','@example.com','a@@example.com'])
 test(`기존 계정 조회도 최소 주소 구조를 검사한다: ${email}`,async()=>{
  let requests=0;
  const api=createAuthApi({baseUrl:'https://server.example',fetchImpl:async()=>{requests++;throw new Error('must not request')}});
  for(const work of [()=>api.login({email,password:'Password123!'}),()=>api.requestPasswordReset(email),()=>api.verifyPasswordReset(email,'123456')])
   await assert.rejects(work,{code:'INVALID_EMAIL'});
  assert.ok(inviteEmailError(email));assert.equal(requests,0);
 });
