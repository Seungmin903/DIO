import test from 'node:test';
import assert from 'node:assert/strict';
import { createPushInstallationApi, pushInvitationId } from '../src/notifications/pushInstallationApi.js';
const id = '12345678-1234-4234-8234-123456789abc';
function setup(fetchImpl) {
 let key='session-a';
 const auth={ getSessionKey:()=>key, getConnectionOptions:()=>({baseUrl:'https://dio.example/api/v1',getAuthHeaders:(_url,token)=>({Authorization:`Bearer ${token}`})}), getAccessToken:async()=> 'jwt' };
 return { api:createPushInstallationApi({auth,userId:'1',fetchImpl}), change:()=>{key='session-b';} };
}
test('기기 secret은 헤더로만 전송하고 버전 문자열을 보존한다', async()=>{
 let request;const {api}=setup(async(url,options)=>{request={url,options};return {ok:true,status:200,json:async()=>({bindingVersion:'2'})};});
 await api.bind(id,'secret',{requestId:id,bindingVersion:'1'});
 assert.equal(request.options.headers['X-DIO-Installation-Secret'],'secret');assert.equal(request.options.headers.Authorization,'Bearer jwt');
 assert.ok(!request.url.includes('secret'));assert.equal(JSON.parse(request.options.body).bindingVersion,'1');
});
test('계정 전환 후 기존 응답을 거부한다',async()=>{
 let complete;const {api,change}=setup(()=>new Promise(resolve=>{complete=resolve;}));
 const pending=api.get(id);await new Promise(resolve=>setImmediate(resolve));change();complete({ok:true,status:200,json:async()=>({})});
 await assert.rejects(pending,/PUSH_SESSION_CHANGED/);
});
test('초대 ID 외 데이터와 경로 조작을 거부한다',async()=>{
 assert.equal(pushInvitationId({type:'DIARY_INVITE',inviteId:'123'}),'123');
 assert.equal(pushInvitationId({type:'DIARY_INVITE',inviteId:'../123'}),null);
 assert.equal(pushInvitationId({type:'OTHER',inviteId:'123'}),null);
 const {api}=setup(async()=>{throw new Error('unexpected');});assert.throws(()=>api.get('../bad'),/PUSH_INVALID_ID/);
});

test('운영 모드에서는 평문 로컬 HTTP와 주소 자격증명을 거부한다',()=>{
 const create=url=>({getSessionKey:()=> 's',getConnectionOptions:()=>({baseUrl:url,getAuthHeaders:()=>({})})});
 assert.throws(()=>createPushInstallationApi({auth:create('http://localhost/api/v1'),userId:'1'}),/PUSH_HTTPS_REQUIRED/);
 assert.throws(()=>createPushInstallationApi({auth:create('https://user:password@dio.example/api/v1'),userId:'1'}),/PUSH_HTTPS_REQUIRED/);
 assert.doesNotThrow(()=>createPushInstallationApi({auth:create('http://localhost/api/v1'),userId:'1',allowDevelopmentHttp:true}));
});

test('지연된 기기 요청은 시간 제한으로 종료한다',async()=>{
 const auth={getSessionKey:()=> 's',getConnectionOptions:()=>({baseUrl:'https://dio.example/api/v1',getAuthHeaders:()=>({})}),getAccessToken:async()=> 'jwt'};
 const api=createPushInstallationApi({auth,userId:'1',timeoutMs:10,fetchImpl:(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('ABORTED'))))});
 await assert.rejects(api.get(id),/ABORTED/);
});
