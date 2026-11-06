import test from 'node:test'
import assert from 'node:assert/strict'
import {connectCollaboration,collaborationSocketUrl} from '../src/collaboration/collaborationSocket.js'
const diaryId='10000000-0000-4000-8000-000000000001'

test('오류와 종료의 불가 신호는 연결 시도당 한 번이며 재연결은 별도로 기록한다',()=>{
 const sockets=[],jobs=[];let unavailable=0
 class Socket{constructor(){this.readyState=1;sockets.push(this)}send(){}close(){}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,getAccessToken:async()=>'token',onChange:()=>{},WebSocketImpl:Socket,
  onUnavailable:()=>unavailable++,schedule:(fn,delay)=>{jobs.push({fn,delay});return jobs.length},cancel:()=>{}})
 sockets[0].onerror();sockets[0].onerror();sockets[0].onclose({code:1006})
 assert.equal(unavailable,1);assert.equal(jobs.length,1);assert.equal(jobs[0].delay,1000)
 jobs[0].fn();sockets[0].onerror();assert.equal(unavailable,1)
 sockets[1].onclose({code:1006});assert.equal(unavailable,2);assert.equal(jobs[1].delay,2000)
 client.close();sockets[1].onerror();assert.equal(unavailable,2)
})

test('연결 실패 진단은 open·READY 전 종료 코드만 전달하고 사유와 토큰은 제외한다',()=>{
 let socket;const events=[]
 class Socket{constructor(){socket=this;this.readyState=1}send(){}close(){}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,getAccessToken:async()=>'secret',onChange:()=>{},WebSocketImpl:Socket,onDiagnostic:e=>events.push(e),schedule:()=>1,cancel:()=>{}})
 socket.onopen();socket.onclose({code:1006,reason:"Expected HTTP 101 response but was '403 Forbidden' private detail"})
 assert.deepEqual(events,[{stage:'open'},{stage:'closed-before-ready',code:1006},{stage:'handshake-http',code:403}]);client.close()
})
test('고정 API 서버의 WebSocket 경로를 사용하고 URL에는 토큰을 넣지 않는다',()=>{
 assert.equal(collaborationSocketUrl('https://dio.test/api/v1',diaryId),`wss://dio.test/ws/diaries/${diaryId}`)
 for(const base of ['https://user:secret@dio.test/api/v1','https://dio.test/api?token=secret','javascript:alert(1)'])assert.throws(()=>collaborationSocketUrl(base,diaryId))
})
test('AUTH 프레임 인증 후 캔버스·페이지·참여자 변경만 전달하고 종료된 연결의 늦은 메시지를 무시한다',async()=>{
 const sockets=[],changes=[],pageChanges=[],memberChanges=[],scheduled=[]
 class Socket{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this)}send(raw){this.sent.push(JSON.parse(raw))}close(){this.closed=true}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,getAccessToken:async()=>'private-token',WebSocketImpl:Socket,
  onChange:e=>changes.push(e),onPagesChanged:()=>pageChanges.push(true),onMembersChanged:()=>memberChanges.push(true),schedule:(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length},cancel:()=>{}})
 const socket=sockets[0];socket.onopen();await new Promise(r=>setImmediate(r))
 assert.deepEqual(socket.sent,[{type:'AUTH',accessToken:'private-token'}]);assert.equal(socket.url.includes('private-token'),false)
 const message={type:'PAGE_CHANGED',pageId:diaryId,operationId:'1'}
 socket.onmessage({data:JSON.stringify(message)});assert.equal(changes.length,0)
 socket.onmessage({data:JSON.stringify({type:'READY',diaryId})});socket.onmessage({data:JSON.stringify(message)});assert.equal(changes.length,1)
 socket.onmessage({data:JSON.stringify({type:'PAGES_CHANGED',diaryId:'another'})});assert.equal(pageChanges.length,0)
 socket.onmessage({data:JSON.stringify({type:'PAGES_CHANGED',diaryId})});assert.equal(pageChanges.length,1)
 socket.onmessage({data:JSON.stringify({type:'MEMBERS_CHANGED',diaryId:'another'})});assert.equal(memberChanges.length,0)
 socket.onmessage({data:JSON.stringify({type:'MEMBERS_CHANGED',diaryId})});assert.equal(memberChanges.length,1)
 client.close();socket.onmessage({data:JSON.stringify(message)});assert.equal(changes.length,1);assert.equal(socket.closed,true)
})

test('1008 이후 토큰 갱신으로 재접속하고 READY 없는 반복 거절은 두 번만 재시도한다',async()=>{
 const sockets=[],scheduled=[],tokens=[]
 class Socket{constructor(){this.readyState=1;this.sent=[];sockets.push(this)}send(raw){this.sent.push(JSON.parse(raw))}close(){}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,WebSocketImpl:Socket,onChange:()=>{},
  getAccessToken:async options=>{tokens.push(options);return options.forceRefresh?'renewed':'initial'},
  schedule:(fn,delay)=>{const job={fn,delay};scheduled.push(job);return job},cancel:job=>{if(job)job.cancelled=true}})
 const flush=()=>new Promise(r=>setImmediate(r))
 sockets[0].onopen();await flush();sockets[0].onmessage({data:JSON.stringify({type:'READY',diaryId})})
 sockets[0].onclose({code:1008});let job=scheduled.find(j=>!j.cancelled&&j.delay===1000);job.fn();sockets[1].onopen();await flush()
 assert.equal(sockets[1].sent[0].accessToken,'renewed');assert.equal(tokens[1].forceRefresh,true)
 sockets[1].onclose({code:1008});job=scheduled.find(j=>!j.cancelled&&j.delay===2000);job.fn();sockets[2].onopen();await flush()
 const count=scheduled.length;sockets[2].onclose({code:1008});assert.equal(scheduled.length,count);client.close()
})

for(const code of [1011,1013])test(`${code} 일시 오류는 인증 강제 갱신 없이 백오프로 다시 연결한다`,async()=>{
 const sockets=[],jobs=[],tokens=[]
 class Socket{constructor(){this.readyState=1;sockets.push(this)}send(){}close(){}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,WebSocketImpl:Socket,onChange:()=>{},getAccessToken:async options=>{tokens.push(options);return 'token'},
  schedule:(fn,delay)=>{const job={fn,delay};jobs.push(job);return job},cancel:job=>{if(job)job.cancelled=true}})
 for(let i=0;i<4;i++){
  sockets[i].onopen();await new Promise(r=>setImmediate(r));sockets[i].onclose({code})
  const retry=jobs.at(-1);assert.equal(retry.delay,Math.min(30000,1000*2**i));retry.fn()
 }
 assert.equal(sockets.length,5);assert.equal(tokens.some(t=>t.forceRefresh),false);client.close()
})
