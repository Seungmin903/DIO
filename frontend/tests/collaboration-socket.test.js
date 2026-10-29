import test from 'node:test'
import assert from 'node:assert/strict'
import {connectCollaboration,collaborationSocketUrl} from '../src/collaboration/collaborationSocket.js'
const diaryId='10000000-0000-4000-8000-000000000001'
test('고정 API 서버의 WebSocket 경로를 사용하고 URL에는 토큰을 넣지 않는다',()=>{
 assert.equal(collaborationSocketUrl('https://dio.test/api/v1',diaryId),`wss://dio.test/ws/diaries/${diaryId}`)
 for(const base of ['https://user:secret@dio.test/api/v1','https://dio.test/api?token=secret','javascript:alert(1)'])assert.throws(()=>collaborationSocketUrl(base,diaryId))
})
test('AUTH 프레임 인증 후 변경만 전달하고 종료된 연결의 늦은 메시지를 무시한다',async()=>{
 const sockets=[],changes=[],pageChanges=[],scheduled=[]
 class Socket{constructor(url){this.url=url;this.readyState=1;this.sent=[];sockets.push(this)}send(raw){this.sent.push(JSON.parse(raw))}close(){this.closed=true}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,getAccessToken:async()=>'private-token',WebSocketImpl:Socket,
  onChange:e=>changes.push(e),onPagesChanged:()=>pageChanges.push(true),schedule:(fn,delay)=>{scheduled.push({fn,delay});return scheduled.length},cancel:()=>{}})
 const socket=sockets[0];socket.onopen();await new Promise(r=>setImmediate(r))
 assert.deepEqual(socket.sent,[{type:'AUTH',accessToken:'private-token'}]);assert.equal(socket.url.includes('private-token'),false)
 const message={type:'PAGE_CHANGED',pageId:diaryId,operationId:'1'}
 socket.onmessage({data:JSON.stringify(message)});assert.equal(changes.length,0)
 socket.onmessage({data:JSON.stringify({type:'READY',diaryId})});socket.onmessage({data:JSON.stringify(message)});assert.equal(changes.length,1)
 socket.onmessage({data:JSON.stringify({type:'PAGES_CHANGED',diaryId:'another'})});assert.equal(pageChanges.length,0)
 socket.onmessage({data:JSON.stringify({type:'PAGES_CHANGED',diaryId})});assert.equal(pageChanges.length,1)
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

test('1013 서버 정원 초과는 인증 강제 갱신 없이 백오프로 다시 연결한다',async()=>{
 const sockets=[],jobs=[],tokens=[]
 class Socket{constructor(){this.readyState=1;sockets.push(this)}send(){}close(){}}
 const client=connectCollaboration({baseUrl:'https://dio.test/api/v1',diaryId,WebSocketImpl:Socket,onChange:()=>{},getAccessToken:async options=>{tokens.push(options);return 'token'},
  schedule:(fn,delay)=>{const job={fn,delay};jobs.push(job);return job},cancel:job=>{if(job)job.cancelled=true}})
 for(let i=0;i<4;i++){
  sockets[i].onopen();await new Promise(r=>setImmediate(r));sockets[i].onclose({code:1013})
  const retry=jobs.at(-1);assert.equal(retry.delay,Math.min(30000,1000*2**i));retry.fn()
 }
 assert.equal(sockets.length,5);assert.equal(tokens.some(t=>t.forceRefresh),false);client.close()
})
