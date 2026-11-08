import test from 'node:test'
import assert from 'node:assert/strict'
import {sameElements,canvasDelta} from '../src/collaboration/canvasApi.js'

const uuid=n=>`30000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const text=(n,value='A')=>({id:uuid(n),type:'text',text:value,x:1,y:2,w:40,h:20})
// 본문을 읽으면(인코딩하면) reads 가 오른다
const counted=(object,reads)=>{Object.defineProperty(object,'text',{enumerable:true,get(){reads.n++;return 'untouched'}});return object}

test('요소 비교는 길이가 다르면 인코딩 없이 다르고, 같은 객체는 인코딩하지 않으며, 처음 다른 요소에서 멈춘다',()=>{
  const reads={n:0};const all=Array.from({length:300},(_,i)=>counted(text(i+1),reads))
  assert.equal(sameElements(all,[...all,text(301)]),false);assert.equal(reads.n,0,'길이가 다르면 바로 다르다')
  assert.equal(sameElements(all,[...all]),true);assert.equal(reads.n,0,'같은 객체는 인코딩하지 않는다')
  const moved=[...all];moved[0]={...all[0],x:9}
  assert.equal(sameElements(all,moved),false);assert.ok(reads.n<=2,'첫 요소에서 멈춘다')
  const sameContent=[{...all[0]},...all.slice(1)]
  assert.equal(sameElements(all,sameContent),true)
})

test('편집 전후 차이는 같은 객체를 건너뛰고 바뀐 요소·순서만 찾는다',()=>{
  const reads={n:0};const all=Array.from({length:200},(_,i)=>counted(text(i+1),reads))
  const added=text(201,'new'),changed={...all[5],x:7}
  const after=[...all.slice(0,5),changed,...all.slice(6),added]
  const delta=canvasDelta(all,after)
  assert.equal(delta.reordered,false);assert.deepEqual(delta.touched,[all[5].id,added.id]);assert.ok(reads.n<=2)
  assert.equal(delta.old.has(all[5].id),true);assert.equal(delta.next.has(added.id),true);assert.equal(delta.old.has(added.id),false)
  const reordered=canvasDelta(all.slice(0,3),[all[1],all[0],all[2]])
  assert.equal(reordered.reordered,true);assert.deepEqual(reordered.touched,all.slice(0,3).map(o=>o.id))
  assert.deepEqual(canvasDelta(all.slice(0,2),[all[1]]).touched,[all[0].id],'지운 요소')
})
