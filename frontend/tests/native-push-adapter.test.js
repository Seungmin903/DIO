import test from 'node:test';import assert from 'node:assert/strict';
import { createNativePushAdapter } from '../src/notifications/nativePushAdapter.js';
test('Android 채널을 먼저 만들고 허용 후 Expo 토큰을 받는다',async()=>{
 const calls=[];const notifications={AndroidImportance:{DEFAULT:3},setNotificationChannelAsync:async()=>calls.push('channel'),getPermissionsAsync:async()=>({status:'undetermined'}),requestPermissionsAsync:async()=>{calls.push('permission');return {status:'granted'};},getExpoPushTokenAsync:async({projectId})=>{calls.push(projectId);return {data:'ExpoPushToken[fake]'};}};
 const adapter=createNativePushAdapter({notifications,secureStore:{},platform:'android',projectId:'project'});
 assert.deepEqual(await adapter.requestToken(),{permission:'GRANTED',token:'ExpoPushToken[fake]'});assert.deepEqual(calls,['channel','permission','project']);
});
test('거부되면 토큰을 요청하지 않는다',async()=>{
 const adapter=createNativePushAdapter({platform:'ios',projectId:'p',secureStore:{},notifications:{getPermissionsAsync:async()=>({status:'denied',canAskAgain:false}),getExpoPushTokenAsync:()=>{throw new Error('must not call');}}});
 assert.deepEqual(await adapter.requestToken(),{permission:'DENIED',token:null});
});

test('알림 클릭을 전달하고 리스너를 정리한다',async()=>{
 let click,token;const removed=[];const data={type:'DIARY_INVITE',inviteId:'2'},seen=[];
 const notifications={addNotificationResponseReceivedListener:fn=>{click=fn;return {remove:()=>removed.push('click')};},addPushTokenListener:fn=>{token=fn;return {remove:()=>removed.push('token')};},getLastNotificationResponseAsync:async()=>null};
 const adapter=createNativePushAdapter({notifications,secureStore:{},platform:'ios',projectId:'p'});const stop=await adapter.observe({onTap:value=>seen.push(value),onTokenChanged:()=>seen.push('refresh')});
 click({notification:{request:{content:{data}}}});token();stop();assert.deepEqual(seen,[data,'refresh']);assert.deepEqual(removed,['click','token']);
});

test('Expo 토큰 발급이 지연되면 요청을 종료해 다음 동기화를 허용한다',async()=>{
 const adapter=createNativePushAdapter({platform:'ios',projectId:'p',tokenTimeoutMs:10,secureStore:{},notifications:{getPermissionsAsync:async()=>({status:'granted'}),getExpoPushTokenAsync:()=>new Promise(()=>{})}});
 await assert.rejects(adapter.requestToken(),/PUSH_TOKEN_TIMEOUT/);
});
