import test from 'node:test'
import assert from 'node:assert/strict'
import { createReadingPreviewCache, readingPreviewSpec, readingPreviewEligible, READING_PREVIEW_PIXELS } from '../src/editor/utils/readingPreviewCache.js'
const page = id => ({ id, canvasWidth: 100, canvasHeight: 100, objects: Array.from({ length: 32 }, (_, i) => ({ id: 's' + i, type: 'stroke' })) })
const spec = p => readingPreviewSpec(p, 1, 2)
const until = async check => { const end = Date.now() + 2000; while (!check()) { if (Date.now() > end) throw Error('preview wait timeout'); await new Promise(done => setTimeout(done, 5)) } }

test('현재·인접 최대 3장만 순서대로 준비하고 같은 페이지를 중복 생성하지 않는다', async () => {
  const releases = [], calls = [], pages = ['a','b','c','d'].map(page)
  let active = 0, maxActive = 0
  const cache = createReadingPreviewCache({ delayMs: 0, render: async s => {
    active++; maxActive = Math.max(maxActive, active); calls.push(s.page.id)
    await new Promise(done => setTimeout(done, 2)); active--
    return { uri: s.page.id, dispose: () => releases.push(s.page.id) }
  } })
  assert.equal(cache.get(undefined), null)
  cache.update(pages.map(spec)); await until(() => cache.stats().pages === 3)
  assert.deepEqual(calls, ['a','b','c']); assert.equal(maxActive, 1)
  assert.equal(cache.get(spec(pages[0])).uri, 'a')
  cache.update(pages.slice(1).map(spec)); await until(() => cache.get(spec(pages[3])))
  assert.deepEqual(calls, ['a','b','c','d']); assert.deepEqual(releases, ['a'])
  assert.ok(cache.stats().pixels <= READING_PREVIEW_PIXELS * 3)
  cache.dispose(); assert.deepEqual(releases.sort(), ['a','b','c','d'])
})
test('협업 변경·해상도 변경은 오래된 이미지를 즉시 무효화한다', async () => {
  let released = 0
  const cache = createReadingPreviewCache({delayMs:0, render: async () => ({uri:'preview',dispose:()=>released++})})
  const original = page('same'); cache.update([spec(original)]); await until(() => cache.get(spec(original)))
  const changed = {...original,objects:[...original.objects]}
  assert.equal(cache.get(spec(changed)),null)
  assert.equal(cache.get(readingPreviewSpec(original,2,2)),null)
  cache.update([spec(changed)]); assert.equal(released,1)
  await until(() => cache.get(spec(changed))); cache.dispose(); assert.equal(released,2)
})
test('취소 후 늦게 완료된 캡처는 등록하지 않고 해제하며 다음 요청을 계속한다', async () => {
  let finish, released = 0, aborted = false
  const a=page('a'),b=page('b')
  const cache=createReadingPreviewCache({delayMs:0, render: async (s,{signal}) => {
    if(s.page===a){signal.addEventListener('abort',()=>{aborted=true});await new Promise(done=>{finish=done})}
    return {uri:s.page.id,dispose:()=>released++}
  }})
  cache.update([spec(a)]); await until(()=>finish)
  cache.update([spec(b)]); assert.equal(aborted,true)
  finish();await until(()=>cache.get(spec(b)))
  assert.equal(cache.get(spec(a)),null); assert.equal(released,1)
  cache.dispose();assert.equal(released,2)
})
test('페이지 넘김 중 새 준비를 멈추고 바쁜 작업기는 재시도하며 오류는 원본으로 남긴다',async()=>{
  let calls=0, released=0
  const p=page('p')
  const cache=createReadingPreviewCache({delayMs:0,render:async()=>{
    calls++; if(calls===1)throw Object.assign(Error('busy'),{code:'EXPORT_BUSY'})
    return {uri:'p',dispose:()=>released++}
  }})
  cache.update([spec(p)],true);await new Promise(done=>setTimeout(done,10));assert.equal(calls,0)
  cache.update([spec(p)]);await until(()=>cache.get(spec(p)));assert.equal(calls,2)
  cache.clear();assert.equal(released,1);cache.dispose()
  let failures=0
  const failed=createReadingPreviewCache({delayMs:0,render:async()=>{failures++;throw Error('capture failed')}})
  failed.update([spec(p)]);await until(()=>failures===1);await new Promise(done=>setTimeout(done,10))
  assert.equal(failed.get(spec(p)),null);assert.equal(failures,1);failed.dispose()
})
test('GIF·동적 위젯·작은 페이지는 이미지로 굳히지 않고 확대 시 원본 해상도를 유지한다',()=>{
  const p=page('p');assert.equal(readingPreviewEligible(p),true)
  assert.equal(readingPreviewEligible({...p,objects:[]}),false)
  for(const item of [{src:'data:image/gif;base64,abc'},{src:'file:///a.gif'},{poster:'file:///a.png'},{widget:'clock'},{cells:[{src:'file:///a.gif'}]}])assert.equal(readingPreviewEligible({...p,objects:[...p.objects,{id:'dynamic',type:'sticker',...item}]}),false)
  assert.equal(readingPreviewEligible({...p,planner:{}}),false)
  assert.equal(readingPreviewEligible({...p,objects:[...p.objects,{id:'gif',type:'photo'}]},o=>o.id==='gif'),false)
  assert.equal(readingPreviewSpec(p,100,3),null)
  assert.equal(readingPreviewSpec(p,0,2),null)
  const exact=readingPreviewSpec(p,1.25,2);assert.equal(exact.pixelWidth,250);assert.equal(exact.pixelHeight,250)
})
