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
