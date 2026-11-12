import assert from 'node:assert/strict';
import { createSharingApi } from '../src/sharing/sharingApi.js';
import { createAuthenticatedNotificationSession } from '../src/notifications/authenticatedNotifications.js';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {baseUrl,diaries}=JSON.parse(input);
assert.match(baseUrl,/^http:\/\/127\.0\.0\.1:\d+\/api\/v1$/);
async function call(path,token,body,method=body?'POST':'GET') {
 const response=await fetch(baseUrl+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 assert.ok(response.ok,`${method} ${path}: ${response.status}`);
 return response.status===204?null:response.json();
}
const a=await call('/auth/login',null,{email:'e2e-a@example.com',password:'DioMember123!'});
const b=await call('/auth/login',null,{email:'e2e-b@example.com',password:'DioMember123!'});
const auth={getSessionKey:()=> 'recipient',getConnectionOptions:()=>({baseUrl}),getAccessToken:async()=>b.accessToken};
const runtime=createSharingApi({user:{userId:b.user.userId,nickname:'참여자'},auth});
const session=createAuthenticatedNotificationSession({auth,userId:b.user.userId,createInvitations:()=>runtime.invitationGateway});
try {
 for(const [index,action] of ['accept','decline','cancel'].entries()) {
  const diary=diaries[index];
  await call(`/diaries/${diary}/invites/email`,a.accessToken,{email:'e2e-b@example.com'});
  const rows=await session.api.list();
  const row=rows.items.find(r=>r.diaryId===diary);
  assert.ok(row?.inviteId,'actual notification must include invitation');
  assert.equal(row.status,'PENDING');
  const detail=await session.invitations.get(row.inviteId);
  assert.equal(detail.canOpen,true);
  await session.api.read(row.id);
  if(action==='accept')await runtime.accept(row.inviteId,'참여자');
  else if(action==='decline')await runtime.decline(row.inviteId);
  else await call(`/diaries/${diary}/invites/${row.inviteId}`,a.accessToken,null,'DELETE');
  const latest=await session.invitations.get(row.inviteId);
  assert.equal(latest.status,({accept:'ACCEPTED',decline:'DECLINED',cancel:'CANCELLED'})[action]);
  assert.equal(latest.canOpen,false);
 }
 await call('/auth/logout',b.accessToken,null,'POST');
 await assert.rejects(session.api.list(),e=>e.status===401);
 console.log('PASS actual Spring HTTP + FE adapters: invite → notification → detail → accept/decline/cancel → logout');
} finally {runtime.dispose();}
