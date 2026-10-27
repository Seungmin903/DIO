import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthApi } from '../src/auth/authApi.js';

function setup() {
  const calls = []; let time = 0;
  const api = createAuthApi({baseUrl:'http://localhost:8080/api', now:()=>time,
    fetchImpl:async(url, init)=> {
      calls.push({url,...init});
      return {ok:true,status:url.endsWith('/password-resets')?204:200,
        json:async()=>({resetToken:'reset-only',expiresIn:600,resendAfter:60})};
    }});
  return {api,calls,expire:()=>{time=600001;}};
}
test('재설정 API 3개를 구분하고 토큰은 메모리에 보관해 완료 요청에만 전달한다',async()=>{
  const {api,calls}=setup();
  await api.requestPasswordReset(' MEMBER@example.com ');
  assert.deepEqual(await api.verifyPasswordReset('member@example.com','123456'),{expiresIn:600});
  await api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'});
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname.split('/').at(-1)),['password-reset-requests','password-reset-verifications','password-resets']);
  assert.deepEqual(JSON.parse(calls[2].body),{email:'member@example.com',resetToken:'reset-only',newPassword:'NewPassword123!'});
  assert.equal(calls[2].headers.Authorization,undefined);
  await assert.rejects(api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'}),/인증/);
});
test('다른 이메일·만료·화면 취소 후에는 완료 API를 호출하지 않는다',async()=>{
  for(const action of ['other','expired','cancel']) {
    const {api,calls,expire}=setup();
    await api.verifyPasswordReset('member@example.com','123456');
    if(action==='expired')expire();
    if(action==='cancel')api.cancelPending();
    const before=calls.length;
    await assert.rejects(api.completePasswordReset({email:action==='other'?'other@example.com':'member@example.com',newPassword:'NewPassword123!'}),/인증/);
    assert.equal(calls.length,before);
  }
});
test('취소 후 늦게 도착한 인증 응답은 재설정 토큰을 복원하지 않는다',async()=>{
  let resolve;
  const api=createAuthApi({baseUrl:'http://localhost:8080',fetchImpl:()=>new Promise(done=>{resolve=done;})});
  const verifying=api.verifyPasswordReset('member@example.com','123456');
  api.cancelPending();
  resolve({ok:true,status:200,json:async()=>({resetToken:'reset-only',expiresIn:600})});
  await assert.rejects(verifying,/취소/);
  await assert.rejects(api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'}),/인증/);
});

function deferredResetApi() {
  let finishReset;
  const calls=[];
  const api=createAuthApi({baseUrl:'http://localhost:8080',fetchImpl:async(url,init)=>{
    calls.push({url,...init});
    if(url.endsWith('/password-resets'))return new Promise(resolve=>{finishReset=()=>resolve({ok:true,status:204});});
    if(url.endsWith('/password-reset-verifications'))return {ok:true,status:200,json:async()=>({resetToken:'reset-only',expiresIn:600})};
    if(url.endsWith('/login')||url.endsWith('/refresh'))return {ok:true,status:200,json:async()=>({
      accessToken:'access-b',refreshToken:'refresh-b',user:{userId:'2',email:'b@example.com',nickname:'회원B'}
    })};
    return {ok:true,status:200,json:async()=>({available:true,signupToken:'signup-only',expiresIn:600,userId:'3',email:'c@example.com',nickname:'회원C'})};
  }});
  return {api,calls,finish:()=>finishReset()};
}

test('취소 여부와 무관하게 늦은 완료 응답은 새 로그인 세션을 지우지 않는다',async()=>{
  for(const cancel of [true,false]) {
    const {api,calls,finish}=deferredResetApi();
    await api.verifyPasswordReset('a@example.com','123456');
    const completing=api.completePasswordReset({email:'a@example.com',newPassword:'NewPassword123!'});
    if(cancel)api.cancelPending();
    const user=await api.login({email:'b@example.com',password:'Password123!'});
    finish();await assert.rejects(completing,/로그인 상태가 변경/);
    assert.equal(user.email,'b@example.com');
    assert.equal((await api.refresh()).email,'b@example.com');
    assert.equal(JSON.parse(calls.at(-1).body).refreshToken,'refresh-b');
  }
});

test('취소 후 새로 시작한 가입 인증 상태도 늦은 완료 응답으로 지우지 않는다',async()=>{
  const {api,finish}=deferredResetApi();
  await api.verifyPasswordReset('a@example.com','123456');
  const completing=api.completePasswordReset({email:'a@example.com',newPassword:'NewPassword123!'});
  api.cancelPending();
  const profile=await api.signup({email:'c@example.com',password:'Password123!'});
  await api.verifyEmail('c@example.com','123456');
  finish();await assert.rejects(completing,/상태가 변경/);
  const result=await api.completeProfile({...profile,nickname:'회원C',terms:{service:true,privacy:true}});
  assert.equal(result.mode,'registered');
});

test('정상 완료는 기존 로그인 세션을 비우고 재설정 토큰을 재사용하지 못하게 한다',async()=>{
  const {api,calls,finish}=deferredResetApi();
  await api.login({email:'b@example.com',password:'Password123!'});
  await api.verifyPasswordReset('b@example.com','123456');
  const completing=api.completePasswordReset({email:'b@example.com',newPassword:'NewPassword123!'});
  finish();await completing;
  const count=calls.length;
  await assert.rejects(api.refresh(),/다시 로그인/);
  await assert.rejects(api.completePasswordReset({email:'b@example.com',newPassword:'NewPassword123!'}),/인증/);
  assert.equal(calls.length,count);
});

test('유효한 재설정 토큰이 있으면 재발송 요청을 막고 완료 토큰을 보존한다',async()=>{
  const {api,calls}=setup();
  await api.verifyPasswordReset('member@example.com','123456');
  const before=calls.length;
  await assert.rejects(api.requestPasswordReset('member@example.com'),/이미 완료/);
  assert.equal(calls.length,before);
  await api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'});
  assert.equal(JSON.parse(calls.at(-1).body).resetToken,'reset-only');
});
test('유효한 토큰이 있으면 인증번호 재확인을 막고 완료 요청에 원래 토큰을 사용한다',async()=>{
  const {api,calls}=setup();
  await api.verifyPasswordReset('member@example.com','123456');
  const before=calls.length;
  await assert.rejects(api.verifyPasswordReset(' MEMBER@example.com ','000000'),/이미 완료/);
  assert.equal(calls.length,before);
  await api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'});
  assert.equal(JSON.parse(calls.at(-1).body).resetToken,'reset-only');
});

test('동일 이메일의 병렬 인증 확인은 첫 요청의 유효 토큰을 잃게 하지 않는다',async()=>{
  let resolveVerify;
  const calls=[];
  const api=createAuthApi({baseUrl:'http://localhost:8080',fetchImpl:async(url,init)=>{
    calls.push({url,...init});
    if(url.endsWith('/password-reset-verifications'))return new Promise(resolve=>{resolveVerify=resolve;});
    return {ok:true,status:204};
  }});
  const first=api.verifyPasswordReset('member@example.com','123456');
  await assert.rejects(api.verifyPasswordReset('member@example.com','000000'),/확인하고/);
  await assert.rejects(api.requestPasswordReset('member@example.com'),/확인하고/);
  resolveVerify({ok:true,status:200,json:async()=>({resetToken:'first-token',expiresIn:600})});
  await first;
  await api.completePasswordReset({email:'member@example.com',newPassword:'NewPassword123!'});
  assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls.at(-1).body).resetToken,'first-token');
});
