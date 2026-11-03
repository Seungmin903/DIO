import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthApi} from '../src/auth/authApi.js';
const user={userId:'9',email:'abc123@privaterelay.appleid.com',nickname:'애플회원',profilePhotoUrl:null};
const tokens=()=>({user,accessToken:'access',refreshToken:'refresh',expiresIn:900});
const response=(body,status=200)=>({status,ok:status<400,json:async()=>body});
const terms={service:true,privacy:true,marketingPrivacy:false,adEmail:false,adPush:false,adNightPush:false};
function setup(handler,extra={}){const calls=[];const api=createAuthApi({baseUrl:'https://dio.test/api',appleSignIn:async()=>({idToken:'apple-identity-token',email:user.email}),...extra,fetchImpl:async(url,options)=>{calls.push({url,...options});return handler(url,options);}});return {api,calls};}
test('애플 기존 회원은 oauth/apple로 로그인하고 제공자를 유지한다',async()=>{
 const {api,calls}=setup(()=>response(tokens()));const result=await api.social('apple',{ageConfirmed:true});
 assert.equal(result.provider,'apple');assert.match(calls[0].url,/\/oauth\/apple$/);
 assert.deepEqual(JSON.parse(calls[0].body),{idToken:'apple-identity-token'});
 assert.equal((await api.refresh()).provider,'apple');
});
test('애플 재로그인은 이메일이 없어도 기존 회원이면 로그인된다',async()=>{
 const {api}=setup(()=>response(tokens()),{appleSignIn:async()=>({idToken:'apple-identity-token',email:null})});
 assert.equal((await api.social('apple',{ageConfirmed:true})).mode,'authenticated');
});
test('애플 신규 가입은 같은 경로로 가입 정보를 보내고 구글 가입으로 바꿔 쓸 수 없다',async()=>{
 let n=0;const {api,calls}=setup(()=>++n===1?response({code:'SOCIAL_SIGNUP_REQUIRED'},409):response(tokens()));
 const draft=await api.social('apple',{ageConfirmed:true});assert.equal(draft.mode,'social-signup');assert.equal(draft.provider,'apple');
 await assert.rejects(api.completeProfile({...draft,provider:'google',nickname:user.nickname,terms}),/구글 인증/);
 const view=await api.completeProfile({...draft,nickname:user.nickname,terms});assert.equal(view.provider,'apple');
 assert.equal(calls[0].url,calls[1].url);assert.equal(JSON.parse(calls[1].body).enrollment.ageConfirmed,true);
});
test('애플 신규 가입인데 이메일을 받지 못하면 다시 로그인하도록 안내한다',async()=>{
 const {api}=setup(()=>response({code:'SOCIAL_SIGNUP_REQUIRED'},409),{appleSignIn:async()=>({idToken:'apple-identity-token'})});
 await assert.rejects(api.social('apple',{ageConfirmed:true}),e=>e.code==='SOCIAL_EMAIL_REQUIRED');
});
test('애플 로그인 함수가 없으면 서버를 부르지 않는다',async()=>{
 const {api,calls}=setup(()=>response(tokens()),{appleSignIn:undefined});
 await assert.rejects(api.social('apple',{ageConfirmed:true}),/애플 로그인 기능/);assert.equal(calls.length,0);
});
