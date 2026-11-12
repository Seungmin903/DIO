import test from 'node:test';import assert from 'node:assert/strict';
import { resolvePushInvitation } from '../src/notifications/pushInvitationClick.js';
test('초대 현재 상태와 수신자가 유효할 때만 이동 대상을 반환한다',async()=>{
 const auth={getSessionKey:()=> 'a'}, data={type:'DIARY_INVITE',inviteId:'12'};
 assert.deepEqual(await resolvePushInvitation({data,auth,invitations:{get:async()=>({inviteId:'12',status:'PENDING',canOpen:true})}}),{inviteId:'12'});
 assert.equal(await resolvePushInvitation({data,auth,invitations:{get:async()=>({inviteId:'12',status:'CANCELLED',canOpen:false})}}),null);
});
test('조회 중 계정 전환이 일어나면 이전 계정의 초대로 이동하지 않는다',async()=>{
 let key='a',finish;const auth={getSessionKey:()=>key};const p=resolvePushInvitation({data:{type:'DIARY_INVITE',inviteId:'12'},auth,invitations:{get:()=>new Promise(resolve=>{finish=resolve;})}});
 key='b';finish({inviteId:'12',status:'PENDING',canOpen:true});assert.equal(await p,null);
});
