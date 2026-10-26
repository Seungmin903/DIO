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
test('다른 이메일·만료·재발송·화면 취소 후에는 완료 API를 호출하지 않는다',async()=>{
  for(const action of ['other','expired','resend','cancel']) {
    const {api,calls,expire}=setup();
    await api.verifyPasswordReset('member@example.com','123456');
    if(action==='expired')expire();
    if(action==='resend')await api.requestPasswordReset('member@example.com');
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
