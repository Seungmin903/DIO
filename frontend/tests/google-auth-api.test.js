import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthApi} from '../src/auth/authApi.js';
const user={userId:'7',email:'user@gmail.com',nickname:'디오회원',profilePhotoUrl:null};
const tokens=()=>({user,accessToken:'access',refreshToken:'refresh',expiresIn:900});
const response=(body,status=200)=>({status,ok:status<400,json:async()=>body});
const terms={service:true,privacy:true,marketingPrivacy:false,adEmail:true,adPush:false,adNightPush:false};
function setup(handler,extra={}){const calls=[];const api=createAuthApi({baseUrl:'https://dio.test/api',googleSignIn:async()=>({idToken:'google-id-token',email:user.email}),...extra,fetchImpl:async(url,options)=>{calls.push({url,...options});return handler(url,options);}});return {api,calls};}
test('구글 기존 회원은 서버 세션으로 로그인하며 재발급에도 제공자를 유지한다',async()=>{
 const {api,calls}=setup(()=>response(tokens()));const result=await api.social('google',{ageConfirmed:true});
 assert.equal(result.mode,'authenticated');assert.equal(result.provider,'google');assert.equal(result.idToken,undefined);
 assert.deepEqual(JSON.parse(calls[0].body),{idToken:'google-id-token'});
 assert.equal((await api.refresh()).provider,'google');
});
test('구글 신규 가입은 같은 API로 연령·약관·닉네임을 전송한다',async()=>{
 let n=0;const {api,calls}=setup(()=>++n===1?response({code:'SOCIAL_SIGNUP_REQUIRED',detail:'가입 필요'},409):response(tokens()));
 const draft=await api.social('google',{ageConfirmed:true});assert.equal(draft.mode,'social-signup');assert.equal(draft.idToken,undefined);
 api.cancelPending({keepEnrollment:true});const view=await api.completeProfile({...draft,nickname:user.nickname,terms,ageConfirmed:true});
 assert.equal(view.provider,'google');const body=JSON.parse(calls[1].body);assert.equal(body.enrollment.ageConfirmed,true);assert.equal(body.enrollment.agreements.length,6);assert.equal(body.email,undefined);
 assert.equal(calls[0].url,calls[1].url);assert.ok(api.getSessionKey());
});
test('구글 가입 사진은 기존 multipart 도우미의 oauth 파트로 전송한다',async()=>{
 let n=0;let part;const upload={};const {api,calls}=setup(()=>++n===1?response({code:'SOCIAL_SIGNUP_REQUIRED'},409):response(tokens()),{buildPhotoBody:async(body,uri,name)=>{part=name;assert.equal(body.idToken,'google-id-token');return {body:upload};}});
 const draft=await api.social('google',{ageConfirmed:true});await api.completeProfile({...draft,nickname:user.nickname,terms,ageConfirmed:true,photoUri:'file:///photo.png'});assert.equal(part,'oauth');assert.equal(calls[1].body,upload);
});
test('구글 로그인은 연령 확인 전에 SDK를 열고, 미지원 제공자는 SDK를 호출하지 않는다',async()=>{
 let n=0;const {api,calls}=setup(()=>response(tokens()),{googleSignIn:async()=>{n++;return {idToken:'google-id-token',email:user.email}}});
 await api.social('google');await assert.rejects(api.social('kakao'),/준비/);assert.equal(n,1);assert.equal(calls.length,1);
});
test('화면 취소 후 늦은 Google 응답으로 서버 세션을 만들지 않는다',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const {api,calls}=setup(()=>response(tokens()),{googleSignIn:()=>pending});
 const result=api.social('google',{ageConfirmed:true});api.cancelPending();resolve({idToken:'token',email:user.email});await assert.rejects(result,/취소/);assert.equal(calls.length,0);assert.equal(api.getSessionKey(),null);
});
test('구글 가입의 네트워크 실패는 재시도 가능하고 뒤로가기는 인증 정보를 버린다',async()=>{
 let n=0;const {api}=setup(()=>{if(++n===1)return response({code:'SOCIAL_SIGNUP_REQUIRED'},409);throw new Error('offline');});
 const draft=await api.social('google',{ageConfirmed:true});await assert.rejects(api.completeProfile({...draft,nickname:user.nickname,terms,ageConfirmed:true}),/서버/);api.cancelPending();await assert.rejects(api.completeProfile({...draft,nickname:user.nickname,terms,ageConfirmed:true}),/구글 인증/);
});
test('기존 이메일 계정은 비밀번호 확인 후에만 구글 로그인을 연결한다',async()=>{
 let n=0;const {api,calls}=setup(()=>{n++;return n===1?response({code:'SOCIAL_ACCOUNT_LINK_REQUIRED'},409):n===2?response({code:'INVALID_EXISTING_CREDENTIALS',detail:'비밀번호를 확인해 주세요.'},401):response(tokens());});
 const draft=await api.social('google');assert.equal(draft.mode,'social-link');
 await assert.rejects(api.linkSocial('google',draft.email,'Wrong123!'),/비밀번호/);
 const linked=await api.linkSocial('google',draft.email,'Password123!');
 assert.equal(linked.userId,user.userId);assert.equal(calls.length,3);
 assert.deepEqual(JSON.parse(calls[1].body),{idToken:'google-id-token',email:user.email,password:'Wrong123!'});
 assert.deepEqual(JSON.parse(calls[2].body),{idToken:'google-id-token',email:user.email,password:'Password123!'});
});
test('계정 연결 취소 뒤 늦은 응답은 세션을 만들지 않는다',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);let n=0;
 const {api}=setup(()=>++n===1?response({code:'SOCIAL_ACCOUNT_LINK_REQUIRED'},409):pending);
 const draft=await api.social('google');const link=api.linkSocial('google',draft.email,'Password123!');
 api.cancelPending();resolve(response(tokens()));
 await assert.rejects(link,/취소/);assert.equal(api.getSessionKey(),null);
});
