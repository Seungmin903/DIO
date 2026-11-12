import test from 'node:test'
import assert from 'node:assert/strict'
import {createMediaThumbnailCache} from '../src/diary/services/mediaThumbnailCache.js'
const png=new Uint8Array([137,80,78,71,13,10,26,10])
const tick=()=>new Promise(resolve=>setImmediate(resolve))
test('최대 2개 요청·동일 ID 병합·로컬 캐시 재사용·종료 뒤 응답 차단',async()=>{
 const disk=new Map(),released=[],gates=[];let active=true,running=0,peak=0,downloads=0
 const files={read:async id=>disk.get(id),write:async(id)=>{disk.set(id,`uri:${id}`);return `uri:${id}`},remove:async id=>disk.delete(id),release:uri=>released.push(uri)}
 const cache=createMediaThumbnailCache({files,active:()=>assert.equal(active,true),request:async id=>{
  downloads++;running++;peak=Math.max(peak,running);await new Promise(resolve=>gates.push(resolve));running--;return png
 }})
 const tasks=Array.from({length:9},(_,i)=>cache.load(String(i)))
 assert.equal(cache.load('0'),tasks[0]);await tick();assert.equal(downloads,2)
 while(gates.length||downloads<9){gates.splice(0).forEach(resolve=>resolve());await tick()}
 await Promise.all(tasks);assert.equal(peak,2);assert.equal(downloads,9)
 assert.equal(await cache.load('0'),'uri:0');assert.equal(downloads,9)
 cache.dispose();assert.equal(released.length,9);assert.throws(()=>cache.load('0'))
 const restored=createMediaThumbnailCache({files,active:()=>assert.equal(active,true),request:()=>assert.fail('디스크 캐시가 있으면 요청 금지')})
 assert.equal(await restored.load('0'),'uri:0');active=false;assert.throws(()=>restored.load('0'));restored.dispose()
})
test('429·503은 제한된 백오프로 자동 복구하고 영구 오류는 재시도하지 않는다',async()=>{
 const files={read:async()=>null,write:async()=> 'uri',remove:async()=>{}},waits=[]
 let attempts=0
 const cache=createMediaThumbnailCache({files,active:()=>{},sleep:async ms=>waits.push(ms),request:async()=>{
  attempts++;if(attempts<3)throw Object.assign(Error('busy'),{status:attempts===1?503:429});return png
 }})
 assert.equal(await cache.load('recover'),'uri');assert.equal(attempts,3)
 assert.equal(waits.length,2);assert.ok(waits[0]>=400&&waits[0]<500);assert.ok(waits[1]>=1000&&waits[1]<1100)
 for(const status of [401,403,404,503]){
  let count=0
  const failing=createMediaThumbnailCache({files,active:()=>{},sleep:async()=>{},request:async()=>{count++;throw Object.assign(Error('fail'),{status})}})
  await assert.rejects(failing.load('fail'),{status});assert.equal(count,status===503?4:1)
 }
})
test('백오프 중 패널을 종료하거나 계정이 바뀌면 추가 요청을 하지 않는다',async()=>{
 for(const mode of ['dispose','account']){
  let count=0,resume,active=true
  const cache=createMediaThumbnailCache({files:{read:async()=>null},active:()=>{if(!active)throw Error('changed')},sleep:()=>new Promise(resolve=>{resume=resolve}),request:async()=>{count++;throw Object.assign(Error('busy'),{status:503})}})
  const pending=cache.load('id');await tick()
  if(mode==='dispose')cache.dispose();else active=false
  resume();await assert.rejects(pending);assert.equal(count,1)
 }
})
test('손상 응답은 캐시하지 않고 실패 후 재시도하며 오래 걸린 계정 전환 응답도 표시하지 않는다',async()=>{
 let response=new Uint8Array([1]),writes=0,current=true,release
 const files={read:async()=>null,write:async()=>{writes++;return 'uri'},remove:async()=>{}}
 const cache=createMediaThumbnailCache({files,active:()=>{if(!current)throw Error('changed')},request:async()=>response})
 await assert.rejects(cache.load('id'));assert.equal(writes,0)
 response=png;assert.equal(await cache.load('id'),'uri');assert.equal(writes,1)
 const delayed=createMediaThumbnailCache({files,active:()=>{if(!current)throw Error('changed')},request:()=>new Promise(resolve=>{release=resolve})})
 const task=delayed.load('other');await tick();current=false;release(png);await assert.rejects(task,/changed/);assert.equal(writes,1)
})
