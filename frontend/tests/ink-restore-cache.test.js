import test from 'node:test'
import assert from 'node:assert/strict'
import { createInkRestoreCache } from '../src/editor/utils/inkRestoreCache.js'
import { sameQASnapshot } from '../qa/snapshot-equality.js'

test('정밀 경로는 동일 객체만 재사용하며 변경된 객체는 다시 계산한다', () => {
  const cache=createInkRestoreCache(),a={points:[{x:1}]},b={...a,points:[{x:2}]};let calls=0
  const build=()=>{calls++;return ['M0 0L1 1Z']}
  const first=cache.get(a,build),reuse=cache.get(a,build),changed=cache.get(b,build)
  assert.equal(reuse.paths,first.paths);assert.equal(reuse.hit,true);assert.equal(changed.hit,false);assert.equal(calls,2)
})
test('문자/객체 예산 초과는 오래된 경로를 비우고 큰 경로를 보관하지 않는다', () => {
  const cache=createInkRestoreCache({maxChars:10,maxEntries:2}),a={},b={},c={}
  cache.get(a,()=>['123456']);cache.get(b,()=>['123456'])
  assert.deepEqual(cache.stats(),{entries:1,chars:6})
  assert.equal(cache.get(a,()=>['123456']).hit,false)
  cache.get(c,()=>['12345678901']);assert.deepEqual(cache.stats(),{entries:1,chars:6})
})
test('QA 대조는 불변 참조/복제 데이터를 허용하지만 좌표·센서·메타데이터 차이를 찾는다', () => {
  const a=[{id:'a',points:[{x:1,y:2,force:.2}],renderVersion:3}]
  assert.equal(sameQASnapshot(a,[...a]),true)
  assert.equal(sameQASnapshot(a,JSON.parse(JSON.stringify(a))),true)
  for(const patch of [{points:[{x:1,y:2,force:.3}]},{points:[{x:2,y:2,force:.2}]},{renderVersion:2}])assert.equal(sameQASnapshot(a,[{...a[0],...patch}]),false)
  assert.equal(sameQASnapshot([{x:undefined}],[{}]),false)
})

test('지우개 조각 경로는 초기 원본 복구 물량 때문에 즉시 퇴출되지 않는다', () => {
  const cache=createInkRestoreCache({maxChars:10,maxEntries:2}),fragment={}
  const exact=cache.get(fragment,()=>['123456'],1)
  for(let i=0;i<20;i++)cache.get({},()=>['123456'],0)
  assert.equal(cache.get(fragment,()=>{throw Error('recomputed')},1).paths,exact.paths)
  assert.ok(cache.stats().chars<=10)
})

test('용량보다 큰 순차 재방문이 남아 있는 재사용 경로까지 밀어내지 않는다', () => {
  const cache=createInkRestoreCache({maxChars:40,maxEntries:4}),objects=Array.from({length:12},()=>({}))
  for(const object of objects)cache.get(object,()=>['1234567890'],1)
  for(let sweep=0;sweep<2;sweep++) {
    let hits=0
    for(const object of objects)hits+=Number(cache.get(object,()=>['1234567890'],1).hit)
    assert.equal(hits,4);assert.deepEqual(cache.stats(),{entries:4,chars:40})
  }
})
