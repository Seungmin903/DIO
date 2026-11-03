import test from 'node:test'
import assert from 'node:assert/strict'
import {createDraftAutosave} from '../src/handwriting/draftAutosave.js'
import {createInkPreview,appendInkPreview,inkPreview,PREVIEW_SEGMENTS} from '../src/handwriting/inkPreview.js'
function clock(){let id=0;const tasks=new Map();return {schedule:fn=>{tasks.set(++id,fn);return id},cancel:id=>tasks.delete(id),fire:()=>{const todo=[...tasks.values()];tasks.clear();todo.forEach(fn=>fn())},get size(){return tasks.size}}}
const tick=()=>new Promise(r=>setImmediate(r))
test('연속 획은 최신 원본 하나로 묶고 필기 중 저장을 시작하지 않으며 flush로 확정한다',async()=>{
 const timer=clock(),writes=[],status=[]
 const saver=createDraftAutosave({...timer,save:async value=>writes.push(value),onStatus:s=>status.push(s)})
 for(let i=0;i<100;i++)saver.update({draft:{samples:{값:{strokes:Array(i+1).fill({width:24,points:[{x:1.2345,y:2.3456}]})}}}})
 assert.equal(timer.size,1);saver.setWriting(true);assert.equal(timer.size,0);timer.fire();await tick();assert.equal(writes.length,0)
 saver.setWriting(false);await saver.flush()
 assert.equal(writes.length,1);assert.equal(writes[0].draft.samples.값.strokes.length,100)
 assert.equal(writes[0].draft.samples.값.strokes[0].points[0].x,1.2345)
 assert.equal(status.at(-1).pending,false)
 await saver.dispose()
})
test('진행 중 저장 뒤 도착한 입력도 flush가 기다리며 실패 후 재시도에서 보존한다',async()=>{
 const timer=clock(),writes=[];let complete,fail=false
 const saver=createDraftAutosave({...timer,save:value=>{writes.push(value);if(fail)throw Error('disk');return writes.length===1?new Promise(r=>complete=r):Promise.resolve()}})
 saver.update(1);timer.fire();await tick();saver.update(2)
 let done=false;const flush=saver.flush().then(()=>done=true);await tick();assert.equal(done,false)
 complete();await flush;assert.deepEqual(writes,[1,2])
 fail=true;saver.update(3);await assert.rejects(saver.flush(),/disk/);fail=false;await saver.flush();assert.deepEqual(writes,[1,2,3,3])
 saver.update(4);await saver.dispose();assert.equal(writes.at(-1),4)
})
test('긴 획 미리보기는 원본 좌표와 구간 연결을 보존하며 변경 경로 길이를 제한한다',()=>{
 const point=i=>({x:i/5+0.123456,y:300+Math.sin(i/20)*100}),first=point(0),ink=createInkPreview(first)
 let legacy='',oldBytes=0,newBytes=0
 for(let i=1;i<5000;i++){
  const p=point(i),before={...p};appendInkPreview(ink,p);assert.deepEqual(p,before)
  legacy+=` L${p.x},${p.y}`
  if(i%4===0){oldBytes+=legacy.length;newBytes+=ink.tail.length}
  assert.ok(ink.segments<=PREVIEW_SEGMENTS)
 }
 const snapshot=inkPreview(ink);assert.equal(snapshot.parts.length,104);assert.ok(newBytes<oldBytes*.03)
 for(let i=1;i<snapshot.parts.length;i++) assert.equal(snapshot.parts[i].split(' ')[0].slice(1),snapshot.parts[i-1].split(' ').at(-1).slice(1))
 const frozen=snapshot.parts[0];appendInkPreview(ink,point(5000));assert.equal(ink.parts[0],frozen)
})
