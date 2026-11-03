import test from 'node:test'
import assert from 'node:assert/strict'
import { createCollaborationDiagnostics } from '../src/collaboration/collaborationDiagnostics.js'

test('소켓 진단은 허용 단계·종료 코드만 출력한다',()=>{
 const events=[],d=createCollaborationDiagnostics({enabled:true,emit:e=>events.push(e)})
 d.socket({stage:'closed-before-ready',code:1006,reason:'secret',url:'private'});d.socket({stage:'secret',code:1008})
 assert.deepEqual(events,[{event:'ws-detail',stage:'closed-before-ready',code:1006}])
})

test('진단은 기본 꺼짐이며 원래 transport를 유지한다',()=>{
 const transport=()=>{},events=[]
 const d=createCollaborationDiagnostics({emit:e=>events.push(e)})
 assert.equal(d.transport(transport),transport);d.event('ws-ready');d.startSync()()()
 assert.equal(events.length,0)
})
test('요청·큐 시간을 기록하되 ID·토큰·본문·오류 내용은 기록하지 않는다',async()=>{
 const events=[];let time=0
 const d=createCollaborationDiagnostics({enabled:true,now:()=>time,emit:e=>events.push(e)})
 const uuid='10000000-0000-4000-8000-000000000001'
 const response={private:'body'}
 const transport=d.transport(async()=>{time+=25;return response})
 assert.equal(await transport({path:`/pages/${uuid}/canvas-operations?token=secret`,body:{secret:'private'},headers:{Authorization:'secret'}}),response)
 const start=d.startSync();time+=10;const finish=start();time+=20;finish()
 assert.deepEqual(events,[{event:'http',method:'GET',route:'/pages/{id}/canvas-operations',durationMs:25,ok:true},{event:'sync',waitMs:10,durationMs:20}])
 const error=Error('secret');await assert.rejects(d.transport(async()=>{throw error})({path:'/secret'}),error)
 assert.equal(events.at(-1).route,'other');assert.equal(JSON.stringify(events).includes('secret'),false)
})
test('진단 출력이 실패해도 저장 결과를 바꾸지 않는다',async()=>{
 const d=createCollaborationDiagnostics({enabled:true,emit:()=>{throw Error('logger')}})
 assert.equal(await d.transport(async()=>42)({path:'/pages/x'}),42)
})
