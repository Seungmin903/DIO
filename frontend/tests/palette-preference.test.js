import test from 'node:test'
import assert from 'node:assert/strict'
import { createPalettePreference } from '../src/editor/utils/palettePreference.js'
import { normalizeHex } from '../src/editor/utils/penSettings.js'
const defaults=['#111111','#222222','#333333']
function setup(saved) {
 const disk = new Map(saved == null ? [] : [['palette',saved]]), writes=[]
 const storage={getItem:async key=>disk.get(key),setItem:async(key,value)=>{disk.set(key,value);writes.push(value)},removeItem:async key=>disk.delete(key)}
 return {disk,writes,storage,store:createPalettePreference(storage,'palette',defaults,normalizeHex)}
}
test('팔레트는 기존 칸을 교체하고 같은 색도 합치지 않으며 재실행 후 복원한다',async()=>{
 const {store,storage,writes}=setup();await store.load();await store.replace(1,'#111111')
 assert.deepEqual(store.getSnapshot().colors,['#111111','#111111','#333333']);assert.equal(store.getSnapshot().colors.length,defaults.length)
 const restored=createPalettePreference(storage,'palette',defaults,normalizeHex);await restored.load();assert.deepEqual(restored.getSnapshot(),store.getSnapshot());assert.equal(writes.length,1)
 await assert.rejects(store.replace(3,'#FFFFFF'));await assert.rejects(store.replace(-1,'#FFFFFF'));assert.equal(writes.length,1)
})
test('늦은 복원 중 변경은 기존 저장값 뒤에 적용되고 연속 교체도 순서를 보존한다',async()=>{
 let resolve;const read=new Promise(done=>resolve=done);const {storage}=setup();storage.getItem=()=>read
 const store=createPalettePreference(storage,'palette',defaults,normalizeHex)
 const a=store.replace(0,'#ABCDEF'),b=store.replace(2,'#654321');resolve('["#444444","#555555","#666666"]');await Promise.all([a,b])
 assert.deepEqual(store.getSnapshot().colors,['#ABCDEF','#555555','#654321'])
})
test('손상·구형 팔레트는 기본 칸 수를 복원하고 이전 내 색상 저장소는 읽지 않는다',async()=>{
 for(const raw of ['broken','["#AAA"]','["#111111",null,"bad","#FFFFFF"]']){
  const {store}=setup(raw);await store.load();assert.equal(store.getSnapshot().colors.length,3)
 }
 const calls=[];const store=createPalettePreference({getItem:async k=>{calls.push(k);return null}},'palette',defaults,normalizeHex)
 await store.load();assert.deepEqual(calls,['palette'])
})
test('읽기·쓰기 실패는 기존 팔레트를 지키며 다음 시도에서 저장하고 기본값으로 복구한다',async()=>{
 const {storage,disk}=setup('["#444444","#555555","#666666"]');let readFailure=true,writeFailure=true
 const store=createPalettePreference({...storage,getItem:async key=>{if(readFailure)throw Error('read');return storage.getItem(key)},setItem:async(...args)=>{if(writeFailure)throw Error('full');return storage.setItem(...args)}},'palette',defaults,normalizeHex)
 await assert.rejects(store.replace(0,'#ABCDEF'));assert.equal(disk.get('palette'),'["#444444","#555555","#666666"]')
 readFailure=false;await assert.rejects(store.replace(0,'#ABCDEF'));assert.deepEqual(store.getSnapshot().colors,['#444444','#555555','#666666'])
 writeFailure=false;await store.replace(0,'#ABCDEF');await store.reset();assert.equal(disk.has('palette'),false);assert.deepEqual(store.getSnapshot().colors,defaults)
})
