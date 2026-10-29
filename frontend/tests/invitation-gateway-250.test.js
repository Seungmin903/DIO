import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharingApi } from '../src/sharing/sharingApi.js';
import { createAuthenticatedNotificationSession } from '../src/notifications/authenticatedNotifications.js';
import { canLeaveForInvitation } from '../src/notifications/editorInvitationGuard.js';

test('실제 공유 gateway가 받은 초대를 조회하고 세션 교체 후 늦은 응답을 거부한다', async () => {
  let key='A', status='PENDING', release;
  const auth={getSessionKey:()=>key,getConnectionOptions:()=>({baseUrl:'https://dio.test/api/v1'}),getAccessToken:async()=> 'token'};
  const fetchImpl=async()=>({ok:true,status:200,json:async()=>({items:[{inviteId:'7',status,diaryId:'diary',diaryTitle:'초대',token:'private'}],hasNext:false})});
  const runtime=createSharingApi({user:{userId:'1',nickname:'나'},auth,fetchImpl});
  const session=createAuthenticatedNotificationSession({auth,userId:'1',createInvitations:()=>runtime.invitationGateway,fetchImpl});
  assert.equal((await session.invitations.get('7')).canOpen,true);
  status='CANCELLED';
  assert.equal((await session.invitations.get('7')).canOpen,false);
  const pendingSession=createAuthenticatedNotificationSession({auth,userId:'1',createInvitations:()=>({get:()=>new Promise(r=>release=r)}),fetchImpl});
  const pending=pendingSession.invitations.get('7');key='B';release({inviteId:'7',status:'PENDING',canOpen:true});
  await assert.rejects(pending,e=>e.status===401);
  runtime.dispose();
});

test('편집 입력·자르기·저장 실패·저장 중·로드 전에는 초대 다이어리로 이탈하지 않는다',()=>{
  assert.equal(canLeaveForInvitation({loaded:true,saveStatus:'saved',editing:false}),true);
  for(const value of [{loaded:false,saveStatus:'saved',editing:false},{loaded:true,saveStatus:'saving',editing:false},{loaded:true,saveStatus:'error',editing:false},{loaded:true,saveStatus:'saved',editing:true}])
    assert.equal(canLeaveForInvitation(value),false);
});
